import CoreGraphics
import Foundation
import ImageIO

// Prompt, option and transcript helpers shared with Apple Intelligence, since
// Core AI language models run through the same LanguageModelSession
@_spi(CoreAI) import AppleLLM

#if canImport(FoundationModels)
import FoundationModels
#endif

#if canImport(CoreAI)
import CoreAI
#endif

#if canImport(CoreAIDiffusionPipeline)
import CoreAIDiffusionPipeline
#endif

#if canImport(CoreAIImageSegmenter)
import CoreAIImageSegmenter
#endif

#if canImport(CoreAILanguageModels)
import CoreAILanguageModels
#endif

#if canImport(CoreAIObjectDetector)
import CoreAIObjectDetector
#endif

@objc
public class CoreAIImpl: NSObject {
  private let lock = NSLock()
  private var loadedModels: [String: Any] = [:]
  private var languageSessions: [String: LanguageSessionEntry] = [:]
  private var tasks: [String: Task<Void, Never>] = [:]

  @objc
  public func getCapabilities(
    _ resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
    var missingProducts: [String] = []

#if !canImport(CoreAILanguageModels)
    missingProducts.append("CoreAILM")
#endif
#if !canImport(CoreAIDiffusionPipeline)
    missingProducts.append("CoreAIDiffusion")
#endif
#if !canImport(CoreAIImageSegmenter)
    missingProducts.append("CoreAISegmentation")
#endif
#if !canImport(CoreAIObjectDetector)
    missingProducts.append("CoreAIObjectDetection")
#endif

    resolve([
      "isCoreAIRuntimeAvailable": Self.isCoreAIRuntimeAvailable(),
      "isCoreAILMAvailable": Self.isCoreAILMAvailable(),
      "isCoreAIDiffusionAvailable": Self.isCoreAIDiffusionAvailable(),
      "isCoreAISegmentationAvailable": Self.isCoreAISegmentationAvailable(),
      "isCoreAIObjectDetectionAvailable": Self.isCoreAIObjectDetectionAvailable(),
      "supportedPlatform": Self.isSupportedPlatform(),
      "missingProducts": missingProducts
    ])
  }

  @objc
  public func inspectModel(
    _ config: [String: Any],
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
    do {
      let sourceURL = try resolveSourceURL(config)
      var isDirectory: ObjCBool = false
      let exists = FileManager.default.fileExists(atPath: sourceURL.path, isDirectory: &isDirectory)
      let attributes = try? FileManager.default.attributesOfItem(atPath: sourceURL.path)
      let size = attributes?[.size] as? NSNumber

      resolve(modelInfo(config: config, metadata: [
        "exists": exists,
        "isDirectory": isDirectory.boolValue,
        "path": sourceURL.path
      ], size: size))
    } catch {
      reject(errorCode(error), error.localizedDescription, error)
    }
  }

  @objc
  public func loadModel(
    _ config: [String: Any],
    options: [String: Any]?,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
    let task = (config["task"] as? String) ?? "unknown"

    switch task {
    case "language":
      loadLanguageModel(config, resolve: resolve, reject: reject)
      return
    case "diffusion":
      loadDiffusionModel(config, options: options, resolve: resolve, reject: reject)
      return
    case "segmentation":
      loadSegmentationModel(config, options: options, resolve: resolve, reject: reject)
      return
    case "object-detection":
      loadObjectDetectionModel(config, options: options, resolve: resolve, reject: reject)
      return
    default:
      break
    }

    let handle = makeHandle("model")
    locked {
      loadedModels[handle] = [
        "config": config,
        "options": options ?? [:]
      ]
    }
    resolve([
      "modelHandle": handle,
      "info": modelInfo(config: config)
    ])
  }

