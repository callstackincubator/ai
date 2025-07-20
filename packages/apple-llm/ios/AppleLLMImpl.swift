//
//  AppleLLM.swift
//  AppleLLM
//
//  Created by Mike Grabowski on 06/07/2025.
//

import Foundation
import React

#if canImport(FoundationModels)
import FoundationModels
#endif

@objc
public class AppleLLMImpl: NSObject {
  
  private var streamTasks: [String: Task<Void, Never>] = [:]
  
  // MARK: - Constants
  
  private static let supportedStringFormats: Set<String> = [
    "date-time", "time", "date", "duration", "email", "hostname", "ipv4", "ipv6", "uuid"
  ]
  
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
  public func generateText(
    _ messages: [[String: Any]],
    options: [String: Any]?,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void,
    toolInvoker: @escaping @Sendable (String, [String: Any], @escaping (Any?, Error?) -> Void) -> Void
  ) {
#if canImport(FoundationModels)
    if #available(iOS 26, *) {
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
          let tools = [DummyTool(javaScriptToolInvoker: toolInvoker)]
          let (transcript, userPrompt) = try self.createTranscriptAndPrompt(from: messages, tools: tools)
          
          let session = LanguageModelSession.init(
            model: SystemLanguageModel.default,
            guardrails: LanguageModelSession.Guardrails.default,
            tools: tools,
            transcript: transcript
          )
          
          let generationOptions = try self.createGenerationOptions(from: options ?? [:])
          
          if let schemaObj = options?["schema"] {
            let generationSchema = try self.createGenerationSchema(from: schemaObj)
            let response = try await session.respond(to: userPrompt, schema: generationSchema, includeSchemaInPrompt: true, options: generationOptions)
            
            resolve(try response.rawValue())
          } else {
            let response = try await session.respond(to: userPrompt, options: generationOptions)
            resolve(response.content)
          }
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
  }
  
  @objc
  public func generateStream(
    _ messages: [[String: Any]],
    options: [String: Any]?,
    onUpdate: @escaping (String, String) -> Void,
    onComplete: @escaping (String) -> Void,
    onError: @escaping (String, String) -> Void
  ) throws -> String {
#if canImport(FoundationModels)
    if #available(iOS 26, *) {
      let streamId = UUID().uuidString
      guard SystemLanguageModel.default.availability == .available else {
        onError(streamId, "Apple Intelligence model is not available")
        return streamId
      }
      
      let task = Task {
        do {
          let (transcript, userPrompt) = try self.createTranscriptAndPrompt(from: messages, tools: [])
          
          let session = LanguageModelSession.init(
            model: SystemLanguageModel.default,
            guardrails: LanguageModelSession.Guardrails.default,
            tools: [],
            transcript: transcript
          )
          
          let generationOptions = try self.createGenerationOptions(from: options ?? [:])
          
          if let schemaOption = options?["schema"] {
            let generationSchema = try self.createGenerationSchema(from: schemaOption)
            let responseStream = session.streamResponse(
              to: userPrompt,
              schema: generationSchema,
              includeSchemaInPrompt: true,
              options: generationOptions
            )
            for try await chunk in responseStream {
              onUpdate(streamId, String(reflecting: chunk))
            }
          } else {
            let responseStream = session.streamResponse(to: userPrompt, options: generationOptions)
            for try await chunk in responseStream {
              onUpdate(streamId, chunk)
            }
          }
          
          // Send completion event only if not cancelled
          if !Task.isCancelled {
            onComplete(streamId)
          }
        } catch {
          onError(streamId, error.localizedDescription)
        }
        
        // Clean up task from map when completed
        self.streamTasks.removeValue(forKey: streamId)
      }
      
      // Store task in map
      streamTasks[streamId] = task
      
      return streamId
    } else {
      throw AppleLLMError.unsupportedOS
    }
#else
    throw AppleLLMError.unsupportedOS
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
  
  @objc
  public func isModelAvailable(
    _ modelId: String,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
#if canImport(FoundationModels)
    if #available(iOS 26, *) {
      resolve(SystemLanguageModel.default.availability == .available)
    } else {
      resolve(false)
    }
#else
    resolve(false)
#endif
  }
  
  // MARK: - Private Methods
