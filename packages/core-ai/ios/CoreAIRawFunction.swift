import CoreGraphics
import CoreVideo
import Foundation

#if canImport(CoreAI)
import CoreAI

/// A loaded .aimodel whose functions JS calls by name. Inputs and outputs
/// cross the bridge as `{ dataType, shape, data }`, with `data` holding the
/// little-endian elements in row-major order as base64. Every call copies its
/// tensors, so JS never holds native memory, and functions stay loaded with
/// their weights until the model is unloaded. Image inputs take
/// `{ imageUri }` instead, decoded into a pixel buffer of the input's size
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

    var values: [String: InferenceFunction.AsyncValue] = [:]
    for name in descriptor.inputNames {
      guard let tensor = inputs[name] as? [String: Any] else {
        throw CoreAIError.invalidInput(
          "Missing input \"\(name)\" for \(functionName). It takes \(descriptor.inputNames.joined(separator: ", "))."
        )
      }
      switch descriptor.inputDescriptor(of: name) {
      case .ndArray(let arrayDescriptor):
        values[name] = .init(try Self.makeArray(tensor, name: name, descriptor: arrayDescriptor))
      case .image(let imageDescriptor):
        values[name] = .init(try Self.makePixelBuffer(tensor, name: name, descriptor: imageDescriptor))
      default:
        throw CoreAIError.invalidInput("Input \"\(name)\" has a type raw function calls do not support.")
      }
    }
    let unknown = Set(inputs.keys).subtracting(descriptor.inputNames)
    if !unknown.isEmpty {
      throw CoreAIError.invalidInput(
        "\(functionName) has no input named \(unknown.sorted().joined(separator: ", ")). It takes \(descriptor.inputNames.joined(separator: ", "))."
      )
    }

    // Async values own their arrays and pixel buffers, which run's Inputs
    // would only borrow within one scope
    let outputs = try function.encode(inputs: values, to: ComputeStream())
    var result: [String: Any] = [:]
    for name in descriptor.outputNames {
      guard let value = outputs[name] else {
        throw CoreAIError.invalidInput("\(functionName) returned no output \"\(name)\".")
      }
      guard let array = try await value.ndArray else {
        throw CoreAIError.invalidInput("Output \"\(name)\" is an image, which raw function calls do not support yet.")
      }
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
      // -1 marks a dynamic width or height
      return [
        "name": name,
        "dataType": "image",
        "width": image.width,
        "height": image.height,
        "pixelFormat": Self.name(ofPixelFormat: image.pixelFormatType)
      ]
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
    // Checked, since JS sets the dimensions of dynamic shapes
    var byteCount = elementSize
    for dimension in shape {
      let (product, overflow) = byteCount.multipliedReportingOverflow(by: dimension)
      guard !overflow else {
        throw CoreAIError.invalidInput("Input \"\(name)\" of shape \(shape) is too large.")
      }
      byteCount = product
    }
    guard data.count == byteCount else {
      throw CoreAIError.invalidInput(
        "Input \"\(name)\" needs \(byteCount) bytes of \(Self.name(of: tensorType)) for shape \(shape), got \(data.count)."
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

  /// Pixel formats Core AI images take, by the names describeTensor reports
  static let pixelFormats: [(name: String, type: OSType)] = [
    ("32BGRA", kCVPixelFormatType_32BGRA),
    ("32ARGB", kCVPixelFormatType_32ARGB),
    ("24RGB", kCVPixelFormatType_24RGB),
    ("420YpCbCr8Planar", kCVPixelFormatType_420YpCbCr8Planar),
  ]

  static func name(ofPixelFormat type: OSType) -> String {
    if let name = pixelFormats.first(where: { $0.type == type })?.name {
      return name
    }
    // The four-character code, as Core Video names most formats
    let bytes = [24, 16, 8, 0].map { UInt8((type >> $0) & 0xFF) }
    return bytes.allSatisfy({ $0 >= 0x20 && $0 < 0x7F }) ? String(decoding: bytes, as: UTF8.self) : String(type)
  }

  /// Decodes input.imageUri and draws it stretched to the input's width and
  /// height, or at its own size along a dynamic dimension
  private static func makePixelBuffer(
    _ input: [String: Any],
    name: String,
    descriptor: ImageDescriptor
  ) throws -> CVReadOnlyPixelBuffer {
    guard input["imageUri"] is String else {
      throw CoreAIError.invalidInput("Input \"\(name)\" is an image and needs { imageUri }.")
    }
    let format = descriptor.pixelFormatType
    guard [kCVPixelFormatType_32BGRA, kCVPixelFormatType_32ARGB, kCVPixelFormatType_24RGB].contains(format) else {
      throw CoreAIError.invalidInput(
        "Input \"\(name)\" takes \(Self.name(ofPixelFormat: format)) images, which raw function calls do not support yet."
      )
    }
    let image = try CoreAIImpl.loadCGImage(from: input)
    let width = descriptor.width == -1 ? image.width : descriptor.width
    let height = descriptor.height == -1 ? image.height : descriptor.height

    var buffer: CVPixelBuffer?
    let attributes = [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary
    guard CVPixelBufferCreate(nil, width, height, format, attributes, &buffer) == kCVReturnSuccess,
          let buffer else {
      throw CoreAIError.invalidInput("Could not create a \(width)x\(height) pixel buffer for input \"\(name)\".")
    }
    try draw(image, into: buffer, name: name)
    return CVReadOnlyPixelBuffer(unsafeBuffer: buffer)
  }

  private static func draw(_ image: CGImage, into buffer: CVPixelBuffer, name: String) throws {
    guard CVPixelBufferLockBaseAddress(buffer, []) == kCVReturnSuccess else {
      throw CoreAIError.invalidInput("Could not lock the pixel buffer for input \"\(name)\".")
    }
    defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
    let format = CVPixelBufferGetPixelFormatType(buffer)
    let width = CVPixelBufferGetWidth(buffer)
    let height = CVPixelBufferGetHeight(buffer)
    guard let base = CVPixelBufferGetBaseAddress(buffer) else {
      throw CoreAIError.invalidInput("The pixel buffer for input \"\(name)\" has no memory to draw into.")
    }
    let bytesPerRow = CVPixelBufferGetBytesPerRow(buffer)

    // Core Graphics draws 32-bit pixels only, so 24RGB is drawn as RGBX and
    // packed after
    let isPacked = format == kCVPixelFormatType_24RGB
    let bitmapInfo: CGBitmapInfo = switch format {
    case kCVPixelFormatType_32BGRA:
      CGBitmapInfo(rawValue: CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.premultipliedFirst.rawValue)
    case kCVPixelFormatType_32ARGB:
      CGBitmapInfo(rawValue: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedFirst.rawValue)
    default:
      CGBitmapInfo(rawValue: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.noneSkipLast.rawValue)
    }
    guard let context = CGContext(
      data: isPacked ? nil : base,
      width: width,
      height: height,
      bitsPerComponent: 8,
      bytesPerRow: isPacked ? 0 : bytesPerRow,
      space: CGColorSpace(name: CGColorSpace.sRGB)!,
      bitmapInfo: bitmapInfo.rawValue
    ) else {
      throw CoreAIError.invalidInput("Could not draw input \"\(name)\".")
    }
    context.interpolationQuality = .high
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))

    if isPacked, let pixels = context.data {
      for row in 0..<height {
        let source = pixels.advanced(by: row * context.bytesPerRow).assumingMemoryBound(to: UInt8.self)
        let destination = base.advanced(by: row * bytesPerRow).assumingMemoryBound(to: UInt8.self)
        for column in 0..<width {
          destination[column * 3] = source[column * 4]
          destination[column * 3 + 1] = source[column * 4 + 1]
          destination[column * 3 + 2] = source[column * 4 + 2]
        }
      }
    }
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
        let pattern = value.bitPattern
        if value.isNaN {
          // Rounding could carry a NaN into infinity, so it keeps a quiet NaN
          bits[index] = UInt16(pattern >> 16) | 0x0040
        } else {
          // Round to nearest even on the bits dropped from the mantissa
          bits[index] = UInt16((pattern &+ 0x7FFF &+ ((pattern >> 16) & 1)) >> 16)
        }
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
