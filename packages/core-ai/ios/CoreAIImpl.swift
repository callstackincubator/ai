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

#if canImport(CoreAISpeech)
import AVFoundation
import CoreAISpeech
#endif

@objc
public class CoreAIImpl: NSObject {
  private let lock = NSLock()
  private var loadedModels: [String: Any] = [:]
  private var languageSessions: [String: LanguageSessionEntry] = [:]
  private var tasks: [String: Task<Void, Never>] = [:]
  // The speech model last used, by bundle path, since loading one compiles
  // and warms its graphs. One stays loaded, so switching models releases the
  // last one
  private var loadedSpeechModel: (path: String, load: Any)?
  private var transcriptionStreams: [String: Any] = [:]

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
#if !canImport(CoreAISpeech)
    missingProducts.append("CoreAISpeech")
#endif

    resolve([
      "isCoreAIRuntimeAvailable": Self.isCoreAIRuntimeAvailable(),
      "isCoreAILMAvailable": Self.isCoreAILMAvailable(),
      "isCoreAIDiffusionAvailable": Self.isCoreAIDiffusionAvailable(),
      "isCoreAISegmentationAvailable": Self.isCoreAISegmentationAvailable(),
      "isCoreAIObjectDetectionAvailable": Self.isCoreAIObjectDetectionAvailable(),
      "isCoreAISpeechAvailable": Self.isCoreAISpeechAvailable(),
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
          let coreAIError = Self.mapLanguageModelError(error)
          reject(errorCode(coreAIError), coreAIError.localizedDescription, coreAIError)
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
#if canImport(CoreAISpeech)
    if #available(iOS 27, macOS 27, *),
       let stream = locked({ transcriptionStreams.removeValue(forKey: streamId) }) as? TranscriptionStream {
      Task { await stream.cancel() }
    }
#endif
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
#if canImport(CoreAISpeech)
    if #available(iOS 27, macOS 27, *) {
      do {
        let sourceURL = try resolveSourceURL(config)
        guard let audio = Data(base64Encoded: audioBase64) else {
          throw CoreAIError.invalidInput("Expected base64 encoded audio.")
        }
        Task {
          do {
            let model = try await self.speechModel(at: sourceURL)
            let sampleRate = await model.sampleRate
            let pcm = try Self.loadPCM(audio, mediaType: mediaType, sampleRate: sampleRate)
            resolve(try await Self.transcribe(pcm, with: model))
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
    rejectCoreAI(.missingSwiftPackage("CoreAISpeech"), reject: reject)
#endif
  }

  /// Starts transcribing live audio, pushed with appendTranscriptionAudio as
  /// 16-bit PCM at options.sampleRate. Needs a streaming Parakeet TDT bundle
  @objc
  public func startTranscriptionStream(
    _ streamId: String,
    config: [String: Any],
    options: [String: Any]?,
    onUpdate: @escaping ([String: Any]) -> Void,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
#if canImport(CoreAISpeech)
    if #available(iOS 27, macOS 27, *) {
      do {
        let sourceURL = try resolveSourceURL(config)
        let inputSampleRate = options?["sampleRate"] as? Double ?? 16_000
        Task {
          do {
            let model = try await self.speechModel(at: sourceURL)
            let stream = try await TranscriptionStream(model: model, inputSampleRate: inputSampleRate) { update in
              onUpdate(update.merging(["streamId": streamId]) { current, _ in current })
            }
            self.locked { self.transcriptionStreams[streamId] = stream }
            resolve(nil)
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
    rejectCoreAI(.missingSwiftPackage("CoreAISpeech"), reject: reject)
#endif
  }

  @objc
  public func appendTranscriptionAudio(
    _ streamId: String,
    pcmBase64: String,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
#if canImport(CoreAISpeech)
    if #available(iOS 27, macOS 27, *) {
      guard let stream = locked({ transcriptionStreams[streamId] }) as? TranscriptionStream else {
        rejectCoreAI(.invalidInput("Core AI transcription stream was not found: \(streamId)."), reject: reject)
        return
      }
      guard let audio = Data(base64Encoded: pcmBase64) else {
        rejectCoreAI(.invalidInput("Expected base64 encoded 16-bit PCM."), reject: reject)
        return
      }
      Task {
        do {
          try await stream.append(audio)
          resolve(nil)
        } catch {
          reject(errorCode(error), error.localizedDescription, error)
        }
      }
    } else {
      rejectCoreAI(.unsupportedOS, reject: reject)
    }
#else
    rejectCoreAI(.missingSwiftPackage("CoreAISpeech"), reject: reject)
#endif
  }

  /// Transcribes the audio still buffered and resolves with the transcript
  @objc
  public func finishTranscriptionStream(
    _ streamId: String,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
#if canImport(CoreAISpeech)
    if #available(iOS 27, macOS 27, *) {
      guard let stream = locked({ transcriptionStreams.removeValue(forKey: streamId) }) as? TranscriptionStream else {
        rejectCoreAI(.invalidInput("Core AI transcription stream was not found: \(streamId)."), reject: reject)
        return
      }
      Task {
        do {
          resolve(try await stream.finish())
        } catch {
          reject(errorCode(error), error.localizedDescription, error)
        }
      }
    } else {
      rejectCoreAI(.unsupportedOS, reject: reject)
    }
#else
    rejectCoreAI(.missingSwiftPackage("CoreAISpeech"), reject: reject)
#endif
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
                "imageFormat": "image/png",
                "width": result.images.first?.width ?? 0,
                "height": result.images.first?.height ?? 0
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
              "output": try Self.serializeSegmentationResponse(response),
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

  private static func isCoreAISpeechAvailable() -> Bool {
#if canImport(CoreAISpeech)
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

  private static func serializeSegmentationResponse(_ response: SegmentationResponse) throws -> [String: Any] {
    var output: [String: Any] = [
      "segments": try response.segments.map { segment in
        [
          "score": segment.score,
          "box": serializeRect(segment.box),
          "maskWidth": segment.maskWidth,
          "maskHeight": segment.maskHeight,
          // A base64 PNG, since the mask is at input image resolution and one
          // boolean per pixel is too much to send over the bridge
          "mask": try pngBase64(maskImage(segment.mask, width: segment.maskWidth, height: segment.maskHeight))
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

  // White where the mask is set and transparent elsewhere, so it can be
  // tinted and drawn over the input image
  private static func maskImage(_ mask: [Bool], width: Int, height: Int) throws -> CGImage {
    var pixels = [UInt8](repeating: 0, count: width * height * 4)
    for (index, isSet) in mask.enumerated() where isSet {
      pixels.replaceSubrange(index * 4..<index * 4 + 4, with: [255, 255, 255, 255])
    }
    guard let provider = CGDataProvider(data: Data(pixels) as CFData),
          let image = CGImage(
            width: width,
            height: height,
            bitsPerComponent: 8,
            bitsPerPixel: 32,
            bytesPerRow: width * 4,
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
}
#endif

#if canImport(CoreAISpeech)
@available(iOS 27, macOS 27, *)
extension CoreAIImpl {
  // Concurrent calls for the same bundle share one load
  private func speechModel(at sourceURL: URL) async throws -> SpeechRecognitionModel {
    let load = locked { () -> Task<SpeechRecognitionModel, Error> in
      if let cached = loadedSpeechModel, cached.path == sourceURL.path,
         let load = cached.load as? Task<SpeechRecognitionModel, Error> {
        return load
      }
      let load = Task { try await SpeechRecognitionModel(resourcesAt: sourceURL) }
      loadedSpeechModel = (sourceURL.path, load)
      return load
    }
    do {
      return try await load.value
    } catch {
      // A failed load is retried on the next call
      locked {
        if loadedSpeechModel?.load as? Task<SpeechRecognitionModel, Error> == load {
          loadedSpeechModel = nil
        }
      }
      throw error
    }
  }

  /// Streaming bundles slide their window over audio of any length and close
  /// segments at pauses. Other bundles transcribe only as much audio as their
  /// traced window holds, in one segment
  private static func transcribe(_ pcm: [Float], with model: SpeechRecognitionModel) async throws -> [String: Any] {
    let sampleRate = await model.sampleRate
    let stream: TranscriptionStream
    do {
      stream = try await TranscriptionStream(model: model, inputSampleRate: sampleRate, onUpdate: nil)
    } catch SpeechError.incompatibleResources, SpeechError.invalidStreamingConfig {
      let durationInSeconds = Double(pcm.count) / sampleRate
      let (text, _) = try await model.transcribe(pcm: pcm)
      let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
      return [
        "text": trimmed,
        "segments": trimmed.isEmpty ? [] : [["text": trimmed, "startSecond": 0, "endSecond": durationInSeconds]],
        "durationInSeconds": durationInSeconds,
        "metadata": ["architecture": await model.architecture, "streaming": false]
      ]
    }

    // One second at a time, as a microphone would push it
    let chunkSize = Int(sampleRate)
    for start in stride(from: 0, to: pcm.count, by: chunkSize) {
      try await stream.append(samples: Array(pcm[start..<min(start + chunkSize, pcm.count)]))
    }
    return try await stream.finish()
  }

  /// Decodes audio to mono float PCM at the model's sample rate
  private static func loadPCM(_ audio: Data, mediaType: String, sampleRate: Double) throws -> [Float] {
    // AVAudioFile reads from files and picks the decoder by extension
    let fileURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("core-ai-audio-\(UUID().uuidString)")
      .appendingPathExtension(audioExtension(for: mediaType))
    try audio.write(to: fileURL)
    defer { try? FileManager.default.removeItem(at: fileURL) }

    let file: AVAudioFile
    do {
      file = try AVAudioFile(forReading: fileURL)
    } catch {
      throw CoreAIError.invalidInput("Could not decode \(mediaType) audio: \(error.localizedDescription)")
    }
    guard let outputFormat = AVAudioFormat(
      commonFormat: .pcmFormatFloat32,
      sampleRate: sampleRate,
      channels: 1,
      interleaved: false
    ),
      let converter = AVAudioConverter(from: file.processingFormat, to: outputFormat),
      let input = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length))
    else {
      throw CoreAIError.invalidInput("Could not convert \(mediaType) audio to \(Int(sampleRate)) Hz mono.")
    }
    try file.read(into: input)

    let capacity = AVAudioFrameCount(Double(input.frameLength) * sampleRate / file.processingFormat.sampleRate) + 1024
    guard let output = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: capacity) else {
      throw CoreAIError.invalidInput("Could not allocate the audio buffer.")
    }
    var consumed = false
    var conversionError: NSError?
    converter.convert(to: output, error: &conversionError) { _, status in
      if consumed {
        status.pointee = .endOfStream
        return nil
      }
      consumed = true
      status.pointee = .haveData
      return input
    }
    if let conversionError {
      throw CoreAIError.invalidInput("Could not convert \(mediaType) audio: \(conversionError.localizedDescription)")
    }
    guard let samples = output.floatChannelData?[0] else {
      return []
    }
    return Array(UnsafeBufferPointer(start: samples, count: Int(output.frameLength)))
  }

  fileprivate static func serializeSegment(_ segment: TranscriptSegment, type: String) -> [String: Any] {
    return [
      "type": type,
      "segmentIndex": segment.segmentIndex,
      "text": segment.text,
      "startSecond": segment.startTime,
      "endSecond": segment.endTime
    ]
  }

  private static func audioExtension(for mediaType: String) -> String {
    switch mediaType.lowercased() {
    case "audio/mpeg", "audio/mp3":
      return "mp3"
    case "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/aac":
      return "m4a"
    case "audio/flac", "audio/x-flac":
      return "flac"
    case "audio/x-caf", "audio/caf":
      return "caf"
    case "audio/aiff", "audio/x-aiff":
      return "aiff"
    default:
      return "wav"
    }
  }
}

/// One streaming session on a speech model. Partial updates are append-only
/// and segments close at pauses. A model runs one session at a time
@available(iOS 27, macOS 27, *)
private actor TranscriptionStream {
  private let model: SpeechRecognitionModel
  private let sampleRate: Double
  private let architecture: String
  // Resamples pushed audio to the model's rate, keeping filter state across chunks
  private let converter: AVAudioConverter?
  private let collector: Task<[[String: Any]], Error>
  private var sampleCount = 0

  init(
    model: SpeechRecognitionModel,
    inputSampleRate: Double,
    onUpdate: (([String: Any]) -> Void)?
  ) async throws {
    self.model = model
    self.sampleRate = await model.sampleRate
    self.architecture = await model.architecture

    if inputSampleRate != sampleRate {
      guard let inputFormat = AVAudioFormat(
        commonFormat: .pcmFormatFloat32, sampleRate: inputSampleRate, channels: 1, interleaved: false),
        let outputFormat = AVAudioFormat(
          commonFormat: .pcmFormatFloat32, sampleRate: sampleRate, channels: 1, interleaved: false),
        let converter = AVAudioConverter(from: inputFormat, to: outputFormat)
      else {
        throw CoreAIError.invalidInput("Could not resample \(Int(inputSampleRate)) Hz audio to \(Int(sampleRate)) Hz.")
      }
      self.converter = converter
    } else {
      self.converter = nil
    }

    let updates = try await model.startStream()
    self.collector = Task {
      var segments: [[String: Any]] = []
      for try await update in updates {
        switch update {
        case .partial(let segment):
          onUpdate?(CoreAIImpl.serializeSegment(segment, type: "partial"))
        case .finalized(let segment):
          onUpdate?(CoreAIImpl.serializeSegment(segment, type: "final"))
          let text = segment.text.trimmingCharacters(in: .whitespacesAndNewlines)
          if !text.isEmpty {
            segments.append(["text": text, "startSecond": segment.startTime, "endSecond": segment.endTime])
          }
        }
      }
      return segments
    }
  }

  /// Appends 16-bit little-endian mono PCM
  func append(_ pcm16: Data) async throws {
    guard pcm16.count % 2 == 0 else {
      throw CoreAIError.invalidInput("Expected 16-bit PCM, got an odd number of bytes.")
    }
    let samples = pcm16.withUnsafeBytes { bytes in
      bytes.bindMemory(to: Int16.self).map { Float(Int16(littleEndian: $0)) / 32_768 }
    }
    try await append(samples: samples)
  }

  func append(samples: [Float]) async throws {
    do {
      let resampled = try resample(samples, isLast: false)
      sampleCount += resampled.count
      try await model.append(pcm: resampled)
    } catch {
      await cancel()
      throw error
    }
  }

  func finish() async throws -> [String: Any] {
    do {
      let tail = try resample([], isLast: true)
      if !tail.isEmpty {
        sampleCount += tail.count
        try await model.append(pcm: tail)
      }
      try await model.finishStream()
    } catch {
      await cancel()
      throw error
    }
    let segments = try await collector.value
    return [
      "text": segments.compactMap { $0["text"] as? String }.joined(separator: " "),
      "segments": segments,
      "durationInSeconds": Double(sampleCount) / sampleRate,
      "metadata": ["architecture": architecture, "streaming": true]
    ]
  }

  // A session left running would make the model's next startStream throw
  func cancel() async {
    _ = try? await model.finishStream()
    collector.cancel()
  }

  private func resample(_ samples: [Float], isLast: Bool) throws -> [Float] {
    guard let converter else {
      return samples
    }
    let input = AVAudioPCMBuffer(pcmFormat: converter.inputFormat, frameCapacity: AVAudioFrameCount(max(samples.count, 1)))
    let ratio = converter.outputFormat.sampleRate / converter.inputFormat.sampleRate
    let output = AVAudioPCMBuffer(
      pcmFormat: converter.outputFormat,
      frameCapacity: AVAudioFrameCount(Double(samples.count) * ratio) + 1024
    )
    guard let input, let output else {
      throw CoreAIError.invalidInput("Could not allocate the audio buffer.")
    }
    samples.withUnsafeBufferPointer { pointer in
      if let baseAddress = pointer.baseAddress {
        input.floatChannelData?[0].update(from: baseAddress, count: samples.count)
      }
    }
    input.frameLength = AVAudioFrameCount(samples.count)

    var consumed = samples.isEmpty
    var conversionError: NSError?
    converter.convert(to: output, error: &conversionError) { _, status in
      if consumed {
        // More audio follows unless this is the last call, which flushes the filter
        status.pointee = isLast ? .endOfStream : .noDataNow
        return nil
      }
      consumed = true
      status.pointee = .haveData
      return input
    }
    if let conversionError {
      throw CoreAIError.invalidInput("Could not resample audio: \(conversionError.localizedDescription)")
    }
    guard let channel = output.floatChannelData?[0] else {
      return []
    }
    return Array(UnsafeBufferPointer(start: channel, count: Int(output.frameLength)))
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
          let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let width = properties[kCGImagePropertyPixelWidth] as? Int,
          let height = properties[kCGImagePropertyPixelHeight] as? Int else {
      throw CoreAIError.invalidInput("Could not load image at \(url.path).")
    }
    // Decode with the EXIF orientation applied, so pixel coordinates match
    // the image as it is displayed
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: max(width, height)
    ]
    guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
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
        let reportedError = Task.isCancelled ? CoreAIError.cancelled : Self.mapLanguageModelError(error)
        onError(id, errorCode(reportedError), reportedError.localizedDescription)
      }
      _ = self.locked { self.tasks.removeValue(forKey: id) }
    }
    locked { tasks[id] = task }
  }

  private static func mapLanguageModelError(_ error: Error) -> Error {
#if canImport(FoundationModels) && canImport(CoreAILanguageModels)
    if #available(iOS 27, macOS 27, *),
       let languageModelError = error as? LanguageModelError,
       case .unsupportedCapability(let unsupported) = languageModelError,
       unsupported.capability == .guidedGeneration {
      return CoreAIError.unsupportedCapability(
        "This Core AI model does not support guided generation, which structured output (responseFormat with a schema) needs. Its inference engine has no per-step logits."
      )
    }
#endif
    return error
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
  let schema: GenerationSchema?

  init(model: CoreAILanguageModel, messages: [[String: Any]], options: [String: Any]) throws {
    // Tool calling is not wired up for Core AI yet, so the session has no tools
    let (transcript, prompt, attachments) = try AppleLLMImpl.createTranscriptAndPrompt(from: messages, tools: [])
    guard attachments.isEmpty else {
      throw CoreAIError.invalidInput("Core AI language models do not accept image prompts yet.")
    }

    let schema = try AppleLLMImpl.createGenerationSchema(from: options)
    self.session = LanguageModelSession(model: model, tools: [], transcript: transcript)
    self.prompt = prompt
    self.generationOptions = try AppleLLMImpl.createGenerationOptions(from: options)
    var providerOptions = options["providerOptions"] as? [String: Any] ?? [:]
    let disablesReasoning = providerOptions["reasoningLevel"] as? String == "none"
    if disablesReasoning {
      providerOptions["reasoningLevel"] = nil
    }
    var contextOptions = try AppleLLMImpl.createContextOptions(
      from: providerOptions,
      includeSchemaInPrompt: schema == nil ? nil : true
    )
    // Core AI chat templates turn thinking off for the custom "none" effort
    if disablesReasoning {
      contextOptions.reasoningLevel = .custom("none")
    }
    self.contextOptions = contextOptions
    self.schema = schema
  }

  func respond() async throws -> [String: Any] {
    let prompt = self.prompt

    if let schema {
      let response = try await session.respond(
        schema: schema,
        options: generationOptions,
        contextOptions: contextOptions
      ) {
        prompt
      }
      // The JSON comes from the generated content rather than the response entry
      let content = AppleLLMTranscriptSerializer.serialize(response.transcriptEntries, includeResponses: false)
        + [["type": "text", "text": response.rawContent.jsonString]]
      return ["content": content, "usage": CoreAIImpl.serializeUsage(response.usage)]
    }

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

    if let schema {
      let responseStream = session.streamResponse(
        schema: schema,
        options: generationOptions,
        contextOptions: contextOptions
      ) {
        prompt
      }
      var json = ""
      for try await chunk in responseStream {
        try Task.checkCancellation()
        // Partial JSON is not a prefix of the final JSON, so it is sent once complete
        update("", chunk.transcriptEntries)
        json = chunk.rawContent.jsonString
        usage = chunk.usage
      }
      onUpdate(json, nil)
    } else {
      let responseStream = session.streamResponse(options: generationOptions, contextOptions: contextOptions) {
        prompt
      }
      for try await chunk in responseStream {
        try Task.checkCancellation()
        update(chunk.content, chunk.transcriptEntries)
        usage = chunk.usage
      }
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