#if canImport(FoundationModels)
  // TODO:
  //   • Investigate assetIDs parameter usage in Transcript.Response
  //   • Implement tool calling support
  @available(iOS 26, *)
  private func createTranscriptAndPrompt(from messages: [[String: Any]], tools: [any Tool]) throws -> (Transcript, String) {
    guard !messages.isEmpty else {
      throw AppleLLMError.invalidMessage("Messages array cannot be empty")
    }
    
    guard let lastMessage = messages.last,
          let lastRole = lastMessage["role"] as? String,
          let userPrompt = lastMessage["content"] as? String,
          lastRole == "user" else {
      throw AppleLLMError.invalidMessage("Last message must be from user role")
    }
    
    var entries: [Transcript.Entry] = []
    
    let transcriptMessages = Array(messages.dropLast())
    
    for message in transcriptMessages {
      guard let role = message["role"] as? String,
            let content = message["content"] as? String else {
        continue
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
        throw AppleLLMError.invalidMessage(role)
      }
    }
    
    return (Transcript(entries: entries), userPrompt)
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
  private func createGenerationSchema(from schemaObj: Any) throws -> GenerationSchema {
    guard let schemaDict = schemaObj as? [String: Any] else {
      throw AppleLLMError.invalidSchema("Schema must be an object")
    }
    let dynamicSchemas = try parseDynamicSchema(from: schemaDict)
    return try GenerationSchema(root: dynamicSchemas, dependencies: [])
  }
  
  @available(iOS 26, *)
  private func parseDynamicSchema(from schemaDict: [String: Any]) throws -> DynamicGenerationSchema {
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
  
  @available(iOS 26, *)
  private func parseObjectSchema(from schemaDict: [String: Any]) throws -> DynamicGenerationSchema {
    var properties: [DynamicGenerationSchema.Property] = []
    
    if let propertiesDict = schemaDict["properties"] as? [String: Any] {
      let requiredFields = schemaDict["required"] as? [String] ?? []
      
      for (propertyName, propertySchema) in propertiesDict {
        guard let propertySchemaDict = propertySchema as? [String: Any] else {
          continue
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
  
  @available(iOS 26, *)
  private func parseArraySchema(from schemaDict: [String: Any]) throws -> DynamicGenerationSchema {
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
  
  @available(iOS 26, *)
  private func parseStringSchema(from schemaDict: [String: Any]) throws -> DynamicGenerationSchema {
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
  
  @available(iOS 26, *)
  private func parseNumberSchema(from schemaDict: [String: Any]) throws -> DynamicGenerationSchema {
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
  
  @available(iOS 26, *)
  private func parseBooleanSchema(from schemaDict: [String: Any]) throws -> DynamicGenerationSchema {
    return DynamicGenerationSchema(type: Bool.self, guides: [])
  }
  
#endif
}

#if canImport(FoundationModels)

@available(iOS 26, *)
extension LanguageModelSession.Response<GeneratedContent> {
  enum RawValueExtractionError: Error {
    case noTranscriptEntries
    case notAResponseEntry
    case noSegments
    case notAStructuredSegment
    case rawValueNotFound
  }
  
  func rawValue() throws -> String {
    guard let lastEntry = transcriptEntries.last else {
      throw RawValueExtractionError.noTranscriptEntries
    }
    
    guard case let .response(res) = lastEntry else {
      throw RawValueExtractionError.notAResponseEntry
    }
    
    guard let lastSegment = res.segments.last else {
      throw RawValueExtractionError.noSegments
    }
    
    if case let .text(textSegment) = lastSegment {
      return textSegment.content
    }
    
    guard case let .structure(structureSegment) = lastSegment else {
      throw RawValueExtractionError.notAStructuredSegment
    }
    
    for child in Mirror(reflecting: structureSegment).children {
      if child.label == "rawValue", let rawValue = child.value as? String {
        return rawValue
      }
    }
    
    throw RawValueExtractionError.rawValueNotFound
  }
}

@available(iOS 26, *)
struct DummyTool : Tool {
  var name : String = "getWeather"
  var description: String = "Retrieve the latest weather information for a city"
  
  private let invokeJavaScriptTool: @Sendable (String, [String: Any], @escaping (Any?, Error?) -> Void) -> Void
  
  init(javaScriptToolInvoker: @escaping @Sendable (String, [String: Any], @escaping (Any?, Error?) -> Void) -> Void) {
    self.invokeJavaScriptTool = javaScriptToolInvoker
  }
  
  @Generable
  struct Arguments {
    @Guide(description: "The city to get the weather for")
    var city: String
  }
  
  func call(arguments: Arguments) async throws -> ToolOutput {
    let params: [String: Any] = [
      "city": arguments.city
    ]
    
    return try await withCheckedThrowingContinuation { continuation in
      invokeJavaScriptTool("getWeather", params) { result, error in
        if let error = error {
          continuation.resume(throwing: AppleLLMError.toolCallError(error))
        } else if let output = result as? String {
          continuation.resume(returning: ToolOutput(output))
        } else {
          continuation.resume(throwing: AppleLLMError.unknownToolCallError)
        }
      }
    }
  }
}
#endif

