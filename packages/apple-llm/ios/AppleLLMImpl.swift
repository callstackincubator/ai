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
    reject: @escaping (String, String, Error?) -> Void
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
          let transcript = try self.createTranscript(from: messages)
          
          let session = try self.createSession(from: transcript)
          let generationOptions = try self.createGenerationOptions(from: options ?? [:])
          
          if let schemaObj = options?["schema"] {
            let generationSchema = try self.createGenerationSchema(from: schemaObj)
            let response = try await session.respond(to: "", schema: generationSchema, includeSchemaInPrompt: true, options: generationOptions)
            resolve(try response.rawValue())
          } else {
            let response = try await session.respond(to: "", options: generationOptions)
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
          let transcript = try self.createTranscript(from: messages)
          
          let session = try self.createSession(from: transcript)
          let generationOptions = try self.createGenerationOptions(from: options ?? [:])
          
          if let schemaOption = options?["schema"] {
            let generationSchema = try self.createGenerationSchema(from: schemaOption)
            let responseStream = session.streamResponse(
              to: "",
              schema: generationSchema,
              includeSchemaInPrompt: true,
              options: generationOptions
            )
            for try await chunk in responseStream {
              onUpdate(streamId, String(reflecting: chunk))
            }
          } else {
            let responseStream = session.streamResponse(to: "", options: generationOptions)
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
  //   • Provide support for adapters in the future
  //   • Provide shorter method for creating sessions (with simple instruction and prompt)
  @available(iOS 26, *)
  private func createSession(from transcript: Transcript) throws -> LanguageModelSession {
    return LanguageModelSession.init(
      model: SystemLanguageModel.default,
      guardrails: LanguageModelSession.Guardrails.default,
      tools: [],
      transcript: transcript
    )
  }
  
  // TODO:
  //   • Investigate assetIDs parameter usage in Transcript.Response
  //   • Implement tool calling support
  //   • Implement structured outputs
  @available(iOS 26, *)
  private func createTranscript(from messages: [[String: Any]]) throws -> Transcript {
    var entries: [Transcript.Entry] = []
    
    for message in messages {
      guard let role = message["role"] as? String,
            let content = message["content"] as? String else {
        continue
      }
      
      let segment = Transcript.Segment.text(
        .init(content: content)
      )
      
      switch role {
      case "system":
        let instructions = Transcript.Instructions.init(segments: [segment], toolDefinitions: [])
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
    
    return Transcript(entries: entries)
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
    let name = schemaDict["name"] as? String
    let description = schemaDict["description"] as? String
    
    switch type {
    case "object":
      return try parseObjectSchema(from: schemaDict, name: name, description: description)
    case "array":
      return try parseArraySchema(from: schemaDict, name: name, description: description)
    case "string":
      return try parseStringSchema(from: schemaDict, name: name, description: description)
    case "number", "integer":
      return try parseNumberSchema(from: schemaDict, name: name, description: description)
    case nil:
      if let ref = schemaDict["$ref"] as? String {
        return DynamicGenerationSchema(referenceTo: ref)
      }
      fallthrough
    default:
      throw AppleLLMError.invalidSchema("Unsupported schema type: \(type ?? "unknown"). Supported types: object, array, string, number, integer")
    }
  }
  
  @available(iOS 26, *)
  private func parseObjectSchema(from schemaDict: [String: Any], name: String?, description: String?) throws -> DynamicGenerationSchema {
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
      name: name ?? "",
      description: description,
      properties: properties
    )
  }
  
  @available(iOS 26, *)
  private func parseArraySchema(from schemaDict: [String: Any], name: String?, description: String?) throws -> DynamicGenerationSchema {
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
  private func parseStringSchema(from schemaDict: [String: Any], name: String?, description: String?) throws -> DynamicGenerationSchema {
    if let enumValues = schemaDict["enum"] as? [String] {
      guard let name = name else {
        throw AppleLLMError.invalidSchema("String enum schema must have a name")
      }
      
      return DynamicGenerationSchema(
        name: name,
        description: description,
        anyOf: enumValues
      )
    } else {
      return DynamicGenerationSchema(type: String.self, guides: [])
    }
  }
  
  @available(iOS 26, *)
  private func parseNumberSchema(from schemaDict: [String: Any], name: String?, description: String?) throws -> DynamicGenerationSchema {
    return DynamicGenerationSchema(type: Double.self, guides: [])
  }
  
#endif
}

enum AppleLLMError: Error, LocalizedError {
  case modelUnavailable
  case unsupportedOS
  case generationError(String)
  case streamNotFound(String)
  case invalidMessage(String)
  case conflictingSamplingMethods
  case invalidSchema(String)
  
  var errorDescription: String? {
    switch self {
    case .modelUnavailable:
      return "Apple Intelligence model is not available"
    case .unsupportedOS:
      return "Apple Intelligence not available on this iOS version"
    case .generationError(let message):
      return "Generation error: \(message)"
    case .streamNotFound(let id):
      return "Stream with ID \(id) not found"
    case .invalidMessage(let role):
      return "Invalid message role '\(role)'. Supported roles are: system, user, assistant"
    case .conflictingSamplingMethods:
      return "Cannot specify both topP and topK parameters simultaneously. Please use only one sampling method."
    case .invalidSchema(let message):
      return "Invalid schema: \(message)"
    }
  }
  
  var code: Int {
    switch self {
    case .modelUnavailable: return 1
    case .unsupportedOS: return 2
    case .generationError: return 3
    case .streamNotFound: return 4
    case .invalidMessage: return 5
    case .conflictingSamplingMethods: return 6
    case .invalidSchema: return 7
    }
  }
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
    
    guard let lastSegment = res.segments.last,
          case let .structure(structureSegment) = lastSegment else {
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
#endif
