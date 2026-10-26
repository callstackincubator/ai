
//
//  AppleLLM.swift
//  AppleLLM
//
//  Created by Mike Grabowski on 06/07/2025.
//

import Foundation
import ImageIO
import React

#if canImport(FoundationModels)
import FoundationModels
#endif
#if canImport(ImagePlayground)
import ImagePlayground
#endif
// OCRTool and BarcodeReaderTool live in the Vision + FoundationModels cross-import
// overlay, which the iOS Simulator SDK does not ship.
#if compiler(>=6.4) && canImport(_Vision_FoundationModels)
import Vision
private let supportsVisionTools = true
#else
private let supportsVisionTools = false
#endif

public typealias ToolInvoker = @Sendable (String, String, @escaping (Any?, Error?) -> Void) -> Void

@objc
public class AppleLLMImpl: NSObject {
  private struct ImageURL {
    let url: URL
    let needsCleanup: Bool
  }
  
  // Tasks start on the JS thread and finish on the cooperative pool
  private var streamTasks: [String: Task<Void, Never>] = [:]
  private let streamTasksLock = NSLock()

  private func removeTask(for id: String) -> Task<Void, Never>? {
    streamTasksLock.withLock { streamTasks.removeValue(forKey: id) }
  }
  
  @objc
  public func isAvailable() -> Bool {
#if canImport(FoundationModels)
    if #available(iOS 26, *) {
      return SystemLanguageModel.default.availability == .available
    } else {
      return false
    }
#else
    return false
#endif
  }

  @objc
  public func countTokens(
    _ text: String,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
#if canImport(FoundationModels)
#if compiler(>=6.3)
    if #available(iOS 26.4, *) {
      let availability = availabilityString(SystemLanguageModel.default.availability)
      guard availability == "available" else {
        rejectWithAppleError(.modelUnavailable(availability), reject: reject)
        return
      }
      Task {
        do {
          let tokenCount = try await SystemLanguageModel.default.tokenCount(for: text)
          resolve(tokenCount)
        } catch {
          reject("AppleLLM", error.localizedDescription, error)
        }
      }
    } else {
      let error = AppleLLMError.unsupportedOS
      reject("AppleLLM", error.localizedDescription, error)
    }
#else
    let error = AppleLLMError.unsupportedOS
    reject("AppleLLM", error.localizedDescription, error)
#endif
#else
    let error = AppleLLMError.unsupportedOS
    reject("AppleLLM", error.localizedDescription, error)
#endif
  }

  @objc
  public func getModelInfo(
    _ localeIdentifier: String?,
    model requestedModel: String?,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
#if canImport(FoundationModels)
    if #available(iOS 26, *) {
      let modelName = requestedModel ?? "system"
      let locale = localeIdentifier.map(Locale.init(identifier:)) ?? Locale.current

      switch modelName {
      case "system":
        resolve(modelInfo(for: SystemLanguageModel.default, locale: locale, modelName: modelName))
      case "private-cloud-compute":
#if compiler(>=6.4)
        if #available(iOS 27, *) {
          let model = PrivateCloudComputeLanguageModel()
          Task {
            do {
              let info = try await modelInfo(for: model, locale: locale, modelName: modelName)
            resolve(info)
            } catch {
              reject("AppleLLM", error.localizedDescription, error)
            }
          }
        } else {
          rejectWithAppleError(.unsupportedOS, reject: reject)
        }
#else
        rejectWithAppleError(.unsupportedOS, reject: reject)
#endif
      default:
        rejectWithAppleError(.invalidMessage("Unsupported model '\(modelName)'"), reject: reject)
      }
    } else {
      rejectWithAppleError(.unsupportedOS, reject: reject)
    }
#else
    rejectWithAppleError(.unsupportedOS, reject: reject)
#endif
  }

  @objc
  public func generateImages(
    _ options: [String: Any],
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
    // Apple discontinued ImageCreator in iOS 27, where it throws notSupported
    if #available(iOS 27, *) {
      rejectWithAppleError(.unsupportedOS, reject: reject)
      return
    }
#if canImport(ImagePlayground)
    if #available(iOS 26.4, *) {
      Task {
        do {
          let creator = try await ImageCreator()
          let playgroundConcepts = try Self.createImagePlaygroundConcepts(from: options)
          defer {
            Self.removeTemporaryFiles(playgroundConcepts.temporaryFileURLs)
          }
          let style = Self.createImagePlaygroundStyle(from: options["style"] as? String)
          let limit = max(1, min(options["n"] as? Int ?? 1, 4))
          var images: [String] = []

#if compiler(>=6.3)
          let imageOptions = Self.createImagePlaygroundOptions(from: options)
          for try await createdImage in creator.images(
            for: playgroundConcepts.values,
            style: style,
            options: imageOptions,
            limit: limit
          ) {
            let data = try Self.pngData(from: createdImage.cgImage)
            images.append(data.base64EncodedString())

            if images.count >= limit {
              break
            }
          }
#else
          for try await createdImage in creator.images(
            for: playgroundConcepts.values,
            style: style,
            limit: limit
          ) {
            let data = try Self.pngData(from: createdImage.cgImage)
            images.append(data.base64EncodedString())

            if images.count >= limit {
              break
            }
          }
#endif

          resolve(images)
        } catch {
          reject("AppleLLM", error.localizedDescription, error)
        }
      }
    } else {
      rejectWithAppleError(.unsupportedOS, reject: reject)
    }
#else
    rejectWithAppleError(.unsupportedOS, reject: reject)
#endif
  }

  @objc
  public func generateText(
    _ messages: [[String: Any]],
    options: [String: Any],
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void,
    toolInvoker: @escaping ToolInvoker
  ) {
#if canImport(FoundationModels)
    if #available(iOS 26, *) {
      // Lets cancelStream() stop the generation when the call is aborted
      let requestId = createProviderOptions(from: options)["requestId"] as? String
      // Held until the task is stored, so a task that finishes right away still removes itself
      streamTasksLock.lock()
      defer { streamTasksLock.unlock() }
      let task = Task {
        defer {
          if let requestId {
            _ = self.removeTask(for: requestId)
          }
        }
        do {
          let providerOptions = self.createProviderOptions(from: options)
          let tools = try self.createTools(from: options, providerOptions: providerOptions, toolInvoker: toolInvoker)
          let (transcript, userPrompt, promptAttachments) = try Self.createTranscriptAndPrompt(
            from: messages,
            tools: tools
          )

          let session = try self.createSession(
            providerOptions: providerOptions,
            tools: tools,
            transcript: transcript,
            toolCallingMode: options["toolCallingMode"] as? String
          )

          let generationOptions = try Self.createGenerationOptions(from: options)
          let generationSchema = try Self.createGenerationSchema(from: options)

          do {
            let response = try await self.respond(
              with: session,
              userPrompt: userPrompt,
              promptAttachments: promptAttachments,
              generationSchema: generationSchema,
              generationOptions: generationOptions,
              providerOptions: providerOptions
            )
            resolve(response)
          } catch {
            if let appleError = self.mapToAppleLLMError(error, includeGenerationFallback: true) {
              self.rejectWithAppleError(appleError, reject: reject)
            } else {
              reject("AppleLLM", error.localizedDescription, error)
            }
          }
        } catch {
          if let appleError = self.mapKnownAppleLLMError(error) {
            self.rejectWithAppleError(appleError, reject: reject)
          } else {
            reject("AppleLLM", error.localizedDescription, error)
          }
        }
      }
      if let requestId {
        streamTasks[requestId] = task
      }
    } else {
      rejectWithAppleError(.unsupportedOS, reject: reject)
    }
#else
    rejectWithAppleError(.unsupportedOS, reject: reject)
