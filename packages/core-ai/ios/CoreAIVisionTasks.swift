import CoreGraphics
import Foundation

#if canImport(CoreAI)
import CoreAI

/// Image tasks that coreai-models exports recipes for but has no Swift
/// runtime for: super-resolution (EDSR), classification (PVT) and depth
/// estimation (Depth Anything). Each runs the model's `main` function on
/// tensors made from the image, so any export with the same inputs works
@available(iOS 27, macOS 27, *)
enum VisionTask {
  private static let imageNetMean: [Float] = [0.485, 0.456, 0.406]
  private static let imageNetStd: [Float] = [0.229, 0.224, 0.225]

  static func run(
    _ task: String,
    sourceURL: URL,
    image: CGImage,
    options: [String: Any]
  ) async throws -> [String: Any] {
    let modelURL = try modelAsset(at: sourceURL)
    let model = try await ModelCache.shared.model(at: modelURL, options: options)
    let function = try model.loadFunction(options["functionName"] as? String ?? "main")

    let output: [String: Any]
    switch task {
    case "super-resolution":
      output = try await upscale(image, with: function, options: options)
    case "classification":
      output = try await classify(image, with: function, labels: try labels(near: sourceURL, options: options), options: options)
    default:
      output = try await estimateDepth(image, with: function, options: options)
    }
    return [
      "task": task,
      "output": output,
      "metadata": ["imageWidth": image.width, "imageHeight": image.height]
    ]
  }

  // MARK: - Super-resolution

  /// Upscales the image in tiles of at most tileSize pixels, which overlap by
  /// tileOverlap pixels so the seams fall where both tiles have context
  private static func upscale(
    _ image: CGImage,
    with function: InferenceFunction,
    options: [String: Any]
  ) async throws -> [String: Any] {
    let (inputName, descriptor) = try imageInput(of: function)
    guard descriptor.rank == 4 else {
      throw CoreAIError.invalidInput("Super-resolution needs a model that takes [batch, 3, height, width], got \(descriptor.shape).")
    }
    let fixedHeight = descriptor.shape[2] == -1 ? nil : descriptor.shape[2]
    let fixedWidth = descriptor.shape[3] == -1 ? nil : descriptor.shape[3]
    let maxTile = (options["tileSize"] as? NSNumber)?.intValue ?? 256
    let tileHeight = fixedHeight ?? min(maxTile, image.height)
    let tileWidth = fixedWidth ?? min(maxTile, image.width)
    let overlap = min((options["tileOverlap"] as? NSNumber)?.intValue ?? 16, tileWidth / 4, tileHeight / 4)

    let source = try rgbPixels(of: image, width: image.width, height: image.height)
    var result: [Float]?
    var scale = 0
    var outputWidth = 0
    var outputHeight = 0

    for tileY in tileOrigins(length: image.height, tile: tileHeight, overlap: overlap) {
      for tileX in tileOrigins(length: image.width, tile: tileWidth, overlap: overlap) {
        // Edge pixels pad tiles that reach past a smaller image
        var tile = [Float](repeating: 0, count: 3 * tileHeight * tileWidth)
        for channel in 0..<3 {
          for y in 0..<tileHeight {
            let sourceY = min(tileY + y, image.height - 1)
            for x in 0..<tileWidth {
              let sourceX = min(tileX + x, image.width - 1)
              tile[(channel * tileHeight + y) * tileWidth + x] = source[(channel * image.height + sourceY) * image.width + sourceX]
            }
          }
        }

        let input = try makeArray(tile, shape: [1, 3, tileHeight, tileWidth], descriptor: descriptor)
        let upscaled = try await runFirstOutput(function, inputs: [inputName: input])
        let shape = upscaled.shape
        guard shape.count == 4, shape[1] == 3, shape[2] % tileHeight == 0, shape[2] / tileHeight == shape[3] / tileWidth else {
          throw CoreAIError.invalidInput("Expected the model to return [1, 3, height × scale, width × scale], got \(shape).")
        }
        if result == nil {
          scale = shape[2] / tileHeight
          outputWidth = image.width * scale
          outputHeight = image.height * scale
          result = [Float](repeating: 0, count: 3 * outputHeight * outputWidth)
        }
        let pixels = floats(of: upscaled)

        // Each tile writes the part of the image it is nearest the center of
        let startY = tileY == 0 ? 0 : tileY + overlap / 2
        let endY = min(tileY + tileHeight - (tileY + tileHeight < image.height ? overlap / 2 : 0), image.height)
        let startX = tileX == 0 ? 0 : tileX + overlap / 2
        let endX = min(tileX + tileWidth - (tileX + tileWidth < image.width ? overlap / 2 : 0), image.width)
        for channel in 0..<3 {
          for y in startY * scale..<endY * scale {
            let tileRow = (channel * tileHeight * scale + (y - tileY * scale)) * tileWidth * scale
            let resultRow = (channel * outputHeight + y) * outputWidth
            for x in startX * scale..<endX * scale {
              result![resultRow + x] = pixels[tileRow + x - tileX * scale]
            }
          }
        }
      }
    }

    let upscaled = try makeImage(rgb: result ?? [], width: outputWidth, height: outputHeight)
    return [
      "image": try CoreAIImpl.pngBase64(upscaled),
      "width": outputWidth,
      "height": outputHeight,
      "scale": scale
    ]
  }