  @objc
  public func unloadModel(
    _ modelHandle: String,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
    let model = locked { () -> Any? in
      languageSessions = languageSessions.filter { $0.value.modelHandle != modelHandle }
      return loadedModels.removeValue(forKey: modelHandle)
    }
#if canImport(FoundationModels) && canImport(CoreAILanguageModels)
    if #available(iOS 27, macOS 27, *), let languageModel = model as? CoreAILanguageModel {
      // Models loaded from the same bundle share the engine and reload it lazily
      languageModel.unload()
    }
#endif
    resolve(nil)
  }

  @objc
  public func removeModel(
    _ config: [String: Any],
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
    do {
      let sourceURL = try resolveSourceURL(config)
      try FileManager.default.removeItem(at: sourceURL)
      resolve(nil)
    } catch {
      reject(errorCode(error), error.localizedDescription, error)
    }
  }

  @objc
  public func specializeModel(
    _ config: [String: Any],
    options: [String: Any]?,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
    resolve(modelInfo(config: config, metadata: [
      "specializationRequested": true,
      "persistence": options?["persistence"] as? String ?? "default"
    ]))
  }

  @objc
  public func createLanguageSession(
    _ modelHandle: String,
    options: [String: Any]?,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
#if canImport(FoundationModels) && canImport(CoreAILanguageModels)
    if #available(iOS 27, macOS 27, *) {
      guard let model = locked({ loadedModels[modelHandle] }) as? CoreAILanguageModel else {
        rejectCoreAI(.modelNotLoaded(modelHandle), reject: reject)
        return
      }

      let session = LanguageModelSession(model: model, instructions: options?["instructions"] as? String)
      let sessionHandle = makeHandle("session")
      locked {
        languageSessions[sessionHandle] = LanguageSessionEntry(modelHandle: modelHandle, session: session)
      }
      resolve(sessionHandle)
    } else {
      rejectCoreAI(.unsupportedOS, reject: reject)
    }
#else
    rejectCoreAI(.missingSwiftPackage("CoreAILM"), reject: reject)
#endif
  }

  @objc
  public func releaseLanguageSession(
    _ sessionHandle: String,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
    locked {
      _ = languageSessions.removeValue(forKey: sessionHandle)
    }
    resolve(nil)
  }

  @objc
  public func respondToLanguageSession(
    _ sessionHandle: String,
    prompt: String,
    options: [String: Any]?,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
#if canImport(FoundationModels) && canImport(CoreAILanguageModels)
    if #available(iOS 27, macOS 27, *) {
      guard let session = locked({ languageSessions[sessionHandle]?.session }) as? LanguageModelSession else {
        rejectCoreAI(.sessionNotFound(sessionHandle), reject: reject)
        return
      }

      Task {
        do {
          let response = try await session.respond(to: prompt)
          resolve(response.toModelMessages())
        } catch {
          reject(errorCode(error), error.localizedDescription, error)
        }
      }
    } else {
      rejectCoreAI(.unsupportedOS, reject: reject)
    }
#else
    rejectCoreAI(.missingSwiftPackage("CoreAILM"), reject: reject)
#endif
  }

  @objc
  public func streamLanguageSession(
    _ streamId: String,
    sessionHandle: String,
    prompt: String,
    options: [String: Any]?,
    onUpdate: @escaping (String, String, [[String: Any]]?) -> Void,
    onComplete: @escaping (String, [String: Any]?) -> Void,
    onError: @escaping (String, String, String) -> Void
  ) {
#if canImport(FoundationModels) && canImport(CoreAILanguageModels)
    if #available(iOS 27, macOS 27, *) {
      guard let session = locked({ languageSessions[sessionHandle]?.session }) as? LanguageModelSession else {
        emitError(.sessionNotFound(sessionHandle), streamId: streamId, onError: onError)
        return
      }

      startTask(streamId, onError: onError) {
        var usage: [String: Any]?
        for try await chunk in session.streamResponse(to: prompt) {
          try Task.checkCancellation()
          onUpdate(streamId, chunk.content, nil)
          usage = Self.serializeUsage(chunk.usage)
        }
        onComplete(streamId, usage)
      }
    } else {
      emitError(.unsupportedOS, streamId: streamId, onError: onError)
    }
#else
    emitError(.missingSwiftPackage("CoreAILM"), streamId: streamId, onError: onError)
