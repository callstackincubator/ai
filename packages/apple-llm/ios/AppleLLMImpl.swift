
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
#if compiler(>=6.3) && canImport(Vision)
import Vision
#endif

public typealias ToolInvoker = @Sendable (String, String, @escaping (Any?, Error?) -> Void) -> Void

@objc
public class AppleLLMImpl: NSObject {
  
  private var streamTasks: [String: Task<Void, Never>] = [:]
  
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
      guard SystemLanguageModel.default.availability == .available else {
        reject(
          "MODEL_UNAVAILABLE",
          "Apple Intelligence model is not available",
          nil
        )
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
#if compiler(>=6.3)
        if #available(iOS 27, *) {
          let model = PrivateCloudComputeLanguageModel()
          resolve(modelInfo(for: model, locale: locale, modelName: modelName))
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
#if canImport(ImagePlayground)
    if #available(iOS 26.4, *) {
      Task {
        do {
          let creator = try await ImageCreator()
          let concepts = try Self.createImagePlaygroundConcepts(from: options)
          let style = Self.createImagePlaygroundStyle(from: options["style"] as? String)
          let limit = max(1, min(options["n"] as? Int ?? 1, 4))
          var images: [String] = []

#if compiler(>=6.3)
          let imageOptions = Self.createImagePlaygroundOptions(from: options)
          for try await createdImage in creator.images(
            for: concepts,
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
          for try await createdImage in creator.images(for: concepts, style: style, limit: limit) {
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
      guard SystemLanguageModel.default.availability == .available else {
        rejectWithAppleError(.modelUnavailable, reject: reject)
        return
      }

      Task {
        do {
          let providerOptions = self.createProviderOptions(from: options)
          let tools = try self.createTools(from: options, providerOptions: providerOptions, toolInvoker: toolInvoker)
          let (transcript, userPrompt, promptAttachments) = try self.createTranscriptAndPrompt(
            from: messages,
            tools: tools
          )

          let session = try self.createSession(providerOptions: providerOptions, tools: tools, transcript: transcript)

          let generationOptions = try self.createGenerationOptions(from: options)
          let generationSchema = try self.createGenerationSchema(from: options)

          do {
            if promptAttachments.isEmpty {
              if let generationSchema {
                let response = try await session.respond(
                  to: userPrompt,
                  schema: generationSchema,
                  includeSchemaInPrompt: true,
                  options: generationOptions
                )
                resolve(response.toModelMessages())
              } else {
                let response = try await session.respond(to: userPrompt, options: generationOptions)
                resolve(response.toModelMessages())
              }
            } else {
#if compiler(>=6.3)
              if #available(iOS 27, *) {
                let attachments = try self.createImageAttachments(from: promptAttachments)
                if let generationSchema {
                  let response = try await session.respond(
                    schema: generationSchema,
                    includeSchemaInPrompt: true,
                    options: generationOptions
                  ) {
                    userPrompt
                    for attachment in attachments {
                      attachment
                    }
                  }
                  resolve(response.toModelMessages())
                } else {
                  let response = try await session.respond(options: generationOptions) {
                    userPrompt
                    for attachment in attachments {
                      attachment
                    }
                  }
                  resolve(response.toModelMessages())
                }
              } else {
                throw AppleLLMError.unsupportedOS
              }
#else
              throw AppleLLMError.unsupportedOS
#endif
            }
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
    onUpdate: @escaping (String, String) -> Void,
    onComplete: @escaping (String) -> Void,
    onError: @escaping (String, String, String) -> Void,
    toolInvoker: @escaping ToolInvoker
  ) {
#if canImport(FoundationModels)
    if #available(iOS 26, *) {
      guard SystemLanguageModel.default.availability == .available else {
        emitStreamError(.modelUnavailable, streamId: streamId, onError: onError)
        return
      }

      let task = Task {
        do {
          let providerOptions = self.createProviderOptions(from: options)
          let tools = try self.createTools(from: options, providerOptions: providerOptions, toolInvoker: toolInvoker)
          let (transcript, userPrompt, promptAttachments) = try self.createTranscriptAndPrompt(
            from: messages,
            tools: tools
          )

          let session = try self.createSession(providerOptions: providerOptions, tools: tools, transcript: transcript)

          let generationOptions = try self.createGenerationOptions(from: options)
          let generationSchema = try self.createGenerationSchema(from: options)

          do {
            if promptAttachments.isEmpty {
              if let generationSchema {
                let responseStream = session.streamResponse(
                  to: userPrompt,
                  schema: generationSchema,
                  includeSchemaInPrompt: true,
                  options: generationOptions
                )
                for try await chunk in responseStream {
                  onUpdate(streamId, String(describing: chunk.content))
                }
              } else {
                let responseStream = session.streamResponse(to: userPrompt, options: generationOptions)
                for try await chunk in responseStream {
                  onUpdate(streamId, chunk.content)
                }
              }
            } else {
#if compiler(>=6.3)
              if #available(iOS 27, *) {
                let attachments = try self.createImageAttachments(from: promptAttachments)
                if let generationSchema {
                  let responseStream = session.streamResponse(
                    schema: generationSchema,
                    includeSchemaInPrompt: true,
                    options: generationOptions
                  ) {
                    userPrompt
                    for attachment in attachments {
                      attachment
                    }
                  }
                  for try await chunk in responseStream {
                    onUpdate(streamId, String(describing: chunk.content))
                  }
                } else {
                  let responseStream = session.streamResponse(options: generationOptions) {
                    userPrompt
                    for attachment in attachments {
                      attachment
                    }
                  }
                  for try await chunk in responseStream {
                    onUpdate(streamId, chunk.content)
                  }
                }
              } else {
                throw AppleLLMError.unsupportedOS
              }
#else
              throw AppleLLMError.unsupportedOS
#endif
            }

            if !Task.isCancelled {
              onComplete(streamId)
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
        self.streamTasks.removeValue(forKey: streamId)
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
    let streamIdString = streamId as String
    
    if let task = streamTasks[streamIdString] {
      task.cancel()
      streamTasks.removeValue(forKey: streamIdString)
    }
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
      "isAvailable": model.availability == .available,
      "availability": availabilityString(model.availability),
      "supportsLocale": model.supportsLocale(locale),
      "supportedLanguages": model.supportedLanguages.map(languageIdentifier).sorted(),
      "supportsTokenCounting": false,
      "supportsImagePrompts": false,
      "supportsPrivateCloudCompute": false,
      "supportsDynamicProfiles": false,
      "supportsVisionTools": false,
    ]

#if compiler(>=6.3)
    if #available(iOS 26.4, *) {
      info["contextSize"] = model.contextSize
      info["supportsTokenCounting"] = true
    }

    if #available(iOS 27, *) {
      info["supportsImagePrompts"] = true
      info["supportsDynamicProfiles"] = true
      info["supportsVisionTools"] = true
    }
#endif

    return info
  }

#if compiler(>=6.3)
  @available(iOS 27, *)
  private func modelInfo(
    for model: PrivateCloudComputeLanguageModel,
    locale: Locale,
    modelName: String
  ) -> [String: Any] {
    return [
      "model": modelName,
      "isAvailable": model.availability == .available,
      "availability": availabilityString(model.availability),
      "contextSize": model.contextSize,
      "quotaUsage": String(describing: model.quotaUsage),
      "supportsLocale": model.supportsLocale(locale),
      "supportedLanguages": model.supportedLanguages.map(languageIdentifier).sorted(),
      "supportsTokenCounting": false,
      "supportsImagePrompts": true,
      "supportsPrivateCloudCompute": true,
      "supportsDynamicProfiles": true,
      "supportsVisionTools": true,
    ]
  }
#endif

  private func availabilityString(_ availability: Any) -> String {
    return String(describing: availability)
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
    transcript: Transcript
  ) throws -> LanguageModelSession {
    let modelName = providerOptions["model"] as? String ?? "system"

    switch modelName {
    case "system":
      return LanguageModelSession(
        model: SystemLanguageModel.default,
        tools: tools,
        transcript: transcript
      )
    case "private-cloud-compute":
#if compiler(>=6.3)
      if #available(iOS 27, *) {
        return LanguageModelSession(
          model: PrivateCloudComputeLanguageModel(),
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

  @available(iOS 26, *)
  private func mapKnownAppleLLMError(_ error: Error) -> AppleLLMError? {
    if let appleError = error as? AppleLLMError {
      return appleError
    }

    guard let generationError = error as? LanguageModelSession.GenerationError else {
      return nil
    }

    if case .exceededContextWindowSize = generationError {
      return .contextWindowExceeded
    }

    return nil
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
  private func createGenerationSchema(from options: [String: Any]) throws -> GenerationSchema? {
    guard let schemaOption = options["schema"] as? [String: Any] else {
      return nil
    }

    return try Self.createGenerationSchema(fromSchema: schemaOption)
  }

  @available(iOS 26, *)
  private static func createGenerationSchema(fromSchema schema: [String: Any]) throws -> GenerationSchema {
    do {
      return try AppleLLMSchemaParser.createGenerationSchema(from: schema)
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

#if compiler(>=6.3) && canImport(Vision)
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
  private func createTranscriptAndPrompt(
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
    
    return (Transcript(entries: entries), userPrompt, promptAttachments)
  }

#if compiler(>=6.3)
  @available(iOS 27, *)
  private func createImageAttachments(
    from attachments: [[String: Any]]
  ) throws -> [Attachment<ImageAttachmentContent>] {
    try attachments.map { attachment in
      guard let type = attachment["type"] as? String, type == "image" else {
        throw AppleLLMError.invalidMessage("Unsupported attachment type")
      }

      let imageURL = try Self.createImageURL(from: attachment)
      var imageAttachment = Attachment(imageURL: imageURL)

      if let label = attachment["label"] as? String, !label.isEmpty {
        imageAttachment = imageAttachment.label(label)
      }

      return imageAttachment
    }
  }
#endif

  private static func createImageURL(from attachment: [String: Any]) throws -> URL {
    if let urlString = attachment["url"] as? String, !urlString.isEmpty {
      let url = urlString.hasPrefix("/")
        ? URL(fileURLWithPath: urlString)
        : URL(string: urlString)

      guard let url, url.isFileURL else {
        throw AppleLLMError.invalidMessage("Image attachment URLs must be local file URLs")
      }

      return url
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
    return fileURL
  }

#if canImport(ImagePlayground)
  @available(iOS 26.4, *)
  private static func createImagePlaygroundConcepts(from options: [String: Any]) throws -> [ImagePlaygroundConcept] {
    var concepts: [ImagePlaygroundConcept] = []

    if let prompt = options["prompt"] as? String, !prompt.isEmpty {
      concepts.append(.text(prompt))
    }

    if let files = options["files"] as? [[String: Any]], !files.isEmpty {
      guard files.count == 1, let firstFile = files.first else {
        throw AppleLLMError.invalidMessage("Image Playground supports at most one source image file")
      }
      let attachment = try imageAttachmentFromImageModelFile(firstFile)
      let url = try createImageURL(from: attachment)

      guard let imageConcept = ImagePlaygroundConcept.image(url) else {
        throw AppleLLMError.invalidMessage("Image Playground file must resolve to a local image")
      }

      concepts.append(imageConcept)
    }

    guard !concepts.isEmpty else {
      throw AppleLLMError.invalidMessage("Image Playground generation requires a prompt or image file")
    }

    return concepts
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
#if compiler(>=6.3)
    case "any":
      if #available(iOS 27, *) {
        return .any
      }
      return .illustration
    case "emoji":
      if #available(iOS 27, *) {
        return .emoji
      }
      return .illustration
    case "externalProvider":
      if #available(iOS 27, *) {
        return .externalProvider
      }
      return .illustration
#endif
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
  private func createGenerationOptions(from options: [String: Any]) throws -> GenerationOptions {
    var temperature: Double?
    var maximumResponseTokens: Int?
    var samplingMode: GenerationOptions.SamplingMode = .greedy
    
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
    
    return GenerationOptions(
      sampling: samplingMode,
      temperature: temperature,
      maximumResponseTokens: maximumResponseTokens
    )
  }
  
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
      self.parameters = try AppleLLMImpl.createGenerationSchema(fromSchema: parameters)
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
    static func createGenerationSchema(from schemaDict: [String: Any]) throws -> GenerationSchema {
      let dynamicSchemas = try parseDynamicSchema(from: schemaDict)
      return try GenerationSchema(root: dynamicSchemas, dependencies: [])
    }
    
    static func parseDynamicSchema(from schemaDict: [String: Any]) throws -> DynamicGenerationSchema {
      let type = schemaDict["type"] as? String
      
      if let anyOfArray = schemaDict["anyOf"] as? [[String: Any]] {
        let parsedSchemas = try anyOfArray.map { try parseDynamicSchema(from: $0) }
        return DynamicGenerationSchema(
          name: schemaDict["title"] as? String ?? "",
          description: schemaDict["description"] as? String,
          anyOf: parsedSchemas
        )
      }
      
      switch type {
      case "object":
        return try parseObjectSchema(from: schemaDict)
      case "array":
        return try parseArraySchema(from: schemaDict)
      case "string":
        return try parseStringSchema(from: schemaDict)
      case "number", "integer":
        return try parseNumberSchema(from: schemaDict)
      case "boolean":
        return try parseBooleanSchema(from: schemaDict)
      default:
        throw AppleLLMError.invalidSchema("Unsupported schema type: \(type ?? "unknown"). Supported types: object, array, string, number, integer, boolean")
      }
    }
    
    static func parseObjectSchema(from schemaDict: [String: Any]) throws -> DynamicGenerationSchema {
      var properties: [DynamicGenerationSchema.Property] = []
      
      if let propertiesDict = schemaDict["properties"] as? [String: Any] {
        let requiredFields = schemaDict["required"] as? [String] ?? []
        
        for (propertyName, propertySchema) in propertiesDict {
          guard let propertySchemaDict = propertySchema as? [String: Any] else {
            throw AppleLLMError.invalidSchema("Property \(propertyName) schema must be an object")
          }
          
          let isOptional = !requiredFields.contains(propertyName)
          let propertyDescription = propertySchemaDict["description"] as? String
          
          let nestedSchema = try parseDynamicSchema(from: propertySchemaDict)
          
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
        name: schemaDict["title"] as? String ?? "",
        description: schemaDict["description"] as? String,
        properties: properties
      )
    }
    
    static func parseArraySchema(from schemaDict: [String: Any]) throws -> DynamicGenerationSchema {
      guard let itemsSchema = schemaDict["items"] as? [String: Any] else {
        throw AppleLLMError.invalidSchema("Array schema must have items definition")
      }
      
      let itemDynamicSchema = try parseDynamicSchema(from: itemsSchema)
      
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
    
    static func parseNumberSchema(from schemaDict: [String: Any]) throws -> DynamicGenerationSchema {
      let type = schemaDict["type"] as! String
      
      // Handle numeric enums - use string representation since Apple's GenerationGuide.anyOf only supports [String]
      // The JavaScript side will parse these back to numbers after generation
      
      if let enumValues = schemaDict["enum"] as? [String] {
        return DynamicGenerationSchema(type: String.self, guides: [GenerationGuide.anyOf(enumValues)])
      }
      
      if schemaDict["multipleOf"] != nil {
        throw AppleLLMError.invalidSchema("MultipleOf is not supported by Apple Foundational models.")
      }
      
      if let maximum = schemaDict["maximum"] as? Double {
        if type == "integer" {
          return DynamicGenerationSchema(type: Int.self, guides: [GenerationGuide.maximum(Int(maximum))])
        } else {
          return DynamicGenerationSchema(type: Double.self, guides: [GenerationGuide.maximum(maximum)])
        }
      }
      
      if let minimum = schemaDict["minimum"] as? Double {
        if type == "integer" {
          return DynamicGenerationSchema(type: Int.self, guides: [GenerationGuide.minimum(Int(minimum))])
        } else {
          return DynamicGenerationSchema(type: Double.self, guides: [GenerationGuide.minimum(minimum)])
        }
      }
      
      // Apple's GenerationGuide only supports inclusive bounds (≤, ≥)
      // We convert exclusive bounds (< , >) to the nearest inclusive equivalent:
      // - exclusiveMaximum: value < N → maximum(N-1 for int, N.nextDown for double)
      // - exclusiveMinimum: value > N → minimum(N+1 for int, N.nextUp for double)
      
      if let exclusiveMaximum = schemaDict["exclusiveMaximum"] as? Double {
        if type == "integer" {
          let approximateMax = Int(exclusiveMaximum) - 1
          return DynamicGenerationSchema(type: Int.self, guides: [GenerationGuide.maximum(approximateMax)])
        } else {
          let approximateMax = exclusiveMaximum.nextDown
          return DynamicGenerationSchema(type: Double.self, guides: [GenerationGuide.maximum(approximateMax)])
        }
      }
      
      if let exclusiveMinimum = schemaDict["exclusiveMinimum"] as? Double {
        if type == "integer" {
          let approximateMin = Int(exclusiveMinimum) + 1
          return DynamicGenerationSchema(type: Int.self, guides: [GenerationGuide.minimum(approximateMin)])
        } else {
          let approximateMin = exclusiveMinimum.nextUp
          return DynamicGenerationSchema(type: Double.self, guides: [GenerationGuide.minimum(approximateMin)])
        }
      }
      
      if type == "integer" {
        return DynamicGenerationSchema(type: Int.self, guides: [])
      } else {
        return DynamicGenerationSchema(type: Double.self, guides: [])
      }
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
  func toModelMessages() -> [[String: Any]] {
    return transcriptEntries.flatMap { entry -> [[String: Any]] in
      switch entry {
      case .response(let response):
        return [["type": "text", "text": String(describing: response.segments.last!)]]
      case .toolCalls(let calls):
        return calls.compactMap { toolCall in
          return ["type": "tool-call", "toolName": toolCall.toolName, "input": String(describing: toolCall.arguments)]
        }
      case .toolOutput(let toolCall):
        return [["type": "tool-result", "toolName": toolCall.toolName, "output": String(describing: toolCall.segments.last!)]]
      case .instructions, .prompt:
        return []
      default:
        return []
      }
    }
  }
}

#endif