#endif
  }
  
  @objc
  public func generateStream(
    _ streamId: String,
    messages: [[String: Any]],
    options: [String: Any],
    onUpdate: @escaping (String, String, [[String: Any]]?) -> Void,
    onComplete: @escaping (String, [String: Any]?) -> Void,
    onError: @escaping (String, String, String) -> Void,
    toolInvoker: @escaping ToolInvoker
  ) {
#if canImport(FoundationModels)
    if #available(iOS 26, *) {
      // Held until the task is stored, so a task that finishes right away still removes itself
      streamTasksLock.lock()
      defer { streamTasksLock.unlock() }
      let task = Task {
        do {
          let providerOptions = self.createProviderOptions(from: options)
          let tools = try self.createTools(from: options, providerOptions: providerOptions, toolInvoker: toolInvoker)
          let (transcript, userPrompt, promptAttachments) = try Self.createTranscriptAndPrompt(
            from: messages,
            tools: tools
          )

          let session = try self.createSession(
            providerOptions: providerOptions,
            tools: tools,
            transcript: transcript,
            toolCallingMode: options["toolCallingMode"] as? String
          )

          let generationOptions = try Self.createGenerationOptions(from: options)
          let generationSchema = try Self.createGenerationSchema(from: options)

          do {
            let usage = try await self.streamResponse(
              with: session,
              userPrompt: userPrompt,
              promptAttachments: promptAttachments,
              generationSchema: generationSchema,
              generationOptions: generationOptions,
              providerOptions: providerOptions
            ) { chunk, entries in
              onUpdate(streamId, chunk, entries)
            }

            if !Task.isCancelled {
              onComplete(streamId, usage)
            }
          } catch {
            if Task.isCancelled {
              return
            }

            if let appleError = self.mapToAppleLLMError(error, includeGenerationFallback: true) {
              self.emitStreamError(appleError, streamId: streamId, onError: onError)
            } else {
              onError(streamId, "", error.localizedDescription)
            }
          }
        } catch {
          if Task.isCancelled {
            return
          }

          if let appleError = self.mapKnownAppleLLMError(error) {
            self.emitStreamError(appleError, streamId: streamId, onError: onError)
          } else {
            onError(streamId, "", error.localizedDescription)
          }
        }
        
        // Clean up task from map when completed
        _ = self.removeTask(for: streamId)
      }
      
      // Store task in map
      streamTasks[streamId] = task
    } else {
      emitStreamError(.unsupportedOS, streamId: streamId, onError: onError)
    }
#else
    emitStreamError(.unsupportedOS, streamId: streamId, onError: onError)
#endif
  }
  
  @objc
  public func cancelStream(_ streamId: NSString) {
    removeTask(for: streamId as String)?.cancel()
  }
  
  // MARK: - Private Methods

  private func rejectWithAppleError(
    _ error: AppleLLMError,
    reject: @escaping (String, String, Error?) -> Void
  ) {
    if let publicErrorCode = error.publicErrorCode {
      reject(publicErrorCode, error.localizedDescription, error)
    } else {
      reject("AppleLLM", error.localizedDescription, error)
    }
  }

  private func emitStreamError(
    _ error: AppleLLMError,
    streamId: String,
    onError: @escaping (String, String, String) -> Void
  ) {
    onError(streamId, error.publicErrorCode ?? "", error.localizedDescription)
  }

#if canImport(FoundationModels)
  @available(iOS 26, *)
  private func modelInfo(for model: SystemLanguageModel, locale: Locale, modelName: String) -> [String: Any] {
    var info: [String: Any] = [
      "model": modelName,
      "availability": availabilityString(model.availability),
      "supportsLocale": model.supportsLocale(locale),
      "supportedLanguages": model.supportedLanguages.map(languageIdentifier).sorted(),
      "supportsTokenCounting": false,
      "supportsImagePrompts": false,
      "supportsDynamicProfiles": false,
      "supportsVisionTools": false,
      "supportsReasoning": false,
    ]

#if compiler(>=6.3)
    if #available(iOS 26.4, *) {
      info["contextSize"] = model.contextSize
      info["supportsTokenCounting"] = true
    }

    if #available(iOS 27, *) {
      info["supportsImagePrompts"] = true
      info["supportsDynamicProfiles"] = true
      info["supportsVisionTools"] = supportsVisionTools
    }
#endif

#if compiler(>=6.4)
    if #available(iOS 27, *) {
      info["supportsReasoning"] = model.capabilities.contains(.reasoning)
    }
#endif

    return info
  }

#if compiler(>=6.4)
  @available(iOS 27, *)
  private func modelInfo(
    for model: PrivateCloudComputeLanguageModel,
    locale: Locale,
    modelName: String
  ) async throws -> [String: Any] {
    let availability = privateCloudComputeAvailability(model)
    var info: [String: Any] = [
      "model": modelName,
      "availability": availability,
      "supportsLocale": false,
      "supportedLanguages": [String](),
      // PrivateCloudComputeLanguageModel has no tokenCount(for:) API, only SystemLanguageModel does
      "supportsTokenCounting": false,
      "supportsImagePrompts": true,
      "supportsDynamicProfiles": true,
      "supportsVisionTools": supportsVisionTools,
      "supportsReasoning": model.capabilities.contains(.reasoning),
    ]

    // Model metadata is fetched asynchronously, so only ask for it once Private Cloud
    // Compute is available and report the unavailable reason otherwise
    guard availability == "available" else {
      return info
    }

    info["contextSize"] = try await model.contextSize
    info["supportsLocale"] = try await model.supportsLocale(locale)
    info["supportedLanguages"] = try await model.supportedLanguages.map(languageIdentifier).sorted()
    return info
  }

  /// Workaround: Foundation Models stops the app with a fatal error, which
  /// cannot be caught, when it uses Private Cloud Compute without the managed
  /// entitlement, and iOS has no API to check for it. Apps that have it say so
  /// in their Info.plist (the Expo plugin's privateCloudCompute option sets
  /// both). Remove once Foundation Models throws instead of stopping the app
  @available(iOS 27, *)
  private func privateCloudComputeAvailability(_ model: PrivateCloudComputeLanguageModel) -> String {
    guard Bundle.main.object(forInfoDictionaryKey: "AppleLLMPrivateCloudCompute") as? Bool == true else {
      return "missingEntitlement"
    }
    return availabilityString(model.availability)
  }

  @available(iOS 27, *)
  private func availabilityString(_ availability: PrivateCloudComputeLanguageModel.Availability) -> String {
    switch availability {
    case .available:
      return "available"
    case .unavailable(.deviceNotEligible):
      return "deviceNotEligible"
    case .unavailable(.systemNotReady):
      return "systemNotReady"
    case .unavailable:
      return "unknown"
    }
  }
#endif

  @available(iOS 26, *)
  private func availabilityString(_ availability: SystemLanguageModel.Availability) -> String {
    switch availability {
    case .available:
      return "available"
    case .unavailable(.deviceNotEligible):
      return "deviceNotEligible"
    case .unavailable(.appleIntelligenceNotEnabled):
      return "appleIntelligenceNotEnabled"
    case .unavailable(.modelNotReady):
      return "modelNotReady"
    case .unavailable:
      return "unknown"
    }
  }

  @available(iOS 26, *)
  private func languageIdentifier(_ language: Locale.Language) -> String {
    guard let languageCode = language.languageCode?.identifier else {
      return language.minimalIdentifier
    }

    guard let region = language.region?.identifier else {
      return languageCode
    }

    return "\(languageCode)-\(region)"
  }

  @available(iOS 26, *)
  private func createProviderOptions(from options: [String: Any]) -> [String: Any] {
    guard let providerOptions = options["providerOptions"] as? [String: Any] else {
      return [:]
    }

    return providerOptions
  }

  @available(iOS 26, *)
  private func createSession(
    providerOptions: [String: Any],
    tools: [any Tool],
    transcript: Transcript,
    toolCallingMode: String?
  ) throws -> LanguageModelSession {
    let modelName = providerOptions["model"] as? String ?? "system"
    let maxToolCalls = providerOptions["maxToolCalls"] as? Int
    // Disallowed tool calling needs no profile, and also turns off built-in tools
    let usesToolCallingProfile = toolCallingMode == "required"
      || (maxToolCalls != nil && toolCallingMode != "disallowed")

    // Availability is checked for the requested model, so Private Cloud Compute
    // requests work even when the on-device model is not available
    switch modelName {
    case "system":
      let model = providerOptions["guardrails"] as? String == "permissiveContentTransformations"
        ? SystemLanguageModel(guardrails: .permissiveContentTransformations)
        : SystemLanguageModel.default
      let availability = availabilityString(model.availability)
      guard availability == "available" else {
        throw AppleLLMError.modelUnavailable(availability)
      }
#if compiler(>=6.4)
      if #available(iOS 27, *), usesToolCallingProfile {
        return createToolCallingSession(
          model: model,
          tools: tools,
          transcript: transcript,
          required: toolCallingMode == "required",
          maxToolCalls: maxToolCalls
        )
      }
#endif
      // Limiting tool calls needs the Dynamic Profiles in iOS 27
      if usesToolCallingProfile, maxToolCalls != nil {
        throw AppleLLMError.unsupportedOS
      }
      return LanguageModelSession(
        model: model,
        tools: tools,
        transcript: transcript
      )
    case "private-cloud-compute":
#if compiler(>=6.4)
      if #available(iOS 27, *) {
        let model = PrivateCloudComputeLanguageModel()
        let availability = privateCloudComputeAvailability(model)
        guard availability == "available" else {
          throw AppleLLMError.modelUnavailable(availability)
        }
        if usesToolCallingProfile {
          return createToolCallingSession(
            model: model,
            tools: tools,
            transcript: transcript,
            required: toolCallingMode == "required",
            maxToolCalls: maxToolCalls
          )
        }
        return LanguageModelSession(
          model: model,
          tools: tools,
          transcript: transcript
        )
      }