#endif
  }

  /// Answers the last user message of an AI SDK prompt. Earlier messages are
  /// replayed as the session transcript, so every call gets a new session on
  /// the loaded model
  @objc
  public func generateText(
    _ requestId: String,
    modelHandle: String,
    messages: [[String: Any]],
    options: [String: Any]?,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
#if canImport(FoundationModels) && canImport(CoreAILanguageModels)
    if #available(iOS 27, macOS 27, *) {
      guard let model = locked({ loadedModels[modelHandle] }) as? CoreAILanguageModel else {
        rejectCoreAI(.modelNotLoaded(modelHandle), reject: reject)
        return
      }

      startTask(requestId, onError: { _, code, message in
        reject(code, message, nil)
      }) {
        let request = try LanguageModelRequest(model: model, messages: messages, options: options ?? [:])
        resolve(try await request.respond())
      }
    } else {
      rejectCoreAI(.unsupportedOS, reject: reject)
    }
#else
    rejectCoreAI(.missingSwiftPackage("CoreAILM"), reject: reject)
#endif
  }

  @objc
  public func streamText(
    _ streamId: String,
    modelHandle: String,
    messages: [[String: Any]],
    options: [String: Any]?,
    onUpdate: @escaping (String, String, [[String: Any]]?) -> Void,
    onComplete: @escaping (String, [String: Any]?) -> Void,
    onError: @escaping (String, String, String) -> Void
  ) {
#if canImport(FoundationModels) && canImport(CoreAILanguageModels)
    if #available(iOS 27, macOS 27, *) {
      guard let model = locked({ loadedModels[modelHandle] }) as? CoreAILanguageModel else {
        emitError(.modelNotLoaded(modelHandle), streamId: streamId, onError: onError)
        return
      }

      startTask(streamId, onError: onError) {
        let request = try LanguageModelRequest(model: model, messages: messages, options: options ?? [:])
        let usage = try await request.stream { content, entries in
          onUpdate(streamId, content, entries)
        }
        onComplete(streamId, usage)
      }
    } else {
      emitError(.unsupportedOS, streamId: streamId, onError: onError)
    }
#else
    emitError(.missingSwiftPackage("CoreAILM"), streamId: streamId, onError: onError)
#endif
  }

  /// Cancels a running stream or generateText request
  @objc
  public func cancelStream(_ streamId: String) {
    let task = locked { tasks.removeValue(forKey: streamId) }
    task?.cancel()
  }

  @objc
  public func embed(
    _ config: [String: Any],
    values: [String],
    options: [String: Any]?,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
    rejectCoreAI(.unsupportedTask("embedding"), reject: reject)
  }

  @objc
  public func transcribe(
    _ config: [String: Any],
    audioBase64: String,
    mediaType: String,
    options: [String: Any]?,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
    rejectCoreAI(.unsupportedTask("asr"), reject: reject)
  }

  @objc
  public func generateImage(
    _ config: [String: Any],
    prompt: String,
    options: [String: Any]?,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
#if canImport(CoreAIDiffusionPipeline)
    if #available(iOS 27, macOS 27, *) {
      do {
        let sourceURL = try resolveSourceURL(config)
        Task {
          do {
            let pipeline = try await self.makeDiffusionPipeline(at: sourceURL, options: options)
            let configuration = try self.makePipelineConfiguration(prompt: prompt, pipeline: pipeline, options: options)
            let result = try await pipeline.generateImages(configuration: configuration) { _ in true }
            let images = try result.images.map(Self.pngBase64)
            resolve([
              "images": images,
              "metadata": [
                "count": images.count,
                "imageFormat": "image/png"
              ]
            ])
          } catch {
            reject(errorCode(error), error.localizedDescription, error)
          }
        }
      } catch {
        reject(errorCode(error), error.localizedDescription, error)
      }
    } else {
      rejectCoreAI(.unsupportedOS, reject: reject)
    }
#else
    rejectCoreAI(.missingSwiftPackage("CoreAIDiffusion"), reject: reject)
