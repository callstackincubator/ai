import CoreGraphics
import Foundation

#if canImport(CoreAI) && canImport(CoreAIShared)
import CoreAI
// Ships the CLIP tokenizer with every coreai-models product, so embeddings
// need no product of their own
import CoreAIShared

/// Text and image embeddings from a CLIP-style export: an .aimodel with
/// `encode_text(input_ids, attention_mask)` and `encode_image(pixel_values)`
/// functions, next to a `tokenizer/` folder with the CLIP `tokenizer.json`
@available(iOS 27, macOS 27, *)
enum Embeddings {
  private static let clipMean: [Float] = [0.48145466, 0.4578275, 0.40821073]
  private static let clipStd: [Float] = [0.26862954, 0.26130258, 0.27577711]

  private static let lock = NSLock()
  nonisolated(unsafe) private static var tokenizers: [String: CLIPTokenizer] = [:]

  static func embed(texts: [String], sourceURL: URL, options: [String: Any]) async throws -> [String: Any] {
    let model = try await ModelCache.shared.model(at: try VisionTask.modelAsset(at: sourceURL), options: options)
    let function = try model.loadFunction(try functionName(options["textFunction"], preferred: "encode_text", in: model))
    let descriptor = function.descriptor
    guard descriptor.inputNames.contains("input_ids"),
          case .ndArray(let idsDescriptor) = descriptor.inputDescriptor(of: "input_ids"),
          idsDescriptor.rank == 2 else {
      throw CoreAIError.invalidInput("The text function needs an input_ids input of [batch, length].")
    }
    let maskDescriptor: NDArrayDescriptor?
    if case .ndArray(let mask) = descriptor.inputDescriptor(of: "attention_mask") {
      maskDescriptor = mask
    } else {
      maskDescriptor = nil
    }

    let tokenizer = try self.tokenizer(near: sourceURL)
    let length = idsDescriptor.shape[1] == -1 ? 77 : idsDescriptor.shape[1]
    var embeddings: [[Float]] = []
    for batch in batches(of: texts, fixedSize: idsDescriptor.shape[0], options: options) {
      let encoded = batch.map { tokenizer.encodeWithMask($0, contextLength: length) }
      var inputs = [
        "input_ids": try makeIntegerArray(encoded.flatMap(\.ids), shape: [encoded.count, length], descriptor: idsDescriptor)
      ]
      if let maskDescriptor {
        inputs["attention_mask"] = try makeIntegerArray(
          encoded.flatMap(\.attentionMask), shape: [encoded.count, length], descriptor: maskDescriptor
        )
      }
      embeddings += try await run(function, inputs: inputs).prefix(batch.count)
    }
    // A fixed batch pads its last batch, whose extra rows are dropped
    return result(Array(embeddings.prefix(texts.count)))
  }

  /// Decodes the images one batch at a time, so only that batch is in memory
  static func embed(imageUris: [String], sourceURL: URL, options: [String: Any]) async throws -> [String: Any] {
    let model = try await ModelCache.shared.model(at: try VisionTask.modelAsset(at: sourceURL), options: options)
    let function = try model.loadFunction(try functionName(options["imageFunction"], preferred: "encode_image", in: model))
    guard let inputName = function.descriptor.inputNames.first,
          case .ndArray(let descriptor) = function.descriptor.inputDescriptor(of: inputName),
          descriptor.rank == 4 else {
      throw CoreAIError.invalidInput("The image function needs an input of [batch, 3, height, width].")
    }
    let height = descriptor.shape[2] == -1 ? 224 : descriptor.shape[2]
    let width = descriptor.shape[3] == -1 ? 224 : descriptor.shape[3]

    var embeddings: [[Float]] = []
    for uris in batches(of: imageUris, fixedSize: descriptor.shape[0], options: options) {
      let batch = try uris.map { try CoreAIImpl.loadCGImage(from: ["imageUri": $0]) }
      // CLIP resizes the shorter side and crops the center
      let pixels = try batch.flatMap { image in
        try VisionTask.normalized(
          try VisionTask.rgbPixels(of: image, width: width, height: height, crops: true),
          options: options, mean: clipMean, std: clipStd
        )
      }
      let input = try VisionTask.makeArray(pixels, shape: [batch.count, 3, height, width], descriptor: descriptor)
      embeddings += try await run(function, inputs: [inputName: input]).prefix(batch.count)
    }
    return result(Array(embeddings.prefix(imageUris.count)))
  }