#endif
      throw AppleLLMError.unsupportedOS
    default:
      throw AppleLLMError.invalidMessage("Unsupported model '\(modelName)'")
    }
  }

#if compiler(>=6.4)
  /// Apple's required mode applies to every model request in its tool loop, so the model
  /// would keep calling tools and never answer. The profile only requires the first call,
  /// and stops tool calls once maxToolCalls is reached
  @available(iOS 27, *)
  private func createToolCallingSession(
    model: some LanguageModel,
    tools: [any Tool],
    transcript: Transcript,
    required: Bool,
    maxToolCalls: Int?
  ) -> LanguageModelSession {
    // A profile declares its own instructions and tools, so they are left out of the history
    var instructions: [String] = []
    var history: [Transcript.Entry] = []
    for entry in transcript {
      if case .instructions(let entryInstructions) = entry {
        instructions.append(contentsOf: entryInstructions.segments.map { String(describing: $0) })
      } else {
        history.append(entry)
      }
    }

    let profile = ToolCallingProfile(
      model: model,
      instructions: instructions.isEmpty ? nil : instructions.joined(separator: "\n"),
      tools: tools,
      required: required,
      maxToolCalls: maxToolCalls
    )
    return LanguageModelSession(profile: profile, history: history)
  }
#endif

  @available(iOS 26, *)
  private func respond(
    with session: LanguageModelSession,
    userPrompt: String,
    promptAttachments: [[String: Any]],
    generationSchema: GenerationSchema?,
    generationOptions: GenerationOptions,
    providerOptions: [String: Any]
  ) async throws -> [String: Any] {
#if compiler(>=6.4)
    if #available(iOS 27, *) {
      let contextOptions = try Self.createContextOptions(
        from: providerOptions,
        includeSchemaInPrompt: generationSchema == nil ? nil : true
      )
      let preparedAttachments = try createImageAttachments(from: promptAttachments)
      defer {
        Self.removeTemporaryFiles(preparedAttachments.temporaryFileURLs)
      }

      if let generationSchema {
        let response = try await session.respond(
          schema: generationSchema,
          options: generationOptions,
          contextOptions: contextOptions
        ) {
          userPrompt
          for attachment in preparedAttachments.values {
            attachment
          }
        }
        return Self.generationResult(content: response.toModelMessages(), usage: Self.usageDictionary(response.usage))
      }

      let response = try await session.respond(
        options: generationOptions,
        contextOptions: contextOptions
      ) {
        userPrompt
        for attachment in preparedAttachments.values {
          attachment
        }
      }
      return Self.generationResult(content: response.toModelMessages(), usage: Self.usageDictionary(response.usage))
    }
#endif

    // Image prompts and reasoning levels require iOS 27
    guard promptAttachments.isEmpty, providerOptions["reasoningLevel"] == nil else {
      throw AppleLLMError.unsupportedOS
    }

    let transcriptBefore = session.transcript
    let content: [[String: Any]]
    if let generationSchema {
      let response = try await session.respond(
        to: userPrompt,
        schema: generationSchema,
        includeSchemaInPrompt: true,
        options: generationOptions
      )
      content = response.toModelMessages()
    } else {
      let response = try await session.respond(to: userPrompt, options: generationOptions)
      content = response.toModelMessages()
    }

    let usage = await countUsage(
      session: session,
      transcriptBefore: transcriptBefore,
      userPrompt: userPrompt,
      providerOptions: providerOptions
    )
    return Self.generationResult(content: content, usage: usage)
  }

  private static func generationResult(content: [[String: Any]], usage: [String: Any]?) -> [String: Any] {
    var result: [String: Any] = ["content": content]
    if let usage {
      result["usage"] = usage
    }
    return result
  }

#if compiler(>=6.4)
  @available(iOS 27, *)
  private static func usageDictionary(_ usage: LanguageModelSession.Usage) -> [String: Any] {
    return [
      "inputTokens": usage.input.totalTokenCount,
      "cachedInputTokens": usage.input.cachedTokenCount,
      "outputTokens": usage.output.totalTokenCount,
      "reasoningTokens": usage.output.reasoningTokenCount,
    ]
  }
#endif

  /// iOS 26 responses report no usage, so the system model's tokenizer (iOS 26.4)
  /// counts the transcript before and after the response. Private Cloud Compute
  /// has no tokenizer, so its usage stays unknown
  @available(iOS 26, *)
  private func countUsage(
    session: LanguageModelSession,
    transcriptBefore: Transcript,
    userPrompt: String,
    providerOptions: [String: Any]
  ) async -> [String: Any]? {
#if compiler(>=6.3)
    guard #available(iOS 26.4, *), (providerOptions["model"] as? String ?? "system") == "system" else {
      return nil
    }

    let model = SystemLanguageModel.default
    guard let historyTokens = try? await model.tokenCount(for: transcriptBefore),
          let promptTokens = try? await model.tokenCount(for: userPrompt),
          let totalTokens = try? await model.tokenCount(for: session.transcript) else {
      return nil
    }

    let inputTokens = historyTokens + promptTokens
    return [
      "inputTokens": inputTokens,
      "outputTokens": max(totalTokens - inputTokens, 0),
    ]
#else
    return nil
#endif
  }

  @available(iOS 26, *)
  private func streamResponse(
    with session: LanguageModelSession,
    userPrompt: String,
    promptAttachments: [[String: Any]],
    generationSchema: GenerationSchema?,
    generationOptions: GenerationOptions,
    providerOptions: [String: Any],
    onUpdate: @escaping (String, [[String: Any]]?) -> Void
  ) async throws -> [String: Any]? {
    // Reasoning and tool activity are only sent when they change
    var previousContent: String?
    var previousEntries: NSArray = []
    func update(_ content: String, _ entries: [[String: Any]]) {
      let entriesChanged = !(entries as NSArray).isEqual(previousEntries)
      guard entriesChanged || content != previousContent else {
        return
      }
      previousContent = content
      previousEntries = entries as NSArray
      onUpdate(content, entriesChanged ? entries : nil)
    }

#if compiler(>=6.4)
    if #available(iOS 27, *) {
      let contextOptions = try Self.createContextOptions(
        from: providerOptions,
        includeSchemaInPrompt: generationSchema == nil ? nil : true
      )
      let preparedAttachments = try createImageAttachments(from: promptAttachments)
      defer {
        Self.removeTemporaryFiles(preparedAttachments.temporaryFileURLs)
      }

      var usage: LanguageModelSession.Usage?
      if let generationSchema {
        let responseStream = session.streamResponse(
          schema: generationSchema,
          options: generationOptions,
          contextOptions: contextOptions
        ) {
          userPrompt
          for attachment in preparedAttachments.values {
            attachment
          }
        }
        for try await chunk in responseStream {
          usage = chunk.usage
          update(
            chunk.rawContent.jsonString,
            AppleLLMTranscriptSerializer.serialize(chunk.transcriptEntries, includeResponses: false)
          )
        }
      } else {
        let responseStream = session.streamResponse(
          options: generationOptions,
          contextOptions: contextOptions
        ) {
          userPrompt
          for attachment in preparedAttachments.values {
            attachment
          }
        }
        for try await chunk in responseStream {
          usage = chunk.usage
          update(
            chunk.content,
            AppleLLMTranscriptSerializer.serialize(chunk.transcriptEntries, includeResponses: false)
          )
        }
      }
      return usage.map(Self.usageDictionary)
    }