#endif
  }

  @objc
  public func runTask(
    _ task: String,
    config: [String: Any],
    input: [String: Any],
    options: [String: Any]?,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
    switch task {
    case "segmentation":
      runSegmentationTask(config: config, input: input, options: options, resolve: resolve, reject: reject)
    case "object-detection":
      runObjectDetectionTask(config: config, input: input, options: options, resolve: resolve, reject: reject)
    default:
      rejectCoreAI(.unsupportedTask(task), reject: reject)
    }
  }

  @objc
  public func runRawFunction(
    _ modelHandle: String,
    functionName: String,
    inputs: [String: Any],
    options: [String: Any]?,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
    rejectCoreAI(.unsupportedTask("raw"), reject: reject)
  }

  private func loadLanguageModel(
    _ config: [String: Any],
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
#if canImport(FoundationModels) && canImport(CoreAILanguageModels)
    if #available(iOS 27, macOS 27, *) {
      do {
        let sourceURL = try resolveSourceURL(config)
        Task {
          do {
            let model = try await CoreAILanguageModel(resourcesAt: sourceURL)
            let handle = self.makeHandle("model")
            self.locked { self.loadedModels[handle] = model }
            resolve([
              "modelHandle": handle,
              "info": self.modelInfo(config: config)
            ])
          } catch {
            reject(errorCode(error), error.localizedDescription, error)
          }
        }
      } catch {
        reject(errorCode(error), error.localizedDescription, error)
      }
    } else {
      rejectCoreAI(.unsupportedOS, reject: reject)
    }
#else
    rejectCoreAI(.missingSwiftPackage("CoreAILM"), reject: reject)
#endif
  }

  private func loadDiffusionModel(
    _ config: [String: Any],
    options: [String: Any]?,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
#if canImport(CoreAIDiffusionPipeline)
    if #available(iOS 27, macOS 27, *) {
      do {
        let sourceURL = try resolveSourceURL(config)
        Task {
          do {
            let pipeline = try await self.makeDiffusionPipeline(at: sourceURL, options: options)
            let handle = self.makeHandle("model")
            self.locked { self.loadedModels[handle] = pipeline }
            resolve([
              "modelHandle": handle,
              "info": self.modelInfo(config: config)
            ])
          } catch {
            reject(errorCode(error), error.localizedDescription, error)
          }
        }
      } catch {
        reject(errorCode(error), error.localizedDescription, error)
      }
    } else {
      rejectCoreAI(.unsupportedOS, reject: reject)
    }
#else
    rejectCoreAI(.missingSwiftPackage("CoreAIDiffusion"), reject: reject)
#endif
  }

  private func loadSegmentationModel(
    _ config: [String: Any],
    options: [String: Any]?,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
#if canImport(CoreAIImageSegmenter)
    if #available(iOS 27, macOS 27, *) {
      do {
        let sourceURL = try resolveSourceURL(config)
        let parameters = makeSegmentationParameters(options: options)
        Task {
          do {
            let segmenter = try await ImageSegmenter(resourcesAt: sourceURL.path, parameters: parameters)
            let handle = self.makeHandle("model")
            self.locked { self.loadedModels[handle] = segmenter }
            resolve([
              "modelHandle": handle,
              "info": self.modelInfo(config: config)
            ])
          } catch {
            reject(errorCode(error), error.localizedDescription, error)
          }
        }
      } catch {
        reject(errorCode(error), error.localizedDescription, error)
      }
    } else {
      rejectCoreAI(.unsupportedOS, reject: reject)
    }
#else
    rejectCoreAI(.missingSwiftPackage("CoreAISegmentation"), reject: reject)
#endif
  }

  private func loadObjectDetectionModel(
    _ config: [String: Any],
    options: [String: Any]?,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
#if canImport(CoreAIObjectDetector)
    if #available(iOS 27, macOS 27, *) {
      do {
        let sourceURL = try resolveSourceURL(config)
        Task {
          do {
            let detector = try await ObjectDetector(resourcesAt: sourceURL.path)
            let handle = self.makeHandle("model")
            self.locked { self.loadedModels[handle] = detector }
            resolve([
              "modelHandle": handle,
              "info": self.modelInfo(config: config)
            ])
          } catch {
            reject(errorCode(error), error.localizedDescription, error)
          }
        }
      } catch {
        reject(errorCode(error), error.localizedDescription, error)
      }
    } else {
      rejectCoreAI(.unsupportedOS, reject: reject)
    }
#else
    rejectCoreAI(.missingSwiftPackage("CoreAIObjectDetection"), reject: reject)
