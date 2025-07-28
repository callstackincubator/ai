
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
        reject(
          "MODEL_UNAVAILABLE",
          "Apple Intelligence model is not available",
          nil
        )
        return
      }
      Task {
        do {
          let tools = try self.createTools(from: options, toolInvoker: toolInvoker)
          let (transcript, userPrompt) = try self.createTranscriptAndPrompt(from: messages, tools: tools)
          
          let session = LanguageModelSession.init(
            model: SystemLanguageModel.default,
            guardrails: LanguageModelSession.Guardrails.default,
            tools: tools,
            transcript: transcript
          )
          
          let generationOptions = try self.createGenerationOptions(from: options)
          
          if let schemaObj = options["schema"],
             let schema = schemaObj as? [String: Any] {
            let generationSchema = try AppleLLMSchemaParser.createGenerationSchema(from: schema)
            let response = try await session.respond(to: userPrompt, schema: generationSchema, includeSchemaInPrompt: true, options: generationOptions)
            resolve(response.toModelMessages())
          } else {
            let response = try await session.respond(to: userPrompt, options: generationOptions)
            resolve(response.toModelMessages())
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
    options: [String: Any],
    onUpdate: @escaping (String, String) -> Void,
    onComplete: @escaping (String) -> Void,
    onError: @escaping (String, String) -> Void,
    toolInvoker: @escaping ToolInvoker
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
          let tools = try self.createTools(from: options, toolInvoker: toolInvoker)
          let (transcript, userPrompt) = try self.createTranscriptAndPrompt(from: messages, tools: tools)
          
          let session = LanguageModelSession.init(
            model: SystemLanguageModel.default,
            guardrails: LanguageModelSession.Guardrails.default,
            tools: tools,
            transcript: transcript
          )
          
          let generationOptions = try self.createGenerationOptions(from: options)
          
          if let schemaOption = options["schema"] as? [String: Any] {
            let generationSchema = try AppleLLMSchemaParser.createGenerationSchema(from: schemaOption)
            let responseStream = session.streamResponse(
              to: userPrompt,
              schema: generationSchema,
              includeSchemaInPrompt: true,
              options: generationOptions
            )
            for try await chunk in responseStream {
              onUpdate(streamId, String(describing: chunk.generatedContent))
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
  
  // MARK: - Private Methods
#if canImport(FoundationModels)
  
  @available(iOS 26, *)
  private func createTools(from options: [String: Any], toolInvoker: @escaping ToolInvoker) throws -> [any Tool] {
    guard let toolsDict = options["tools"] as? [[String: Any]] else {
      return []
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
    
    return tools
  }
  
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
        throw AppleLLMError.invalidMessage("Message must have role and content")
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
      self.parameters = try AppleLLMSchemaParser.createGenerationSchema(from: parameters)
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