#endif

    // Image prompts and reasoning levels require iOS 27
    guard promptAttachments.isEmpty, providerOptions["reasoningLevel"] == nil else {
      throw AppleLLMError.unsupportedOS
    }

    // iOS 26 snapshots have no transcript entries, so tool activity is read from
    // the session transcript, which grows while the response streams
    let transcriptBefore = session.transcript
    let newEntries = {
      AppleLLMTranscriptSerializer.serialize(
        session.transcript.dropFirst(transcriptBefore.count),
        includeResponses: false
      )
    }

    var content = ""
    if let generationSchema {
      let responseStream = session.streamResponse(
        to: userPrompt,
        schema: generationSchema,
        includeSchemaInPrompt: true,
        options: generationOptions
      )
      for try await chunk in responseStream {
        content = chunk.rawContent.jsonString
        update(content, newEntries())
      }
    } else {
      let responseStream = session.streamResponse(to: userPrompt, options: generationOptions)
      for try await chunk in responseStream {
        content = chunk.content
        update(content, newEntries())
      }
    }
    // Entries added after the last snapshot
    update(content, newEntries())

    return await countUsage(
      session: session,
      transcriptBefore: transcriptBefore,
      userPrompt: userPrompt,
      providerOptions: providerOptions
    )
  }

#if compiler(>=6.4)
  @available(iOS 27, *)
  // Shared with @react-native-ai/core-ai, whose models drive the same LanguageModelSession
  @_spi(CoreAI) public static func createContextOptions(
    from providerOptions: [String: Any],
    includeSchemaInPrompt: Bool?
  ) throws -> ContextOptions {
    return ContextOptions(
      includeSchemaInPrompt: includeSchemaInPrompt,
      reasoningLevel: try createReasoningLevel(from: providerOptions)
    )
  }

  @available(iOS 27, *)
  static func createReasoningLevel(from providerOptions: [String: Any]) throws -> ContextOptions.ReasoningLevel? {
    guard let reasoningLevel = providerOptions["reasoningLevel"] as? String else {
      return nil
    }

    switch reasoningLevel {
    case "light":
      return .light
    case "moderate":
      return .moderate
    case "deep":
      return .deep
    default:
      throw AppleLLMError.invalidMessage("Unsupported Apple reasoning level '\(reasoningLevel)'")
    }
  }
#endif

  @available(iOS 26, *)
  private func mapKnownAppleLLMError(_ error: Error) -> AppleLLMError? {
    if let appleError = error as? AppleLLMError {
      return appleError
    }

    // Foundation Models wraps errors thrown by tools
    if let toolCallError = error as? LanguageModelSession.ToolCallError {
      return mapKnownAppleLLMError(toolCallError.underlyingError) ?? .toolCallError(toolCallError.underlyingError)
    }

#if compiler(>=6.4)
    if #available(iOS 27, *) {
      if let languageModelError = error as? LanguageModelError {
        let message = languageModelError.localizedDescription
        switch languageModelError {
        case .contextSizeExceeded:
          return .contextWindowExceeded
        case .rateLimited:
          return .rateLimited
        case .guardrailViolation:
          return .guardrailViolation(message)
        case .refusal:
          return .refusal(message)
        case .unsupportedLanguageOrLocale:
          return .unsupportedLanguage(message)
        case .unsupportedGenerationGuide:
          return .invalidSchema(message)
        case .timeout:
          return .timeout(message)
        default:
          return nil
        }
      }

      // iOS 27 moves these GenerationError cases to their own types
      if let systemModelError = error as? SystemLanguageModel.Error,
         case .assetsUnavailable = systemModelError {
        return .assetsUnavailable(systemModelError.localizedDescription)
      }
      if let sessionError = error as? LanguageModelSession.Error,
         case .concurrentRequests = sessionError {
        return .concurrentRequests(sessionError.localizedDescription)
      }
      if let parsingError = error as? GeneratedContent.ParsingError {
        return .decodingFailure(parsingError.localizedDescription)
      }

      if let privateCloudComputeError = error as? PrivateCloudComputeLanguageModel.Error {
        let message = privateCloudComputeError.localizedDescription
        switch privateCloudComputeError {
        case .quotaLimitReached:
          return .rateLimited
        case .networkFailure:
          return .networkFailure(message)
        case .serviceUnavailable:
          return .serviceUnavailable(message)
        @unknown default:
          return nil
        }
      }
    }
#endif

    guard let generationError = error as? LanguageModelSession.GenerationError else {
      return nil
    }

    let message = generationError.localizedDescription
    switch generationError {
    case .exceededContextWindowSize:
      return .contextWindowExceeded
    case .rateLimited:
      return .rateLimited
    case .guardrailViolation:
      return .guardrailViolation(message)
    case .refusal:
      return .refusal(message)
    case .unsupportedLanguageOrLocale:
      return .unsupportedLanguage(message)
    case .assetsUnavailable:
      return .assetsUnavailable(message)
    case .concurrentRequests:
      return .concurrentRequests(message)
    case .decodingFailure:
      return .decodingFailure(message)
    case .unsupportedGuide:
      return .invalidSchema(message)
    @unknown default:
      return nil
    }
  }

  @available(iOS 26, *)
  private func mapToAppleLLMError(_ error: Error, includeGenerationFallback: Bool) -> AppleLLMError? {
    if let appleError = mapKnownAppleLLMError(error) {
      return appleError
    }

    if includeGenerationFallback {
      return .generationError(error.localizedDescription)
    }

    return nil
  }

  @available(iOS 26, *)
  @_spi(CoreAI) public static func createGenerationSchema(from options: [String: Any]) throws -> GenerationSchema? {
    guard let schemaOption = options["schema"] as? [String: Any] else {
      return nil
    }

    return try Self.createGenerationSchema(fromSchema: schemaOption)
  }

  @available(iOS 26, *)
  private static func createGenerationSchema(fromSchema schema: [String: Any], name: String = "Root") throws -> GenerationSchema {
    do {
      return try AppleLLMSchemaParser.createGenerationSchema(from: schema, name: name)
    } catch let appleError as AppleLLMError {
      throw appleError
    } catch {
      throw AppleLLMError.invalidSchema(error.localizedDescription)
    }
  }

  @available(iOS 26, *)
  private func createTools(
    from options: [String: Any],
    providerOptions: [String: Any],
    toolInvoker: @escaping ToolInvoker
  ) throws -> [any Tool] {
    guard let toolsDict = options["tools"] as? [[String: Any]] else {
      return try createBuiltInTools(from: providerOptions)
    }
    
    var tools: [any Tool] = []
    
    for toolDef in toolsDict {
      guard let toolId = toolDef["id"] as? String,
            let name = toolDef["name"] as? String,
            let description = toolDef["description"] as? String?,
            let parameters = toolDef["inputSchema"] as? [String: Any]? else {
        throw AppleLLMError.invalidSchema("Invalid tool definition: \(toolsDict)")
      }
      
      let tool = try JSITool(
        toolId: toolId,
        name: name,
        description: description ?? "",
        parameters: parameters ?? [:],
        javaScriptToolInvoker: toolInvoker
      )
      tools.append(tool)
    }

    tools.append(contentsOf: try createBuiltInTools(from: providerOptions))
    
    return tools
  }

  @available(iOS 26, *)
  private func createBuiltInTools(from providerOptions: [String: Any]) throws -> [any Tool] {
    guard let toolNames = providerOptions["builtInTools"] as? [String], !toolNames.isEmpty else {
      return []
    }

#if compiler(>=6.4) && canImport(_Vision_FoundationModels)
    if #available(iOS 27, *) {
      return try toolNames.map { toolName in
        switch toolName {
        case "ocr":
          return OCRTool()
        case "barcode":
          return BarcodeReaderTool()
        default:
          throw AppleLLMError.invalidMessage("Unsupported built-in tool '\(toolName)'")
        }
      }
    }