#endif
  }

  private func runSegmentationTask(
    config: [String: Any],
    input: [String: Any],
    options: [String: Any]?,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
#if canImport(CoreAIImageSegmenter)
    if #available(iOS 27, macOS 27, *) {
      do {
        let sourceURL = try resolveSourceURL(config)
        let image = try Self.loadCGImage(from: input)
        let parameters = makeSegmentationParameters(options: options)
        Task {
          do {
            let segmenter = try await ImageSegmenter(resourcesAt: sourceURL.path, parameters: parameters)
            let response: SegmentationResponse
            if let prompt = input["text"] as? String, !prompt.isEmpty {
              response = try await segmenter.segment(image: image, prompt: prompt, parameters: parameters)
            } else {
              response = try await segmenter.segment(
                image: image,
                pointQuery: Self.makePointQuery(input: input),
                parameters: parameters
              )
            }
            resolve([
              "task": "segmentation",
              "output": Self.serializeSegmentationResponse(response),
              "metadata": [
                "imageWidth": image.width,
                "imageHeight": image.height
              ]
            ])
          } catch {
            reject(errorCode(error), error.localizedDescription, error)
          }
        }
      } catch {
        reject(errorCode(error), error.localizedDescription, error)
      }
    } else {
      rejectCoreAI(.unsupportedOS, reject: reject)
    }
#else
    rejectCoreAI(.missingSwiftPackage("CoreAISegmentation"), reject: reject)
#endif
  }

  private func runObjectDetectionTask(
    config: [String: Any],
    input: [String: Any],
    options: [String: Any]?,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
#if canImport(CoreAIObjectDetector)
    if #available(iOS 27, macOS 27, *) {
      do {
        let sourceURL = try resolveSourceURL(config)
        let image = try Self.loadCGImage(from: input)
        let parameters = makeDetectionParameters(options: options)
        Task {
          do {
            let detector = try await ObjectDetector(resourcesAt: sourceURL.path)
            let detections = try await detector.detect(image: image, parameters: parameters)
            resolve([
              "task": "object-detection",
              "output": [
                "detections": detections.map(Self.serializeDetection)
              ],
              "metadata": [
                "imageWidth": image.width,
                "imageHeight": image.height
              ]
            ])
          } catch {
            reject(errorCode(error), error.localizedDescription, error)
          }
        }
      } catch {
        reject(errorCode(error), error.localizedDescription, error)
      }
    } else {
      rejectCoreAI(.unsupportedOS, reject: reject)
    }
#else
    rejectCoreAI(.missingSwiftPackage("CoreAIObjectDetection"), reject: reject)
#endif
  }

  private func resolveSourceURL(_ config: [String: Any]) throws -> URL {
    if let sourceUri = config["sourceUri"] as? String {
      if sourceUri.hasPrefix("file://") {
        return URL(string: sourceUri) ?? URL(fileURLWithPath: sourceUri.replacingOccurrences(of: "file://", with: ""))
      }
      return URL(fileURLWithPath: sourceUri)
    }

    if let bundleName = config["bundleName"] as? String {
      let ext = config["bundleExtension"] as? String
      let subdirectory = config["bundleSubdirectory"] as? String
      if let url = Bundle.main.url(forResource: bundleName, withExtension: ext, subdirectory: subdirectory) {
        return url
      }
    }

    throw CoreAIError.missingSource
  }

  private func modelInfo(
    config: [String: Any],
    metadata: [String: Any] = [:],
    size: NSNumber? = nil
  ) -> [String: Any] {
    var info: [String: Any] = [
      "id": config["id"] as? String ?? "unknown",
      "family": config["family"] as? String ?? "",
      "task": config["task"] as? String ?? "unknown",
      "platforms": ["iOS", "macOS"],
      "functions": [],
      "metadata": metadata
    ]
    if let size {
      info["modelSizeBytes"] = size
    }
    return info
  }

  private func makeHandle(_ prefix: String) -> String {
    return "\(prefix)-\(UUID().uuidString)"
  }

  private func rejectCoreAI(
    _ error: CoreAIError,
    reject: @escaping (String, String, Error?) -> Void
  ) {
    reject(error.code, error.localizedDescription, error)
  }

  private func emitError(
    _ error: CoreAIError,
    streamId: String,
    onError: @escaping (String, String, String) -> Void
  ) {
    onError(streamId, error.code, error.localizedDescription)
  }

  private static func isSupportedPlatform() -> Bool {
    if #available(iOS 27, macOS 27, *) {
      return true
    }
    return false
  }

  private static func isCoreAIRuntimeAvailable() -> Bool {
#if canImport(CoreAI)
    return isSupportedPlatform()
#else
    return false
#endif
  }

  private static func isCoreAILMAvailable() -> Bool {
#if canImport(CoreAILanguageModels)
    return isSupportedPlatform()
#else
    return false
#endif
  }

  private static func isCoreAIDiffusionAvailable() -> Bool {
#if canImport(CoreAIDiffusionPipeline)
    return isSupportedPlatform()
#else
    return false
#endif
  }

  private static func isCoreAISegmentationAvailable() -> Bool {
#if canImport(CoreAIImageSegmenter)
    return isSupportedPlatform()
#else
    return false
#endif
  }

  private static func isCoreAIObjectDetectionAvailable() -> Bool {
#if canImport(CoreAIObjectDetector)
    return isSupportedPlatform()
#else
    return false
#endif
  }
}