  private static func result(_ embeddings: [[Float]]) -> [String: Any] {
    return [
      "embeddings": embeddings.map { $0.map(Double.init) },
      "metadata": ["dimensions": embeddings.first?.count ?? 0]
    ]
  }

  /// The preferred function when the model has it, or `main`
  private static func functionName(_ option: Any?, preferred: String, in model: RawModel) throws -> String {
    if let name = option as? String {
      return name
    }
    return model.functionNames.contains(preferred) ? preferred : "main"
  }

  /// Batches of options.batchSize (16), or of the model's fixed batch size,
  /// with the last one padded by its last element
  private static func batches<T>(of values: [T], fixedSize: Int, options: [String: Any]) -> [[T]] {
    guard let last = values.last else { return [] }
    let size = fixedSize != -1 ? fixedSize : max((options["batchSize"] as? NSNumber)?.intValue ?? 16, 1)
    return stride(from: 0, to: values.count, by: size).map { start in
      var batch = Array(values[start..<min(start + size, values.count)])
      if fixedSize != -1 {
        batch += [T](repeating: last, count: size - batch.count)
      }
      return batch
    }
  }

  /// The rows of the first output, `[batch, dimensions]`
  private static func run(_ function: InferenceFunction, inputs: [String: NDArray]) async throws -> [[Float]] {
    var outputs = try await function.run(inputs: inputs)
    guard let name = function.descriptor.outputNames.first, let output = outputs.remove(name)?.ndArray,
          output.shape.count == 2 else {
      throw CoreAIError.invalidInput("Expected the model to return embeddings of [batch, dimensions].")
    }
    let values = VisionTask.floats(of: output)
    let dimensions = output.shape[1]
    return (0..<output.shape[0]).map { Array(values[$0 * dimensions..<($0 + 1) * dimensions]) }
  }

  private static func makeIntegerArray(_ values: [Int32], shape: [Int], descriptor: NDArrayDescriptor) throws -> NDArray {
    let data: Data
    switch descriptor.scalarType {
    case .int32:
      data = values.withUnsafeBytes { Data($0) }
    case .int64:
      data = values.map(Int64.init).withUnsafeBytes { Data($0) }
    default:
      throw CoreAIError.invalidInput("Expected int32 or int64 token inputs, got \(RawModel.name(of: descriptor.scalarType)).")
    }
    let elementSize = try RawModel.size(of: descriptor.scalarType)
    var array = NDArray(descriptor: descriptor.hasDynamicShape ? descriptor.resolvingDynamicDimensions(shape) : descriptor)
    data.withUnsafeBytes { source in
      array.mutableRawView().withUnsafeMutableBytes { destination, shape, strides in
        RawModel.forEachElement(shape: shape, strides: strides) { index, offset in
          (destination + offset * elementSize).copyMemory(from: source.baseAddress! + index * elementSize, byteCount: elementSize)
        }
      }
    }
    return array
  }

  /// The tokenizer in a tokenizer/ folder next to the model, or beside it
  private static func tokenizer(near sourceURL: URL) throws -> CLIPTokenizer {
    let directory = VisionTask.isDirectoryOfAssets(sourceURL) ? sourceURL : sourceURL.deletingLastPathComponent()
    let nested = directory.appendingPathComponent("tokenizer")
    let folder = FileManager.default.fileExists(atPath: nested.appendingPathComponent("tokenizer.json").path) ? nested : directory
    if let tokenizer = lock.withLock({ tokenizers[folder.path] }) {
      return tokenizer
    }
    guard FileManager.default.fileExists(atPath: folder.appendingPathComponent("tokenizer.json").path) else {
      throw CoreAIError.invalidInput("No tokenizer.json in \(nested.path) or \(directory.path).")
    }
    let tokenizer = try CLIPTokenizer(folder: folder)
    lock.withLock { tokenizers[folder.path] = tokenizer }
    return tokenizer
  }
}
#endif