#endif

    throw AppleLLMError.unsupportedOS
  }
  
  @available(iOS 26, *)
  @_spi(CoreAI) public static func createTranscriptAndPrompt(
    from messages: [[String: Any]],
    tools: [any Tool]
  ) throws -> (Transcript, String, [[String: Any]]) {
    guard !messages.isEmpty else {
      throw AppleLLMError.invalidMessage("Messages array cannot be empty")
    }
    
    guard let lastMessage = messages.last,
          let lastRole = lastMessage["role"] as? String,
          let userPrompt = lastMessage["content"] as? String,
          lastRole == "user" else {
      throw AppleLLMError.invalidMessage("Last message must be from user role")
    }

    let promptAttachments = lastMessage["attachments"] as? [[String: Any]] ?? []
    
    var entries: [Transcript.Entry] = []
    
    let transcriptMessages = Array(messages.dropLast())
    
    for message in transcriptMessages {
      guard let role = message["role"] as? String,
            let content = message["content"] as? String else {
        throw AppleLLMError.invalidMessage("Message must have role and content")
      }

      // Assistant and tool messages carry structured parts
      if let parts = message["parts"] as? [[String: Any]] {
        entries.append(contentsOf: try createTranscriptEntries(from: parts))
        continue
      }

      if let attachments = message["attachments"] as? [[String: Any]], !attachments.isEmpty {
        throw AppleLLMError.invalidMessage("Image attachments are only supported on the final user prompt")
      }
      
      let segment = Transcript.Segment.text(
        .init(content: content)
      )
      
      switch role {
      case "system":
        let toolDefinitions = tools.map {
          Transcript.ToolDefinition(name: $0.name, description: $0.description, parameters: $0.parameters)
        }
        let instructions = Transcript.Instructions(segments: [segment], toolDefinitions: toolDefinitions)
        entries.append(.instructions(instructions))
      case "user":
        let prompt = Transcript.Prompt(segments: [segment])
        entries.append(.prompt(prompt))
      case "assistant":
        let response = Transcript.Response(assetIDs: [], segments: [segment])
        entries.append(.response(response))
      default:
        throw AppleLLMError.invalidMessage("Unsupported role '\(role)'. Supported roles are: system, user, assistant")
      }
    }
    
    // A tool output without its call (e.g. after trimming history) fails generation
    var knownToolCallIds = Set<String>()
    entries = entries.filter { entry in
      switch entry {
      case .toolCalls(let toolCalls):
        knownToolCallIds.formUnion(toolCalls.map(\.id))
        return true
      case .toolOutput(let toolOutput):
        return knownToolCallIds.contains(toolOutput.id)
      default:
        return true
      }
    }

    return (Transcript(entries: entries), userPrompt, promptAttachments)
  }

  @available(iOS 26, *)
  static func createTranscriptEntries(from parts: [[String: Any]]) throws -> [Transcript.Entry] {
    var entries: [Transcript.Entry] = []
    var pendingText: [String] = []
    var pendingToolCalls: [Transcript.ToolCall] = []

    // Consecutive text parts form one response and consecutive tool calls one entry
    func flush() {
      if !pendingText.isEmpty {
        let segment = Transcript.Segment.text(.init(content: pendingText.joined(separator: "\n")))
        entries.append(.response(Transcript.Response(assetIDs: [], segments: [segment])))
        pendingText = []
      }
      if !pendingToolCalls.isEmpty {
        entries.append(.toolCalls(Transcript.ToolCalls(pendingToolCalls)))
        pendingToolCalls = []
      }
    }

    for part in parts {
      guard let type = part["type"] as? String else {
        throw AppleLLMError.invalidMessage("Message part must have a type")
      }

      switch type {
      case "text":
        if !pendingToolCalls.isEmpty {
          flush()
        }
        pendingText.append(part["text"] as? String ?? "")
      case "reasoning":
        flush()
#if compiler(>=6.4)
        if #available(iOS 27, *) {
          let segment = Transcript.Segment.text(.init(content: part["text"] as? String ?? ""))
          let signature = (part["signature"] as? String).flatMap { Data(base64Encoded: $0) }
          entries.append(.reasoning(Transcript.Reasoning(segments: [segment], signature: signature)))
        }
#endif
        // Transcripts before iOS 27 have no reasoning entries, so it is left out
      case "tool-call":
        guard let toolCallId = part["toolCallId"] as? String,
              let toolName = part["toolName"] as? String,
              let input = part["input"] as? String else {
          throw AppleLLMError.invalidMessage("Tool call part must have toolCallId, toolName and input")
        }
        if !pendingText.isEmpty {
          flush()
        }
        // Malformed input is a problem with the prompt, not a decoding failure of the model
        let arguments: GeneratedContent
        do {
          arguments = try GeneratedContent(json: input)
        } catch {
          throw AppleLLMError.invalidMessage("Tool call input of '\(toolName)' is not valid JSON")
        }
        // Partial JSON parses too, so incomplete input is rejected here
        guard arguments.isComplete else {
          throw AppleLLMError.invalidMessage("Tool call input of '\(toolName)' is not complete JSON")
        }
        pendingToolCalls.append(Transcript.ToolCall(id: toolCallId, toolName: toolName, arguments: arguments))
      case "tool-result":
        guard let toolCallId = part["toolCallId"] as? String,
              let toolName = part["toolName"] as? String,
              let output = part["output"] as? String else {
          throw AppleLLMError.invalidMessage("Tool result part must have toolCallId, toolName and output")
        }
        flush()
        let segment = Transcript.Segment.text(.init(content: output))
        entries.append(.toolOutput(Transcript.ToolOutput(id: toolCallId, toolName: toolName, segments: [segment])))
      default:
        throw AppleLLMError.invalidMessage("Unsupported message part type '\(type)'")
      }
    }

    flush()
    return entries
  }