  private static func tileOrigins(length: Int, tile: Int, overlap: Int) -> [Int] {
    guard length > tile else { return [0] }
    var origins: [Int] = []
    var origin = 0
    while origin + tile < length {
      origins.append(origin)
      origin += tile - overlap
    }
    // The last tile ends at the image edge
    origins.append(length - tile)
    return origins
  }

  // MARK: - Classification

  private static func classify(
    _ image: CGImage,
    with function: InferenceFunction,
    labels: [String]?,
    options: [String: Any]
  ) async throws -> [String: Any] {
    let (inputName, descriptor) = try imageInput(of: function)
    let (height, width) = try imageSize(of: descriptor, default: 224)
    let pixels = normalized(try rgbPixels(of: image, width: width, height: height), options: options)
    let input = try makeArray(pixels, shape: [1, 3, height, width], descriptor: descriptor)
    let logits = floats(of: try await runFirstOutput(function, inputs: [inputName: input]))

    let scores: [Float]
    if options["applySoftmax"] as? Bool ?? true {
      let maximum = logits.max() ?? 0
      let exponents = logits.map { exp($0 - maximum) }
      let sum = exponents.reduce(0, +)
      scores = exponents.map { $0 / sum }
    } else {
      scores = logits
    }

    let topK = min((options["topK"] as? NSNumber)?.intValue ?? 5, scores.count)
    let top = scores.indices.sorted { scores[$0] > scores[$1] }.prefix(topK)
    return [
      "classifications": top.map { index -> [String: Any] in
        var classification: [String: Any] = ["index": index, "confidence": scores[index]]
        if let labels, index < labels.count {
          classification["label"] = labels[index]
        }
        return classification
      }
    ]
  }