#if canImport(CoreAIDiffusionPipeline)
extension CoreAIImpl {
  private func makeDiffusionPipeline(
    at sourceURL: URL,
    options: [String: Any]?
  ) async throws -> FlowTransformerPipeline {
    // coreai-models 1.0 loads FLUX.2 and Sana Sprint bundles through one pipeline
    let mode = DecodeResolution(rawValue: options?["decodeResolution"] as? String ?? "auto") ?? .auto
    return try await FlowTransformerPipeline(from: sourceURL, mode: mode)
  }

  private func makePipelineConfiguration(
    prompt: String,
    pipeline: FlowTransformerPipeline,
    options: [String: Any]?
  ) throws -> PipelineConfiguration {
    let defaults = pipeline.config
    let scheduler = SchedulerType(rawValue: options?["schedulerType"] as? String ?? "") ?? .discreteFlow
    let decodeResolution = DecodeResolution(rawValue: options?["decodeResolution"] as? String ?? "full") ?? .full
    let seed = UInt32(options?["seed"] as? Double ?? 0)
    let stepCount = (options?["stepCount"] as? Double).map(Int.init) ?? defaults.defaultSteps ?? 50
    let guidanceScale = (options?["guidanceScale"] as? Double).map(Float.init) ?? defaults.defaultGuidanceScale ?? 7.5

    return PipelineConfiguration(
      prompt: prompt,
      negativePrompt: options?["negativePrompt"] as? String ?? "",
      seed: seed,
      stepCount: stepCount,
      guidanceScale: guidanceScale,
      schedulerType: scheduler,
      strength: Float(options?["strength"] as? Double ?? 1.0),
      encoderScaleFactor: defaults.encoderScaleFactor ?? DiffusionDefaults.Image.scaleFactor,
      decoderScaleFactor: defaults.decoderScaleFactor ?? DiffusionDefaults.Image.scaleFactor,
      decoderShiftFactor: defaults.decoderShiftFactor ?? DiffusionDefaults.Image.decoderShiftFactor,
      decodeResolution: decodeResolution,
      lazyModelLoading: options?["lazyModelLoading"] as? Bool ?? true
    )
  }
}
#endif

#if canImport(CoreAIImageSegmenter)
extension CoreAIImpl {
  private func makeSegmentationParameters(options: [String: Any]?) -> SegmentationParameters {
    var parameters = SegmentationParameters.default
    if let maskThreshold = options?["maskThreshold"] as? Double {
      parameters.maskThreshold = Float(maskThreshold)
    }
    if let maxSegments = options?["maxSegments"] as? Double {
      parameters.maxSegments = Int(maxSegments)
    }
    if let tokenizerContextLength = options?["tokenizerContextLength"] as? Double {
      parameters.tokenizerContextLength = Int(tokenizerContextLength)
    }
    return parameters
  }