#if compiler(>=6.4)
  @available(iOS 27, *)
  private func createImageAttachments(
    from attachments: [[String: Any]]
  ) throws -> (values: [Attachment<ImageAttachmentContent>], temporaryFileURLs: [URL]) {
    var imageAttachments: [Attachment<ImageAttachmentContent>] = []
    var temporaryFileURLs: [URL] = []
    var usedLabels = Set<String>()

    do {
      for (index, attachment) in attachments.enumerated() {
        guard let type = attachment["type"] as? String, type == "image" else {
          throw AppleLLMError.invalidMessage("Unsupported attachment type")
        }

        let imageURL = try Self.createImageURL(from: attachment)
        if imageURL.needsCleanup {
          temporaryFileURLs.append(imageURL.url)
        }

        // Vision tools (OCR, barcode) look images up by label, so every image needs a unique one
        var label = (attachment["label"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "image-\(index + 1)"
        if usedLabels.contains(label) {
          label = "\(label)-\(index + 1)"
        }
        usedLabels.insert(label)
        imageAttachments.append(Attachment(imageURL: imageURL.url).label(label))
      }
    } catch {
      Self.removeTemporaryFiles(temporaryFileURLs)
      throw error
    }

    return (imageAttachments, temporaryFileURLs)
  }
#endif

  private static func createImageURL(from attachment: [String: Any]) throws -> ImageURL {
    if let urlString = attachment["url"] as? String, !urlString.isEmpty {
      let url = urlString.hasPrefix("/")
        ? URL(fileURLWithPath: urlString)
        : URL(string: urlString)

      guard let url, url.isFileURL else {
        throw AppleLLMError.invalidMessage("Image attachment URLs must be local file URLs")
      }

      return ImageURL(url: url, needsCleanup: false)
    }

    guard let dataValue = attachment["data"] as? String, !dataValue.isEmpty else {
      throw AppleLLMError.invalidMessage("Image attachment must include url or data")
    }

    let mediaType = attachment["mediaType"] as? String
    let base64Payload = dataValue.contains(",")
      ? String(dataValue.split(separator: ",", maxSplits: 1, omittingEmptySubsequences: false).last ?? "")
      : dataValue

    guard let imageData = Data(base64Encoded: base64Payload) else {
      throw AppleLLMError.invalidMessage("Image attachment data must be base64 encoded")
    }

    let fileExtension = Self.fileExtension(forImageMediaType: mediaType)
    let fileURL = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString)
      .appendingPathExtension(fileExtension)

    try imageData.write(to: fileURL, options: .atomic)
    return ImageURL(url: fileURL, needsCleanup: true)
  }

  private static func removeTemporaryFiles(_ urls: [URL]) {
    for url in urls {
      try? FileManager.default.removeItem(at: url)
    }
  }

#if canImport(ImagePlayground)
  @available(iOS 26.4, *)
  private static func createImagePlaygroundConcepts(
    from options: [String: Any]
  ) throws -> (values: [ImagePlaygroundConcept], temporaryFileURLs: [URL]) {
    var concepts: [ImagePlaygroundConcept] = []
    var temporaryFileURLs: [URL] = []

    if let prompt = options["prompt"] as? String, !prompt.isEmpty {
      concepts.append(.text(prompt))
    }

    do {
      if let files = options["files"] as? [[String: Any]], !files.isEmpty {
        guard files.count == 1, let firstFile = files.first else {
          throw AppleLLMError.invalidMessage("Image Playground supports at most one source image file")
        }
        let attachment = try imageAttachmentFromImageModelFile(firstFile)
        let imageURL = try createImageURL(from: attachment)

        if imageURL.needsCleanup {
          temporaryFileURLs.append(imageURL.url)
        }

        guard let imageConcept = ImagePlaygroundConcept.image(imageURL.url) else {
          throw AppleLLMError.invalidMessage("Image Playground file must resolve to a local image")
        }

        concepts.append(imageConcept)
      }
    } catch {
      removeTemporaryFiles(temporaryFileURLs)
      throw error
    }

    guard !concepts.isEmpty else {
      throw AppleLLMError.invalidMessage("Image Playground generation requires a prompt or image file")
    }

    return (concepts, temporaryFileURLs)
  }

  private static func imageAttachmentFromImageModelFile(_ file: [String: Any]) throws -> [String: Any] {
    var attachment: [String: Any] = [
      "type": "image",
      "mediaType": file["mediaType"] as? String ?? "image/png",
    ]

    if let data = file["data"] as? String {
      if data.hasPrefix("file://") || data.hasPrefix("/") {
        attachment["url"] = data
      } else {
        attachment["data"] = data
      }
    } else {
      throw AppleLLMError.invalidMessage("Image Playground file data must be a string")
    }

    return attachment
  }

  @available(iOS 26.4, *)
  private static func createImagePlaygroundStyle(from style: String?) -> ImagePlaygroundStyle {
    switch style {
    case "animation":
      return .animation
    case "illustration":
      return .illustration
    case "sketch":
      return .sketch
    default:
      return .illustration
    }
  }

#if compiler(>=6.3)
  @available(iOS 26.4, *)
  private static func createImagePlaygroundOptions(from options: [String: Any]) -> ImagePlaygroundOptions {
    var imageOptions = ImagePlaygroundOptions()

    switch options["personalization"] as? String {
    case "disabled":
      imageOptions.personalization = .disabled
    case "enabled":
      imageOptions.personalization = .enabled
    default:
      imageOptions.personalization = .automatic
    }

    return imageOptions
  }
#endif

  private static func pngData(from image: CGImage) throws -> Data {
    let data = NSMutableData()
    guard let destination = CGImageDestinationCreateWithData(data, "public.png" as CFString, 1, nil) else {
      throw AppleLLMError.generationError("Failed to create PNG image destination")
    }

    CGImageDestinationAddImage(destination, image, nil)

    guard CGImageDestinationFinalize(destination) else {
      throw AppleLLMError.generationError("Failed to encode generated image")
    }

    return data as Data
  }
#endif

  private static func fileExtension(forImageMediaType mediaType: String?) -> String {
    switch mediaType?.lowercased() {
    case "image/jpeg", "image/jpg":
      return "jpeg"
    case "image/heic":
      return "heic"
    case "image/webp":
      return "webp"
    case "image/gif":
      return "gif"
    default:
      return "png"
    }
  }
  
  @available(iOS 26, *)
  @_spi(CoreAI) public static func createGenerationOptions(from options: [String: Any]) throws -> GenerationOptions {
    var temperature: Double?
    var maximumResponseTokens: Int?
    // Left nil, Foundation Models uses its default random sampling, which
    // temperature applies to
    var samplingMode: GenerationOptions.SamplingMode?
    
    if let temp = options["temperature"] as? Double {
      temperature = temp
    }
    
    if let maxTokens = options["maxTokens"] as? Int {
      maximumResponseTokens = maxTokens
    }
    
    let topP = options["topP"] as? Double
    let topK = options["topK"] as? Int
    
    if topP != nil && topK != nil {
      throw AppleLLMError.conflictingSamplingMethods
    }
    
    if let topP {
      samplingMode = .random(probabilityThreshold: topP)
    } else if let topK {
      samplingMode = .random(top: topK)
    }
    
    let toolCallingMode = options["toolCallingMode"] as? String

#if compiler(>=6.4)
    var generationOptions = GenerationOptions(
      samplingMode: samplingMode,
      temperature: temperature,
      maximumResponseTokens: maximumResponseTokens
    )

    if #available(iOS 27, *) {
      generationOptions.toolCallingMode = try createToolCallingMode(from: toolCallingMode)
      return generationOptions
    }
#else
    let generationOptions = GenerationOptions(
      sampling: samplingMode,
      temperature: temperature,
      maximumResponseTokens: maximumResponseTokens
    )
#endif

    // Before iOS 27 tools are always optional for the model. JS leaves tools out
    // for "disallowed", so only "required" cannot be honored
    if toolCallingMode == "required" {
      throw AppleLLMError.unsupportedOS
    }

    return generationOptions
  }

#if compiler(>=6.4)
  @available(iOS 27, *)
  static func createToolCallingMode(from toolCallingMode: String?) throws -> GenerationOptions.ToolCallingMode? {
    guard let toolCallingMode else {
      return nil
    }

    switch toolCallingMode {
    case "allowed":
      return .allowed
    case "required":
      // Set by the session's profile, which only requires the first tool call
      return nil
    case "disallowed":
      return .disallowed
    default:
      throw AppleLLMError.invalidMessage("Unsupported Apple tool calling mode '\(toolCallingMode)'")
    }
  }
