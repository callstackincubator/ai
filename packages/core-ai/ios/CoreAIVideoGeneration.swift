import Foundation

#if canImport(CoreAIVideoDiffusionPipeline)
import CoreAI
import CoreAIShared
import CoreAIVideoDiffusionPipeline

/// Text-to-video with coreai-models video diffusion bundles (Wan 2.1)
@available(iOS 27, macOS 27, *)
enum VideoGeneration {
  private static let lock = NSLock()
  // The pipeline last used, with the shape its bundle was exported for, since
  // loading one reads its bundle. One stays loaded, so switching models
  // releases the last one. With lazy loading, each component's weights load
  // only while it runs
  nonisolated(unsafe) private static var loaded: (key: String, load: Task<(WanPipeline, ExportedShape), Error>)?

  static func generate(prompt: String, sourceURL: URL, options: [String: Any]) async throws -> [String: Any] {
    let (pipeline, shape) = try await self.pipeline(at: sourceURL, options: options)
    let configuration = try makeConfiguration(prompt: prompt, pipeline: pipeline, shape: shape, options: options)
    let result = try await pipeline.generateVideo(configuration: configuration) { _ in
      !Task.isCancelled
    }
    try Task.checkCancellation()

    let outputURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("core-ai-video-\(UUID().uuidString)")
      .appendingPathExtension("mp4")
    try await VideoWriter.writeMP4(frames: result.frames, fps: result.fps, to: outputURL)
    let video = try Data(contentsOf: outputURL)

    return [
      "video": video.base64EncodedString(),
      "uri": outputURL.absoluteString,
      "mediaType": "video/mp4",
      "width": result.frames.first?.width ?? 0,
      "height": result.frames.first?.height ?? 0,
      "frameCount": result.frames.count,
      "fps": result.fps,
      "seed": Int(result.seed)
    ]
  }

  // Concurrent calls for the same bundle share one load
  private static func pipeline(at url: URL, options: [String: Any]) async throws -> (WanPipeline, ExportedShape) {
    let lazy = options["lazyModelLoading"] as? Bool ?? true
    let key = "\(url.path)|\(lazy)"
    let load = lock.withLock { () -> Task<(WanPipeline, ExportedShape), Error> in
      if let loaded, loaded.key == key {
        return loaded.load
      }
      let load = Task {
        (try await WanPipeline(from: url, lazyModelLoading: lazy), try await exportedShape(at: url))
      }
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

  /// The size and frame count an export was traced for, where they are fixed.
  /// iOS exports fix them, and running at another one fails an assertion in
  /// the runtime instead of throwing
  private struct ExportedShape {
    var width: Int?
    var height: Int?
    var frameCount: Int?
    // Decoders exported for tiles take a smaller latent than the transformer
    var vaeTileSize: Int?
  }

  private static func exportedShape(at url: URL) async throws -> ExportedShape {
    // [batch, channels, latent frames, height / 8, width / 8], -1 where dynamic
    func latentShape(_ asset: String, _ input: String) async throws -> [Int]? {
      // The pipeline specializes its components for the GPU, so this reuses
      // that instead of compiling them for the Neural Engine
      let model = try await AIModel(
        contentsOf: url.appendingPathComponent(asset),
        options: SpecializationOptions(preferredComputeUnitKind: .gpu)
      )
      guard case .ndArray(let descriptor)? = model.functionDescriptor(for: "main")?.inputDescriptor(of: input),
            descriptor.rank == 5 else {
        return nil
      }
      return descriptor.shape
    }
    let transformer = try await latentShape("Transformer.aimodel", "hidden_states")
    let decoder = try await latentShape("VAEDecoder.aimodel", "latent")
    func fixed(_ dimension: Int, _ shapes: [Int]?...) -> Int? {
      shapes.compactMap { $0?[dimension] }.first { $0 != -1 }
    }
    let latentHeight = fixed(3, transformer)
    let latentWidth = fixed(4, transformer)
    let tileSize = fixed(3, decoder).flatMap { $0 == latentHeight ? nil : $0 }
    // The VAE compresses 8x in space and 4x in time
    return ExportedShape(
      width: (latentWidth ?? fixed(4, decoder)).map { $0 * 8 },
      height: (latentHeight ?? fixed(3, decoder)).map { $0 * 8 },
      frameCount: fixed(2, decoder, transformer).map { ($0 - 1) * 4 + 1 },
      vaeTileSize: tileSize
    )
  }

  /// Width and height must be multiples of 16, and the frame count 4n + 1
  private static func makeConfiguration(
    prompt: String,
    pipeline: WanPipeline,
    shape: ExportedShape,
    options: [String: Any]
  ) throws -> VideoConfiguration {
    let defaults = pipeline.defaultVideoSize
    let width = (options["width"] as? NSNumber)?.intValue ?? shape.width ?? defaults.width
    let height = (options["height"] as? NSNumber)?.intValue ?? shape.height ?? defaults.height
    guard width > 0, height > 0, width % 16 == 0, height % 16 == 0 else {
      throw CoreAIError.invalidInput("Video width and height must be multiples of 16, got \(width)x\(height).")
    }
    if let fixedWidth = shape.width, let fixedHeight = shape.height, (width, height) != (fixedWidth, fixedHeight) {
      throw CoreAIError.invalidInput(
        "This video model was exported for \(fixedWidth)x\(fixedHeight) only, not \(width)x\(height). Export it again for that size, or with dynamic shapes."
      )
    }

    let fps = (options["fps"] as? NSNumber)?.intValue ?? 16
    var frameCount = (options["frameCount"] as? NSNumber)?.intValue ?? shape.frameCount ?? pipeline.defaultFrameCount
    if options["frameCount"] == nil, let duration = (options["duration"] as? NSNumber)?.doubleValue {
      // The nearest 4n + 1 frames to the duration
      frameCount = max(Int((duration * Double(fps) / 4).rounded()), 1) * 4 + 1
    }
    guard frameCount > 0, (frameCount - 1) % 4 == 0 else {
      throw CoreAIError.invalidInput("Video frame count must be 4n + 1 (17, 33, 49, 65, 81), got \(frameCount).")
    }
    if let fixedFrameCount = shape.frameCount, frameCount != fixedFrameCount {
      throw CoreAIError.invalidInput(
        "This video model was exported for \(fixedFrameCount) frames only, not \(frameCount)."
      )
    }

    return VideoConfiguration(
      prompt: prompt,
      negativePrompt: options["negativePrompt"] as? String ?? "",
      seed: UInt32(truncatingIfNeeded: (options["seed"] as? NSNumber)?.intValue ?? Int.random(in: 0..<Int(UInt32.max))),
      stepCount: (options["stepCount"] as? NSNumber)?.intValue ?? pipeline.defaultSteps,
      guidanceScale: (options["guidanceScale"] as? NSNumber)?.floatValue ?? pipeline.defaultGuidanceScale,
      numFrames: frameCount,
      fps: fps,
      width: width,
      height: height,
      vaeTileSize: (options["vaeTileSize"] as? NSNumber)?.intValue ?? shape.vaeTileSize,
      cfgCutoffFraction: (options["cfgCutoff"] as? NSNumber)?.floatValue
    )
  }
}
#endif