  private static func makePointQuery(input: [String: Any]) -> PointQuery {
    guard let data = input["data"] as? [String: Any] else {
      return PointQuery()
    }

    if let queries = data["queries"] as? [[Any]] {
      return PointQuery(queries: queries.map { query in
        query.compactMap { item in
          guard let point = item as? [String: Any] else {
            return nil
          }
          return makePoint(point)
        }
      })
    }

    if let points = data["points"] as? [[String: Any]] {
      return PointQuery(points: points.compactMap(makePoint))
    }

    if let box = data["box"] as? [String: Any],
       let x = box["x"] as? Double,
       let y = box["y"] as? Double,
       let width = box["width"] as? Double,
       let height = box["height"] as? Double {
      return PointQuery(points: [
        PointQuery.Point(x: Float(x), y: Float(y), label: .boxTopLeft),
        PointQuery.Point(x: Float(x + width), y: Float(y + height), label: .boxBottomRight)
      ])
    }

    return PointQuery()
  }

  private static func makePoint(_ point: [String: Any]) -> PointQuery.Point? {
    guard let x = point["x"] as? Double,
          let y = point["y"] as? Double else {
      return nil
    }

    let labelValue = Int32(point["label"] as? Double ?? 1)
    let label = PointQuery.Label(rawValue: labelValue) ?? .foreground
    return PointQuery.Point(x: Float(x), y: Float(y), label: label)
  }

  private static func serializeSegmentationResponse(_ response: SegmentationResponse) -> [String: Any] {
    var output: [String: Any] = [
      "segments": response.segments.map { segment in
        [
          "score": segment.score,
          "box": serializeRect(segment.box),
          "maskWidth": segment.maskWidth,
          "maskHeight": segment.maskHeight,
          "mask": segment.mask
        ]
      }
    ]

    if let probabilityMap = response.probabilityMap {
      output["probabilityMap"] = [
        "width": probabilityMap.width,
        "height": probabilityMap.height,
        "probabilities": probabilityMap.probabilities
      ]
    }

    return output
  }
}
#endif

#if canImport(CoreAIObjectDetector)
extension CoreAIImpl {
  private func makeDetectionParameters(options: [String: Any]?) -> DetectionParameters {
    var parameters = DetectionParameters.default
    if let threshold = options?["threshold"] as? Double {
      parameters.threshold = Float(threshold)
    }
    if let maxDetections = options?["maxDetections"] as? Double {
      parameters.maxDetections = Int(maxDetections)
    }
    if let inputHeight = options?["inputHeight"] as? Double {
      parameters.inputHeight = Int(inputHeight)
    }
    if let inputWidth = options?["inputWidth"] as? Double {
      parameters.inputWidth = Int(inputWidth)
    }
    return parameters
  }

  private static func serializeDetection(_ detection: DetectedObject) -> [String: Any] {
    return [
      "label": detection.label,
      "labelIndex": detection.labelIndex,
      "confidence": detection.confidence,
      "box": serializeRect(detection.boundingBox)
    ]
  }
}
#endif

extension CoreAIImpl {
  private static func loadCGImage(from input: [String: Any]) throws -> CGImage {
    guard let imageUri = input["imageUri"] as? String else {
      throw CoreAIError.invalidInput("Expected input.imageUri for this Core AI task.")
    }

    let url: URL
    if imageUri.hasPrefix("file://") {
      url = URL(string: imageUri) ?? URL(fileURLWithPath: imageUri.replacingOccurrences(of: "file://", with: ""))
    } else {
      url = URL(fileURLWithPath: imageUri)
    }

    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
      throw CoreAIError.invalidInput("Could not load image at \(url.path).")
    }
    return image
  }

  private static func pngBase64(_ image: CGImage) throws -> String {
    let data = NSMutableData()
    guard let destination = CGImageDestinationCreateWithData(
      data,
      "public.png" as CFString,
      1,
      nil
    ) else {
      throw CoreAIError.invalidInput("Could not create PNG destination.")
    }

    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else {
      throw CoreAIError.invalidInput("Could not encode generated image as PNG.")
    }
    return (data as Data).base64EncodedString()
  }

  private static func serializeRect(_ rect: CGRect) -> [String: Double] {
    return [
      "x": rect.origin.x,
      "y": rect.origin.y,
      "width": rect.width,
      "height": rect.height
    ].mapValues(Double.init)
  }
}