#endif
  
  @available(iOS 26, *)
  struct JSITool : Tool {
    var name: String
    var description: String
    var parameters: GenerationSchema
    
    private let invokeJavaScriptTool: ToolInvoker
    private let toolId: String
    
    init(toolId: String,
         name: String,
         description: String,
         parameters: [String: Any],
         javaScriptToolInvoker: @escaping ToolInvoker) throws {
      self.toolId = toolId
      self.name = name
      self.description = description
      self.invokeJavaScriptTool = javaScriptToolInvoker
      self.parameters = try AppleLLMImpl.createGenerationSchema(fromSchema: parameters, name: name)
    }
    
    func call(arguments: GeneratedContent) async throws -> String {
      return try await withCheckedThrowingContinuation { continuation in
        invokeJavaScriptTool(self.toolId, String(describing: arguments)) { result, error in
          if let error = error {
            continuation.resume(throwing: AppleLLMError.toolCallError(error))
          } else if let output = result as? String {
            continuation.resume(returning: output)
          } else if let result,
                    let encodedData = try? JSONSerialization.data(withJSONObject: result, options: .prettyPrinted),
                    let jsonString = String(data: encodedData, encoding: .utf8) {
            continuation.resume(returning: jsonString)
          } else {
            continuation.resume(throwing: AppleLLMError.unknownToolCallError)
          }
        }
      }
    }
  }
  
  @available(iOS 26, *)
  struct AppleLLMSchemaParser {
    // Foundation Models resolves named schemas by name, so every object and
    // anyOf gets one from its path. Schemas without titles (all of Zod's) would
    // otherwise share an empty name and nested objects would resolve to the root
    static func createGenerationSchema(from schemaDict: [String: Any], name: String = "Root") throws -> GenerationSchema {
      let rootName = schemaDict["title"] as? String ?? name
      // $defs and definitions are separate namespaces, and a definition can share
      // its key with the root's title, so definitions are named after both their
      // namespace and key
      var definitions: [String: Any] = [:]
      for namespace in ["$defs", "definitions"] {
        for (key, definition) in schemaDict[namespace] as? [String: Any] ?? [:] {
          definitions[definitionName(namespace: namespace, key: key)] = definition
        }
      }
      let resolve = { (schema: [String: Any]) in
        try resolveReferences(in: schema, definitions: definitions, rootName: rootName) as! [String: Any]
      }

      let dynamicSchemas = try parseDynamicSchema(from: resolve(schemaDict), path: name)
      // Referenced definitions are named like their references, so they resolve to them
      let dependencies = try definitions.keys.sorted().compactMap { definitionName -> DynamicGenerationSchema? in
        guard let definition = definitions[definitionName] as? [String: Any], isNamedSchema(definition) else {
          return nil
        }
        var namedDefinition = try resolve(definition)
        namedDefinition["title"] = definitionName
        return try parseDynamicSchema(from: namedDefinition, path: definitionName)
      }
      return try GenerationSchema(root: dynamicSchemas, dependencies: dependencies)
    }

    static func definitionName(namespace: String, key: String) -> String {
      "\(namespace).\(key)"
    }

    // Objects and unions have a name that references can point to, so they can be
    // recursive. Nullable schemas count as their non-null schema, which the parser
    // turns them into
    static func isNamedSchema(_ schema: [String: Any]) -> Bool {
      if let anyOf = schema["anyOf"] as? [[String: Any]] {
        let nonNullSchemas = anyOf.filter { $0["type"] as? String != "null" }
        return nonNullSchemas.count == 1 ? isNamedSchema(nonNullSchemas[0]) : !nonNullSchemas.isEmpty
      }
      if let types = schema["type"] as? [String] {
        let nonNullTypes = types.filter { $0 != "null" }
        return nonNullTypes.count > 1 || nonNullTypes == ["object"]
      }
      return schema["type"] as? String == "object" || schema["properties"] != nil
    }

    /// Turns JSON schema references into the name of the schema they point to. "#"
    /// points to the root. Definitions that are not objects or unions have no name,
    /// so references to them are replaced with the definition
    ///
    /// - Parameter inlining: Definitions being inlined, to reject references that cycle
    ///   through them instead of recursing forever
    static func resolveReferences(
      in value: Any,
      definitions: [String: Any],
      rootName: String,
      inlining: Set<String> = []
    ) throws -> Any {
      let resolve = { (child: Any) in
        try resolveReferences(in: child, definitions: definitions, rootName: rootName, inlining: inlining)
      }
      if let array = value as? [Any] {
        return try array.map(resolve)
      }
      guard let schema = value as? [String: Any] else {
        return value
      }
      guard let reference = schema["$ref"] as? String else {
        var resolvedSchema: [String: Any] = [:]
        for (key, child) in schema where key != "$defs" && key != "definitions" {
          // Property names can be anything, including "definitions", so only
          // their schemas are resolved
          if key == "properties", let properties = child as? [String: Any] {
            resolvedSchema[key] = try properties.mapValues(resolve)
          } else {
            resolvedSchema[key] = try resolve(child)
          }
        }
        return resolvedSchema
      }
      // The description of the property that references a schema is kept, and
      // wins over the description of an inlined definition
      let referenceDescription = schema["description"].map { ["description": $0] } ?? [:]
      if reference == "#" {
        return referenceDescription.merging(["$ref": rootName]) { _, new in new }
      }
      // Only definitions directly under $defs or definitions can be referenced
      let namespace = ["$defs", "definitions"].first { reference.hasPrefix("#/\($0)/") }
      guard let namespace else {
        throw AppleLLMError.invalidSchema("Unresolved reference '\(reference)'")
      }
      let key = String(reference.dropFirst("#/\(namespace)/".count))
      let definitionName = definitionName(namespace: namespace, key: key)
      guard !key.contains("/"), let definition = definitions[definitionName] as? [String: Any] else {
        throw AppleLLMError.invalidSchema("Unresolved reference '\(reference)'")
      }
      if isNamedSchema(definition) {
        return referenceDescription.merging(["$ref": definitionName]) { _, new in new }
      }
      guard !inlining.contains(definitionName) else {
        throw AppleLLMError.invalidSchema("Reference cycle through '\(definitionName)', which is not an object or union")
      }
      let inlined = try resolveReferences(
        in: definition,
        definitions: definitions,
        rootName: rootName,
        inlining: inlining.union([definitionName])
      )
      return (inlined as? [String: Any])?.merging(referenceDescription) { _, new in new } ?? inlined
    }

    static func parseDynamicSchema(from schemaDict: [String: Any], path: String) throws -> DynamicGenerationSchema {
      if let reference = schemaDict["$ref"] as? String {
        return DynamicGenerationSchema(referenceTo: reference)
      }

      // Nullable values become their non-null schema, since a value that is
      // never null still matches
      if let types = schemaDict["type"] as? [String] {
        let nonNullTypes = types.filter { $0 != "null" }
        let schemas = nonNullTypes.map { type in
          schemaDict.merging(["type": type]) { _, new in new }
        }
        return try parseAnyOf(schemas, from: schemaDict, path: path)
      }

      if let anyOfArray = schemaDict["anyOf"] as? [[String: Any]] {
        let nonNullSchemas = anyOfArray.filter { $0["type"] as? String != "null" }
        return try parseAnyOf(nonNullSchemas, from: schemaDict, path: path)
      }

      // Some generators leave out the type of objects
      let type = schemaDict["type"] as? String
        ?? (schemaDict["properties"] != nil ? "object" : nil)

      switch type {
      case "object":
        return try parseObjectSchema(from: schemaDict, path: path)
      case "array":
        return try parseArraySchema(from: schemaDict, path: path)
      case "string":
        return try parseStringSchema(from: schemaDict)
      case "number", "integer":
        return try parseNumberSchema(from: schemaDict, path: path)
      case "boolean":
        return try parseBooleanSchema(from: schemaDict)
      default:
        throw AppleLLMError.invalidSchema("Unsupported schema type: \(type ?? "unknown"). Supported types: object, array, string, number, integer, boolean")
      }
    }

    static func parseAnyOf(
      _ schemas: [[String: Any]],
      from schemaDict: [String: Any],
      path: String
    ) throws -> DynamicGenerationSchema {
      if schemas.count == 1 {
        // Keeps the description of the nullable property
        let schema = schemas[0].merging(schemaDict.filter { $0.key == "description" || $0.key == "title" }) { current, _ in current }
        return try parseDynamicSchema(from: schema, path: path)
      }

      guard !schemas.isEmpty else {
        throw AppleLLMError.invalidSchema("Unsupported schema type: null. Supported types: object, array, string, number, integer, boolean")
      }

      return DynamicGenerationSchema(
        name: schemaDict["title"] as? String ?? path,
        description: schemaDict["description"] as? String,
        anyOf: try schemas.enumerated().map { index, schema in
          try parseDynamicSchema(from: schema, path: "\(path).anyOf\(index)")
        }
      )
    }

    static func parseObjectSchema(from schemaDict: [String: Any], path: String) throws -> DynamicGenerationSchema {
      var properties: [DynamicGenerationSchema.Property] = []
      
      if let propertiesDict = schemaDict["properties"] as? [String: Any] {
        let requiredFields = schemaDict["required"] as? [String] ?? []
        // Properties are generated in this order. JS sends it, since dictionaries have none
        let order = (schemaDict["x-order"] as? [String] ?? []).filter { propertiesDict[$0] != nil }
        let propertyNames = order + propertiesDict.keys.filter { !order.contains($0) }.sorted()
        
        for propertyName in propertyNames {
          let propertySchema = propertiesDict[propertyName]!
          guard let propertySchemaDict = propertySchema as? [String: Any] else {
            throw AppleLLMError.invalidSchema("Property \(propertyName) schema must be an object")
          }
          
          let isOptional = !requiredFields.contains(propertyName)
          let propertyDescription = propertySchemaDict["description"] as? String
          
          let nestedSchema = try parseDynamicSchema(from: propertySchemaDict, path: "\(path).\(propertyName)")
          
          let property = DynamicGenerationSchema.Property(
            name: propertyName,
            description: propertyDescription,
            schema: nestedSchema,
            isOptional: isOptional
          )
          properties.append(property)
        }
      }
      
      return DynamicGenerationSchema(
        name: schemaDict["title"] as? String ?? path,
        description: schemaDict["description"] as? String,
        properties: properties
      )
    }

    static func parseArraySchema(from schemaDict: [String: Any], path: String) throws -> DynamicGenerationSchema {
      guard let itemsSchema = schemaDict["items"] as? [String: Any] else {
        throw AppleLLMError.invalidSchema("Array schema must have items definition")
      }

      let itemDynamicSchema = try parseDynamicSchema(from: itemsSchema, path: "\(path).items")
      
      let minItems = schemaDict["minItems"] as? Int
      let maxItems = schemaDict["maxItems"] as? Int
      
      return DynamicGenerationSchema(
        arrayOf: itemDynamicSchema,
        minimumElements: minItems,
        maximumElements: maxItems
      )
    }
    
    static func parseStringSchema(from schemaDict: [String: Any]) throws -> DynamicGenerationSchema {
      // Handle enum values
      if let enumValues = schemaDict["enum"] as? [String] {
        return DynamicGenerationSchema(type: String.self, guides: [GenerationGuide.anyOf(enumValues)])
      }

      // Literal values, e.g. z.literal()
      if let constValue = schemaDict["const"] as? String {
        return DynamicGenerationSchema(type: String.self, guides: [GenerationGuide.anyOf([constValue])])
      }
      
      // Handle regular expressions
      if let pattern = schemaDict["pattern"] as? String {
        do {
          let regex = try Regex(pattern)
          return DynamicGenerationSchema(type: String.self, guides: [
            GenerationGuide.pattern(regex)
          ])
        } catch {
          throw AppleLLMError.invalidSchema("Invalid regex pattern '\(pattern)': \(error.localizedDescription)")
        }
      }
      
      return DynamicGenerationSchema(type: String.self, guides: [])
    }
    
    static func parseNumberSchema(from schemaDict: [String: Any], path: String) throws -> DynamicGenerationSchema {
      let type = schemaDict["type"] as! String
      
      // Apple's GenerationGuide.anyOf only supports [String], so each numeric enum value
      // becomes a choice whose range holds just that value

      if let enumValues = schemaDict["enum"] as? [Double] {
        let choices = enumValues.map { value in
          type == "integer"
            ? DynamicGenerationSchema(type: Int.self, guides: [GenerationGuide.range(Int(value)...Int(value))])
            : DynamicGenerationSchema(type: Double.self, guides: [GenerationGuide.range(value...value)])
        }
        return DynamicGenerationSchema(
          name: schemaDict["title"] as? String ?? path,
          description: schemaDict["description"] as? String,
          anyOf: choices
        )
      }
      
      if schemaDict["multipleOf"] != nil {
        throw AppleLLMError.invalidSchema("MultipleOf is not supported by Apple Foundational models.")
      }
      
      let minimum = schemaDict["minimum"] as? Double
      let maximum = schemaDict["maximum"] as? Double
      let exclusiveMinimum = schemaDict["exclusiveMinimum"] as? Double
      let exclusiveMaximum = schemaDict["exclusiveMaximum"] as? Double

      // Apple's GenerationGuide only supports inclusive bounds (≤, ≥)
      // We convert exclusive bounds (< , >) to the nearest inclusive equivalent:
      // - exclusiveMaximum: value < N → maximum(largest int below N, N.nextDown for double)
      // - exclusiveMinimum: value > N → minimum(smallest int above N, N.nextUp for double)
      // When both kinds of bound are set on one side, the stricter one wins

      if type == "integer" {
        let lowerBound = [
          minimum.map { Int($0.rounded(.up)) },
          exclusiveMinimum.map { Int($0.rounded(.down)) + 1 },
        ].compactMap { $0 }.max()
        let upperBound = [
          maximum.map { Int($0.rounded(.down)) },
          exclusiveMaximum.map { Int($0.rounded(.up)) - 1 },
        ].compactMap { $0 }.min()

        var guides: [GenerationGuide<Int>] = []
        if let lowerBound {
          guides.append(.minimum(lowerBound))
        }
        if let upperBound {
          guides.append(.maximum(upperBound))
        }
        return DynamicGenerationSchema(type: Int.self, guides: guides)
      }

      let lowerBound = [minimum, exclusiveMinimum?.nextUp].compactMap { $0 }.max()
      let upperBound = [maximum, exclusiveMaximum?.nextDown].compactMap { $0 }.min()

      var guides: [GenerationGuide<Double>] = []
      if let lowerBound {
        guides.append(.minimum(lowerBound))
      }
      if let upperBound {
        guides.append(.maximum(upperBound))
      }
      return DynamicGenerationSchema(type: Double.self, guides: guides)
    }
    
    static func parseBooleanSchema(from schemaDict: [String: Any]) throws -> DynamicGenerationSchema {
      return DynamicGenerationSchema(type: Bool.self, guides: [])
    }
    
    
  }
  
