import Foundation

#if canImport(CoreAI)
import CoreAI

/// A loaded .aimodel whose functions JS calls by name. Inputs and outputs
/// cross the bridge as `{ dataType, shape, data }`, with `data` holding the
/// little-endian elements in row-major order as base64. Every call copies its
/// tensors, so JS never holds native memory, and functions stay loaded with
/// their weights until the model is unloaded
@available(iOS 27, macOS 27, *)
final class RawModel: @unchecked Sendable {
  private let model: AIModel
  private let lock = NSLock()
  private var functions: [String: InferenceFunction] = [:]

  init(model: AIModel) {
    self.model = model
  }

  var functionNames: [String] {
    return model.functionNames
  }

  func run(
    _ functionName: String,
    inputs: [String: Any],
    keepsHalfPrecision: Bool
  ) async throws -> [String: Any] {
    let function = try loadFunction(functionName)
    let descriptor = function.descriptor

    var arrays: [String: NDArray] = [:]
    for name in descriptor.inputNames {
      guard let tensor = inputs[name] as? [String: Any] else {
        throw CoreAIError.invalidInput(
          "Missing input \"\(name)\" for \(functionName). It takes \(descriptor.inputNames.joined(separator: ", "))."
        )
      }
      guard case .ndArray(let arrayDescriptor) = descriptor.inputDescriptor(of: name) else {
        throw CoreAIError.invalidInput("Input \"\(name)\" is an image, which raw function calls do not support yet.")
      }
      arrays[name] = try Self.makeArray(tensor, name: name, descriptor: arrayDescriptor)
    }
    let unknown = Set(inputs.keys).subtracting(descriptor.inputNames)
    if !unknown.isEmpty {
      throw CoreAIError.invalidInput(
        "\(functionName) has no input named \(unknown.sorted().joined(separator: ", ")). It takes \(descriptor.inputNames.joined(separator: ", "))."
      )
    }

    var outputs = try await function.run(inputs: arrays)
    var result: [String: Any] = [:]
    for name in descriptor.outputNames {
      guard let array = outputs.remove(name)?.ndArray else { continue }
      result[name] = try Self.serialize(array, keepsHalfPrecision: keepsHalfPrecision)
    }
    return result
  }

  func loadFunction(_ name: String) throws -> InferenceFunction {
    lock.lock()
    defer { lock.unlock() }
    if let function = functions[name] {
      return function
    }
    guard let function = try model.loadFunction(named: name) else {
      throw CoreAIError.invalidInput(
        "The model has no function named \"\(name)\". It has \(model.functionNames.joined(separator: ", "))."
      )
    }
    functions[name] = function
    return function
  }
}

@available(iOS 27, macOS 27, *)
extension RawModel {
  /// Data types that cross the bridge, with their element size in bytes
  static let dataTypes: [(name: String, type: NDArray.ScalarType, size: Int)] = [
    ("float32", .float32, 4),
    ("float16", .float16, 2),
    ("bfloat16", .bfloat16, 2),
    ("float64", .float64, 8),
    ("int8", .int8, 1),
    ("int16", .int16, 2),
    ("int32", .int32, 4),
    ("int64", .int64, 8),
    ("uint8", .uint8, 1),
    ("uint16", .uint16, 2),
    ("uint32", .uint32, 4),
    ("uint64", .uint64, 8),
    ("bool", .bool, 1),
  ]

  /// The compute unit Core AI specializes the model for, from options.computeUnits
  static func specializationOptions(_ options: [String: Any]?) throws -> SpecializationOptions {
    switch options?["computeUnits"] as? String {
    case nil, "default":
      return .default
    case "cpu":
      return .cpuOnly
    case "gpu":
      return SpecializationOptions(preferredComputeUnitKind: .gpu)
    case "neural-engine":
      return SpecializationOptions(preferredComputeUnitKind: .neuralEngine)
    case let value?:
      throw CoreAIError.invalidInput("computeUnits must be default, cpu, gpu or neural-engine, got \(value).")
    }
  }

  static func name(of type: NDArray.ScalarType) -> String {
    return dataTypes.first { $0.type == type }?.name ?? String(describing: type)
  }

  static func size(of type: NDArray.ScalarType) throws -> Int {
    guard let size = dataTypes.first(where: { $0.type == type })?.size else {
      throw CoreAIError.invalidInput("Raw function calls do not support \(type) tensors yet.")
    }
    return size
  }

  static func describeTensor(_ name: String, _ descriptor: InferenceValue.Descriptor?) -> [String: Any] {
    switch descriptor {
    case .ndArray(let array):
      // -1 marks a dynamic dimension
      return ["name": name, "dataType": Self.name(of: array.scalarType), "shape": array.shape]
    case .image(let image):
      return ["name": name, "dataType": "image", "shape": [image.height, image.width]]
    case nil:
      return ["name": name]
    }
  }

