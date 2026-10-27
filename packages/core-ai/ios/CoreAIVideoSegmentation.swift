import CoreGraphics
import Foundation

#if canImport(CoreAIVideoSegmenter)
import CoreAIShared
import CoreAIVideoSegmenter

/// Segments and tracks the objects that text prompts describe through a
/// video, with coreai-models video segmentation bundles (SAM 3 video)
@available(iOS 27, macOS 27, *)
enum VideoSegmentation {
  private static let lock = NSLock()
  // The segmenter last used, by bundle path, since loading one reads its
  // bundle and tokenizer. One stays loaded, so switching models releases the
  // last one
  nonisolated(unsafe) private static var loaded: (path: String, load: Task<VideoSegmenter, Error>)?

  static func run(sourceURL: URL, input: [String: Any], options: [String: Any]) async throws -> [String: Any] {
    guard let videoUri = input["videoUri"] as? String else {
      throw CoreAIError.invalidInput("Expected input.videoUri for video segmentation.")
    }
    let videoURL = fileURL(videoUri)
    let data = input["data"] as? [String: Any]
    let prompts = (data?["prompts"] as? [String]) ?? (input["text"] as? String).map { [$0] } ?? []
    guard !prompts.isEmpty else {
      throw CoreAIError.invalidInput("Expected input.text or input.data.prompts with what to segment.")
    }

    let segmenter = try await self.segmenter(at: sourceURL)
    let parameters = makeParameters(base: await segmenter.parameters, options: options)
    let maxFrames = (options["maxFrames"] as? NSNumber)?.intValue
    let includesMasks = options["includeMasks"] as? Bool ?? false

    var frames: [[String: Any]] = []
    var output: [String: Any] = [:]
    if options["outputVideo"] as? Bool ?? false {
      // Writes a copy with the masks and boxes drawn on, as it segments
      let destination = FileManager.default.temporaryDirectory
        .appendingPathComponent("core-ai-segmented-\(UUID().uuidString)")
        .appendingPathExtension("mp4")
      let collector = FrameCollector(includesMasks: includesMasks)
      try await segmenter.renderAnnotatedVideo(
        from: videoURL,
        prompts: prompts,
        to: destination,
        maxFrames: maxFrames,
        parameters: parameters
      ) { frame in
        await collector.add(frame)
      }
      if let failure = await collector.failure {
        throw failure
      }
      frames = await collector.frames
      output["video"] = destination.absoluteString
    } else {
      for try await frame in segmenter.segment(videoAt: videoURL, prompts: prompts, maxFrames: maxFrames, parameters: parameters) {
        frames.append(try serialize(frame, includesMasks: includesMasks))
      }
    }

    output["frames"] = frames
    return [
      "task": "video-segmentation",
      "output": output,
      "metadata": ["frameCount": frames.count, "prompts": prompts]
    ]
  }

  // Concurrent calls for the same bundle share one load
  private static func segmenter(at url: URL) async throws -> VideoSegmenter {
    let load = lock.withLock { () -> Task<VideoSegmenter, Error> in
      if let loaded, loaded.path == url.path {
        return loaded.load
      }
      let load = Task { try await VideoSegmenter(resourcesAt: url.path) }
      loaded = (url.path, load)
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

  private static func makeParameters(
    base: VideoSegmentationParameters,
    options: [String: Any]
  ) -> VideoSegmentationParameters? {
    var parameters = base
    var changed = false
    if let threshold = (options["scoreThreshold"] as? NSNumber)?.floatValue {
      parameters.scoreThresholdDetection = threshold
      changed = true
    }
    if let threshold = (options["newObjectThreshold"] as? NSNumber)?.floatValue {
      parameters.newDetThresh = threshold
      changed = true
    }
    if let maxObjects = (options["maxObjects"] as? NSNumber)?.intValue {
      parameters.maxNumObjects = maxObjects
      changed = true
    }
    return changed ? parameters : nil
  }

  fileprivate static func serialize(_ frame: VideoSegmentationFrame, includesMasks: Bool) throws -> [String: Any] {
    return [
      "frameIndex": frame.frameIndex,
      "objects": try frame.objects.map { object -> [String: Any] in
        var serialized: [String: Any] = [
          "id": object.id,
          "prompt": object.prompt,
          "score": object.score,
          "box": [
            "x": Double(object.box.origin.x),
            "y": Double(object.box.origin.y),
            "width": Double(object.box.width),
            "height": Double(object.box.height)
          ]
        ]
        if includesMasks {
          serialized["mask"] = try CoreAIImpl.pngBase64(maskImage(object.mask))
          serialized["maskWidth"] = object.mask.width
          serialized["maskHeight"] = object.mask.height
        }
        return serialized
      }
    ]
  }

  // White where the mask is set and transparent elsewhere, like image segmentation masks
  private static func maskImage(_ mask: MaskBitset) throws -> CGImage {
    var pixels = [UInt8](repeating: 0, count: mask.width * mask.height * 4)
    mask.forEachSetIndex { index in
      pixels.replaceSubrange(index * 4..<index * 4 + 4, with: [255, 255, 255, 255])
    }
    guard let provider = CGDataProvider(data: Data(pixels) as CFData),
          let image = CGImage(
            width: mask.width,
            height: mask.height,
            bitsPerComponent: 8,
            bitsPerPixel: 32,
            bytesPerRow: mask.width * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
            provider: provider,
            decode: nil,
            shouldInterpolate: false,
            intent: .defaultIntent
          ) else {
      throw CoreAIError.invalidInput("Could not create a segmentation mask image.")
    }
    return image
  }

  private static func fileURL(_ uri: String) -> URL {
    if uri.hasPrefix("file://") {
      return URL(string: uri) ?? URL(fileURLWithPath: uri.replacingOccurrences(of: "file://", with: ""))
    }
    return URL(fileURLWithPath: uri)
  }
}

/// Collects the frames that renderAnnotatedVideo reports as it writes them
@available(iOS 27, macOS 27, *)
private actor FrameCollector {
  private let includesMasks: Bool
  private(set) var frames: [[String: Any]] = []
  private(set) var failure: Error?

  init(includesMasks: Bool) {
    self.includesMasks = includesMasks
  }

  func add(_ frame: VideoSegmentationFrame) {
    do {
      frames.append(try VideoSegmentation.serialize(frame, includesMasks: includesMasks))
    } catch {
      failure = error
    }
  }
}
#endif