#endif
}

#if canImport(FoundationModels)

@available(iOS 26, *)
extension LanguageModelSession.Response {
  @_spi(CoreAI) public func toModelMessages() -> [[String: Any]] {
    return AppleLLMTranscriptSerializer.serialize(transcriptEntries, includeResponses: true)
  }
}

#if compiler(>=6.4)
@available(iOS 27, *)
final class ToolCallCounter: @unchecked Sendable {
  private let lock = NSLock()
  private var count = 0

  var value: Int {
    lock.withLock { count }
  }

  func increment() {
    lock.withLock { count += 1 }
  }
}

/// Requires a tool call until the model has made one, then lets it answer. Once
/// maxToolCalls is reached, the model has to answer without more tool calls
@available(iOS 27, *)
struct ToolCallingProfile<Model: LanguageModel>: LanguageModelSession.DynamicProfile {
  let model: Model
  let instructions: String?
  let tools: [any Tool]
  let required: Bool
  let maxToolCalls: Int?
  let toolCalls = ToolCallCounter()

  // The mode applies from the next model request, so parallel calls in one round all run
  var toolCallingMode: GenerationOptions.ToolCallingMode {
    if let maxToolCalls, toolCalls.value >= maxToolCalls {
      return .disallowed
    }
    return required && toolCalls.value < 1 ? .required : .allowed
  }

  var body: some LanguageModelSession.DynamicProfile {
    Profile {
      if let instructions {
        Instructions(instructions)
      }
      tools
    }
    .model(model)
    .toolCallingMode(toolCallingMode)
    .onToolCall {
      toolCalls.increment()
    }
  }
}

#endif

@available(iOS 26, *)
@_spi(CoreAI) public enum AppleLLMTranscriptSerializer {
  /// Converts generated transcript entries into AI SDK content parts. Streams leave
  /// responses out because their text is sent as snapshots of the response content
  public static func serialize(
    _ entries: some Collection<Transcript.Entry>,
    includeResponses: Bool
  ) -> [[String: Any]] {
    // Tool outputs follow their tool calls, so they are paired in order per tool name
    var pendingToolCallIds: [String: [String]] = [:]

    return entries.flatMap { entry -> [[String: Any]] in
      switch entry {
      case .response(let response):
        guard includeResponses, let segment = response.segments.last else {
          return []
        }
        return [["type": "text", "text": String(describing: segment)]]
      case .toolCalls(let calls):
        return calls.map { toolCall in
          pendingToolCallIds[toolCall.toolName, default: []].append(toolCall.id)
          return [
            "type": "tool-call",
            "toolCallId": toolCall.id,
            "toolName": toolCall.toolName,
            "input": toolCall.arguments.jsonString,
          ]
        }
      case .toolOutput(let toolOutput):
        let toolCallId = pendingToolCallIds[toolOutput.toolName]?.isEmpty == false
          ? pendingToolCallIds[toolOutput.toolName]!.removeFirst()
          : toolOutput.id
        return [[
          "type": "tool-result",
          "toolCallId": toolCallId,
          "toolName": toolOutput.toolName,
          "output": toolOutput.segments.last.map { String(describing: $0) } ?? "",
        ]]
      case .instructions, .prompt:
        return []
      default:
#if compiler(>=6.4)
        if #available(iOS 27, *), case .reasoning(let reasoning) = entry {
          var part: [String: Any] = [
            "type": "reasoning",
            "id": reasoning.id,
            "text": reasoning.segments.map { String(describing: $0) }.joined(),
          ]
          if let signature = reasoning.signature {
            part["signature"] = signature.base64EncodedString()
          }
          return [part]
        }
#endif
        return []
      }
    }
  }
}

#endif