  private static func makeArray(
    _ tensor: [String: Any],
    name: String,
    descriptor: NDArrayDescriptor
  ) throws -> NDArray {
    let shape = (tensor["shape"] as? [Any])?.compactMap { ($0 as? NSNumber)?.intValue } ?? descriptor.shape
    guard shape.count == descriptor.rank,
          zip(shape, descriptor.shape).allSatisfy({ $1 == -1 || $0 == $1 }),
          shape.allSatisfy({ $0 > 0 }) else {
      throw CoreAIError.invalidInput("Input \"\(name)\" has shape \(shape), but the function takes \(descriptor.shape).")
    }
    guard let base64 = tensor["data"] as? String, var data = Data(base64Encoded: base64) else {
      throw CoreAIError.invalidInput("Input \"\(name)\" needs its data as base64.")
    }

    let tensorType = descriptor.scalarType
    let dataType = tensor["dataType"] as? String ?? Self.name(of: tensorType)
    if dataType != Self.name(of: tensorType) {
      // Hermes has no Float16Array, so half-precision tensors take float32
      guard dataType == "float32", tensorType == .float16 || tensorType == .bfloat16 else {
        throw CoreAIError.invalidInput(
          "Input \"\(name)\" is \(Self.name(of: tensorType)), not \(dataType)."
        )
      }
      data = halfPrecision(fromFloat32: data, as: tensorType)
    }

    let elementSize = try size(of: tensorType)
    let count = shape.reduce(1, *)
    guard data.count == count * elementSize else {
      throw CoreAIError.invalidInput(
        "Input \"\(name)\" needs \(count * elementSize) bytes of \(Self.name(of: tensorType)) for shape \(shape), got \(data.count)."
      )
    }

    var array = NDArray(descriptor: descriptor.hasDynamicShape ? descriptor.resolvingDynamicDimensions(shape) : descriptor)
    data.withUnsafeBytes { source in
      array.mutableRawView().withUnsafeMutableBytes { destination, shape, strides in
        forEachElement(shape: shape, strides: strides) { index, offset in
          (destination + offset * elementSize).copyMemory(from: source.baseAddress! + index * elementSize, byteCount: elementSize)
        }
      }
    }
    return array
  }

  private static func serialize(_ array: NDArray, keepsHalfPrecision: Bool) throws -> [String: Any] {
    let elementSize = try size(of: array.scalarType)
    let count = array.shape.reduce(1, *)
    var data = Data(count: count * elementSize)
    data.withUnsafeMutableBytes { destination in
      array.rawView().withUnsafeBytes { source, shape, strides in
        forEachElement(shape: shape, strides: strides) { index, offset in
          (destination.baseAddress! + index * elementSize).copyMemory(from: source + offset * elementSize, byteCount: elementSize)
        }
      }
    }

    var dataType = name(of: array.scalarType)
    if !keepsHalfPrecision, array.scalarType == .float16 || array.scalarType == .bfloat16 {
      data = float32(fromHalfPrecision: data, as: array.scalarType)
      dataType = "float32"
    }
    return ["dataType": dataType, "shape": array.shape, "data": data.base64EncodedString()]
  }

  /// Calls body with the row-major index of each element and its offset in
  /// elements, following strides that may pad rows for the hardware
  static func forEachElement(
    shape: Span<Int>,
    strides: Span<Int>,
    _ body: (_ index: Int, _ offset: Int) -> Void
  ) {
    let rank = shape.count
    var count = 1
    var isContiguous = true
    var expectedStride = 1
    for dimension in (0..<rank).reversed() {
      count *= shape[dimension]
      if strides[dimension] != expectedStride {
        isContiguous = false
      }
      expectedStride *= shape[dimension]
    }
    if isContiguous {
      for index in 0..<count {
        body(index, index)
      }
      return
    }

    var indices = [Int](repeating: 0, count: rank)
    var offset = 0
    for index in 0..<count {
      body(index, offset)
      var dimension = rank - 1
      while dimension >= 0 {
        indices[dimension] += 1
        offset += strides[dimension]
        if indices[dimension] < shape[dimension] { break }
        offset -= strides[dimension] * shape[dimension]
        indices[dimension] = 0
        dimension -= 1
      }
    }
  }

  static func halfPrecision(fromFloat32 data: Data, as type: NDArray.ScalarType) -> Data {
    let floats = data.withUnsafeBytes { Array($0.bindMemory(to: Float.self)) }
    var bits = [UInt16](repeating: 0, count: floats.count)
    for (index, value) in floats.enumerated() {
      if type == .bfloat16 {
        // Round to nearest even on the bits dropped from the mantissa
        let pattern = value.bitPattern
        bits[index] = UInt16((pattern &+ 0x7FFF &+ ((pattern >> 16) & 1)) >> 16)
      } else {
        bits[index] = Float16(value).bitPattern
      }
    }
    return bits.withUnsafeBytes { Data($0) }
  }

  static func float32(fromHalfPrecision data: Data, as type: NDArray.ScalarType) -> Data {
    let bits = data.withUnsafeBytes { Array($0.bindMemory(to: UInt16.self)) }
    let floats = bits.map { value in
      type == .bfloat16 ? Float(bitPattern: UInt32(value) << 16) : Float(Float16(bitPattern: value))
    }
    return floats.withUnsafeBytes { Data($0) }
  }
}

@available(iOS 27, macOS 27, *)
extension CoreAIImpl {
  static func describeFunctions(of model: AIModel) -> [[String: Any]] {
    return model.functionNames.compactMap { name in
      guard let descriptor = model.functionDescriptor(for: name) else { return nil }
      return [
        "name": name,
        "inputs": descriptor.inputNames.map { RawModel.describeTensor($0, descriptor.inputDescriptor(of: $0)) },
        "outputs": descriptor.outputNames.map { RawModel.describeTensor($0, descriptor.outputDescriptor(of: $0)) }
      ]
    }
  }
}
#endif