extension CoreAIImpl {
  private struct LanguageSessionEntry {
    let modelHandle: String
    let session: Any
  }

  // TurboModule methods and Swift tasks reach the shared state from different threads
  private func locked<T>(_ body: () throws -> T) rethrows -> T {
    lock.lock()
    defer { lock.unlock() }
    return try body()
  }

  /// Runs work in a task that cancelStream can cancel, and reports its error
  private func startTask(
    _ id: String,
    onError: @escaping (String, String, String) -> Void,
    _ work: @escaping () async throws -> Void
  ) {
    let task = Task {
      do {
        try await work()
      } catch {
        let reportedError = Task.isCancelled ? CoreAIError.cancelled : error
        onError(id, errorCode(reportedError), reportedError.localizedDescription)
      }
      _ = self.locked { self.tasks.removeValue(forKey: id) }
    }
    locked { tasks[id] = task }
  }
}

#if canImport(FoundationModels) && canImport(CoreAILanguageModels)
@available(iOS 27, macOS 27, *)
extension CoreAIImpl {
  fileprivate static func serializeUsage(_ usage: LanguageModelSession.Usage) -> [String: Any] {
    return [
      "inputTokens": usage.input.totalTokenCount,
      "cachedInputTokens": usage.input.cachedTokenCount,
      "outputTokens": usage.output.totalTokenCount,
      "reasoningTokens": usage.output.reasoningTokenCount,
    ]
  }
}

/// One AI SDK call on a Core AI language model. Core AI models are Foundation
/// Models LanguageModels, so this reuses the Apple Foundation Models helpers
@available(iOS 27, macOS 27, *)
private struct LanguageModelRequest {
  let session: LanguageModelSession
  let prompt: String
  let generationOptions: GenerationOptions
  let contextOptions: ContextOptions

  init(model: CoreAILanguageModel, messages: [[String: Any]], options: [String: Any]) throws {
    // Tool calling is not wired up for Core AI yet, so the session has no tools
    let (transcript, prompt, attachments) = try AppleLLMImpl.createTranscriptAndPrompt(from: messages, tools: [])
    guard attachments.isEmpty else {
      throw CoreAIError.invalidInput("Core AI language models do not accept image prompts yet.")
    }

    self.session = LanguageModelSession(model: model, tools: [], transcript: transcript)
    self.prompt = prompt
    self.generationOptions = try AppleLLMImpl.createGenerationOptions(from: options)
    self.contextOptions = try AppleLLMImpl.createContextOptions(
      from: options["providerOptions"] as? [String: Any] ?? [:],
      includeSchemaInPrompt: nil
    )
  }

  func respond() async throws -> [String: Any] {
    let prompt = self.prompt
    let response = try await session.respond(options: generationOptions, contextOptions: contextOptions) {
      prompt
    }
    return ["content": response.toModelMessages(), "usage": CoreAIImpl.serializeUsage(response.usage)]
  }

  /// Sends snapshots of the response text, plus the reasoning entries when they
  /// change, and returns the usage of the response
  func stream(onUpdate: @escaping (String, [[String: Any]]?) -> Void) async throws -> [String: Any]? {
    let prompt = self.prompt
    var previousEntries: NSArray = []
    var usage: LanguageModelSession.Usage?

    func update(_ content: String, _ transcriptEntries: ArraySlice<Transcript.Entry>) {
      let entries = AppleLLMTranscriptSerializer.serialize(transcriptEntries, includeResponses: false)
      let entriesChanged = !(entries as NSArray).isEqual(previousEntries)
      previousEntries = entries as NSArray
      onUpdate(content, entriesChanged ? entries : nil)
    }

    let responseStream = session.streamResponse(options: generationOptions, contextOptions: contextOptions) {
      prompt
    }
    for try await chunk in responseStream {
      try Task.checkCancellation()
      update(chunk.content, chunk.transcriptEntries)
      usage = chunk.usage
    }

    return usage.map(CoreAIImpl.serializeUsage)
  }
}
#endif

private func errorCode(_ error: Error) -> String {
  if let coreAIError = error as? CoreAIError {
    return coreAIError.code
  }
  return "CORE_AI_ERROR"
}