  /// Labels from options.labels, or a labels.json array next to the model
  private static func labels(near sourceURL: URL, options: [String: Any]) throws -> [String]? {
    if let labels = options["labels"] as? [String] {
      return labels
    }
    let directory = isDirectoryOfAssets(sourceURL) ? sourceURL : sourceURL.deletingLastPathComponent()
    let url = directory.appendingPathComponent("labels.json")
    guard FileManager.default.fileExists(atPath: url.path) else {
      return nil
    }
    guard let labels = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String] else {
      throw CoreAIError.invalidInput("\(url.lastPathComponent) must be a JSON array of label strings.")
    }
    return labels
  }

  // MARK: - Depth

  /// Models that take several views, like Depth Anything 3, get the image as
  /// each view. Depth is relative, with smaller values nearer
  private static func estimateDepth(
    _ image: CGImage,
    with function: InferenceFunction,
    options: [String: Any]
  ) async throws -> [String: Any] {
    let (inputName, descriptor) = try imageInput(of: function)
    let (height, width) = try imageSize(of: descriptor, default: 224)
    let views = descriptor.rank == 5 ? max(descriptor.shape[1], 1) : 1
    let view = normalized(try rgbPixels(of: image, width: width, height: height), options: options)
    let shape = descriptor.rank == 5 ? [1, views, 3, height, width] : [1, 3, height, width]
    let input = try makeArray(Array([[Float]](repeating: view, count: views).joined()), shape: shape, descriptor: descriptor)

    let outputName = function.descriptor.outputNames.contains("depth") ? "depth" : function.descriptor.outputNames.first
    var outputs = try await function.run(inputs: [inputName: input])
    guard let outputName, let output = outputs.remove(outputName)?.ndArray else {
      throw CoreAIError.invalidInput("The model returned no depth.")
    }
    guard output.shape.count >= 2, output.shape.suffix(2) == [height, width] else {
      throw CoreAIError.invalidInput("Expected the model to return depth of [..., \(height), \(width)], got \(output.shape).")
    }
    // The depth of the first view
    let depth = Array(floats(of: output).prefix(height * width))
    let minimum = depth.min() ?? 0
    let maximum = depth.max() ?? 0

    // Nearer is brighter, at the size of the input image
    let range = max(maximum - minimum, .leastNonzeroMagnitude)
    let gray = depth.map { UInt8(max(0, min(255, (maximum - $0) / range * 255))) }
    let map = try makeImage(gray: gray, width: width, height: height)
    let resized = try resize(map, width: image.width, height: image.height)

    return [
      "image": try CoreAIImpl.pngBase64(resized),
      "depth": [
        "dataType": "float32",
        "shape": [height, width],
        "data": depth.withUnsafeBytes { Data($0) }.base64EncodedString()
      ],
      "width": width,
      "height": height,
      "min": minimum,
      "max": maximum
    ]
  }

  // MARK: - Model inputs and outputs

  private static func imageInput(of function: InferenceFunction) throws -> (String, NDArrayDescriptor) {
    guard let name = function.descriptor.inputNames.first,
          case .ndArray(let descriptor) = function.descriptor.inputDescriptor(of: name) else {
      throw CoreAIError.invalidInput("The model's function takes no array input.")
    }
    return (name, descriptor)
  }

  private static func imageSize(of descriptor: NDArrayDescriptor, default size: Int) throws -> (Int, Int) {
    guard descriptor.rank >= 4 else {
      throw CoreAIError.invalidInput("Expected an image input of [..., 3, height, width], got \(descriptor.shape).")
    }
    let height = descriptor.shape[descriptor.rank - 2]
    let width = descriptor.shape[descriptor.rank - 1]
    return (height == -1 ? size : height, width == -1 ? size : width)
  }

  private static func runFirstOutput(
    _ function: InferenceFunction,
    inputs: [String: NDArray]
  ) async throws -> NDArray {
    var outputs = try await function.run(inputs: inputs)
    guard let name = function.descriptor.outputNames.first, let output = outputs.remove(name)?.ndArray else {
      throw CoreAIError.invalidInput("The model returned no output.")
    }
    return output
  }

  /// A float16, bfloat16 or float32 array from float elements in row-major order
  private static func makeArray(_ values: [Float], shape: [Int], descriptor: NDArrayDescriptor) throws -> NDArray {
    var data = values.withUnsafeBytes { Data($0) }
    let type = descriptor.scalarType
    switch type {
    case .float32:
      break
    case .float16, .bfloat16:
      data = RawModel.halfPrecision(fromFloat32: data, as: type)
    default:
      throw CoreAIError.invalidInput("Expected a floating point image input, got \(RawModel.name(of: type)).")
    }
    let elementSize = try RawModel.size(of: type)
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

  /// The elements of a floating point array in row-major order
  private static func floats(of array: NDArray) -> [Float] {
    let elementSize = (try? RawModel.size(of: array.scalarType)) ?? 4
    var data = Data(count: array.shape.reduce(1, *) * elementSize)
    data.withUnsafeMutableBytes { destination in
      array.rawView().withUnsafeBytes { source, shape, strides in
        RawModel.forEachElement(shape: shape, strides: strides) { index, offset in
          (destination.baseAddress! + index * elementSize).copyMemory(from: source + offset * elementSize, byteCount: elementSize)
        }
      }
    }
    if array.scalarType == .float16 || array.scalarType == .bfloat16 {
      data = RawModel.float32(fromHalfPrecision: data, as: array.scalarType)
    }
    return data.withUnsafeBytes { Array($0.bindMemory(to: Float.self)) }
  }

  // MARK: - Images

  /// RGB in 0...1, channel-major ([3, height, width]), resized to the size
  private static func rgbPixels(of image: CGImage, width: Int, height: Int) throws -> [Float] {
    var rgba = [UInt8](repeating: 0, count: width * height * 4)
    guard let context = CGContext(
      data: &rgba,
      width: width,
      height: height,
      bitsPerComponent: 8,
      bytesPerRow: width * 4,
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
    ) else {
      throw CoreAIError.invalidInput("Could not read the image pixels.")
    }
    context.interpolationQuality = .high
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))

    var pixels = [Float](repeating: 0, count: 3 * width * height)
    let planeSize = width * height
    for index in 0..<planeSize {
      for channel in 0..<3 {
        pixels[channel * planeSize + index] = Float(rgba[index * 4 + channel]) / 255
      }
    }
    return pixels
  }

  /// Normalizes channel-major RGB with options.mean and options.std, which
  /// default to ImageNet's
  private static func normalized(_ pixels: [Float], options: [String: Any]) -> [Float] {
    let mean = (options["mean"] as? [NSNumber])?.map(\.floatValue) ?? imageNetMean
    let std = (options["std"] as? [NSNumber])?.map(\.floatValue) ?? imageNetStd
    let planeSize = pixels.count / 3
    return pixels.enumerated().map { index, value in
      let channel = index / planeSize
      return (value - mean[channel]) / std[channel]
    }
  }

  private static func makeImage(rgb: [Float], width: Int, height: Int) throws -> CGImage {
    let planeSize = width * height
    var rgba = [UInt8](repeating: 255, count: planeSize * 4)
    for index in 0..<planeSize {
      for channel in 0..<3 {
        rgba[index * 4 + channel] = UInt8(max(0, min(255, (rgb[channel * planeSize + index] * 255).rounded())))
      }
    }
    return try makeImage(bytes: rgba, width: width, height: height, components: 4)
  }

  private static func makeImage(gray: [UInt8], width: Int, height: Int) throws -> CGImage {
    return try makeImage(bytes: gray, width: width, height: height, components: 1)
  }

  private static func makeImage(bytes: [UInt8], width: Int, height: Int, components: Int) throws -> CGImage {
    guard let provider = CGDataProvider(data: Data(bytes) as CFData),
          let image = CGImage(
            width: width,
            height: height,
            bitsPerComponent: 8,
            bitsPerPixel: 8 * components,
            bytesPerRow: width * components,
            space: components == 1 ? CGColorSpaceCreateDeviceGray() : CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGBitmapInfo(rawValue: components == 1 ? CGImageAlphaInfo.none.rawValue : CGImageAlphaInfo.noneSkipLast.rawValue),
            provider: provider,
            decode: nil,
            shouldInterpolate: true,
            intent: .defaultIntent
          ) else {
      throw CoreAIError.invalidInput("Could not create the output image.")
    }
    return image
  }

  private static func resize(_ image: CGImage, width: Int, height: Int) throws -> CGImage {
    guard let context = CGContext(
      data: nil,
      width: width,
      height: height,
      bitsPerComponent: 8,
      bytesPerRow: 0,
      space: CGColorSpaceCreateDeviceGray(),
      bitmapInfo: CGImageAlphaInfo.none.rawValue
    ) else {
      throw CoreAIError.invalidInput("Could not resize the depth map.")
    }
    context.interpolationQuality = .high
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    guard let resized = context.makeImage() else {
      throw CoreAIError.invalidInput("Could not resize the depth map.")
    }
    return resized
  }

  // MARK: - Model files

  /// The .aimodel at the URL, or the only one in a directory with its labels
  private static func modelAsset(at url: URL) throws -> URL {
    if AIModelAsset.isValid(at: url) {
      return url
    }
    if isDirectoryOfAssets(url),
       let asset = try FileManager.default.contentsOfDirectory(at: url, includingPropertiesForKeys: nil)
         .filter({ $0.pathExtension == "aimodel" || $0.pathExtension == "aimodelc" })
         .sorted(by: { $0.lastPathComponent < $1.lastPathComponent })
         .first {
      return asset
    }
    throw CoreAIError.invalidInput("No .aimodel asset at \(url.path).")
  }

  private static func isDirectoryOfAssets(_ url: URL) -> Bool {
    var isDirectory: ObjCBool = false
    return FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory)
      && isDirectory.boolValue
      && !AIModelAsset.isValid(at: url)
  }
}

/// The task model last used stays loaded, by path and compute unit, since
/// loading one specializes it and loads its weights. Switching models
/// releases the last one, and concurrent calls share one load
@available(iOS 27, macOS 27, *)
private final class ModelCache: @unchecked Sendable {
  static let shared = ModelCache()

  private let lock = NSLock()
  private var loaded: (key: String, load: Task<RawModel, Error>)?

  func model(at url: URL, options: [String: Any]) async throws -> RawModel {
    let key = "\(url.path)|\(options["computeUnits"] as? String ?? "default")"
    let specialization = try RawModel.specializationOptions(options)
    let load = lock.withLock { () -> Task<RawModel, Error> in
      if let loaded, loaded.key == key {
        return loaded.load
      }
      let load = Task { RawModel(model: try await AIModel(contentsOf: url, options: specialization)) }
      loaded = (key, load)
      return load
    }
    do {
      return try await load.value
    } catch {
      // A failed load is retried on the next call
      lock.withLock {
        if loaded?.load == load {
          loaded = nil
        }
      }
      throw error
    }
  }
}
#endif
