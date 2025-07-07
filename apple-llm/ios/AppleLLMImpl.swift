//
//  AppleLLM.swift
//  AppleLLM
//
//  Created by Mike Grabowski on 06/07/2025.
//

import Foundation

#if canImport(FoundationModels)
import FoundationModels
#endif

@objc
public class AppleLLMImpl: NSObject {
  
  private var streamTasks: [String: Task<Void, Never>] = [:]
  
  @objc
  public func isAvailable(
    _ resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
#if canImport(FoundationModels)
    if #available(iOS 26, *) {
      let isAvailable = SystemLanguageModel.default.availability == .available
      resolve(isAvailable)
    } else {
      resolve(false)
    }
#else
    resolve(false)
#endif
  }
  
  @objc
  public func generateText(
    _ messages: NSArray,
    options: NSDictionary?,
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
          let transcript = try self.createTranscript(from: messages as? [[String: Any]] ?? [])
      
          let session = try self.createSession(from: transcript)
          let generationOptions = try self.createGenerationOptions(from: options as? [String: Any] ?? [:])
          
          let response = try await session.respond(to: "", options: generationOptions)
          resolve(response)
        } catch {
          reject("GENERATION_ERROR", error.localizedDescription, error)
        }
      }
    } else {
      reject(
        "UNSUPPORTED_OS",
        "Apple Intelligence not available on this iOS version",
        nil
      )
    }
#else
    reject(
      "UNSUPPORTED_OS",
      "Apple Intelligence not available on this iOS version",
      nil
    )
#endif
  }
  
  @objc
  public func startStream(
    _ messages: NSArray,
    options: NSDictionary?,
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
      
      let streamId = UUID().uuidString
      
      let task = Task {
        do {
          let transcript = try self.createTranscript(from: messages as? [[String: Any]] ?? [])
          
          let session = try self.createSession(from: transcript)
          let generationOptions = try self.createGenerationOptions(from: options as? [String: Any] ?? [:])
          
          let responseStream = session.streamResponse(to: "", options: generationOptions)
          
          for try await chunk in responseStream {
//            self.sendEvent(withName: "onStreamUpdate", body: [
//              "streamId": streamId,
//              "content": chunk
//            ])
          }
          
          // Send completion event only if not cancelled
          if !Task.isCancelled {
//            self.sendEvent(withName: "onStreamComplete", body: [
//              "streamId": streamId
//            ])
          }
        } catch {
//          self.sendEvent(withName: "onStreamError", body: [
//            "streamId": streamId,
//            "error": error.localizedDescription
//          ])
        }
        
        // Clean up task from map when completed
        self.streamTasks.removeValue(forKey: streamId)
      }
      
      // Store task in map
      streamTasks[streamId] = task
      
      resolve(streamId)
    } else {
      reject(
        "UNSUPPORTED_OS",
        "Apple Intelligence not available on this iOS version",
        nil
      )
    }
#else
    reject(
      "UNSUPPORTED_OS",
      "Apple Intelligence not available on this iOS version",
      nil
    )
#endif
  }
  
  @objc
  public func cancelStream(
    _ streamId: NSString,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
    let streamIdString = streamId as String
    
    if let task = streamTasks[streamIdString] {
      task.cancel()
      streamTasks.removeValue(forKey: streamIdString)
      resolve(nil)
    } else {
      reject(
        "STREAM_NOT_FOUND",
        "Stream with ID \(streamIdString) not found",
        nil
      )
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
        throw NSError(
          domain: "AppleLLM",
          code: 2,
          userInfo: [
            NSLocalizedDescriptionKey: "Invalid message role '\(role)'. Supported roles are: system, user, assistant"
          ]
        )
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
      throw NSError(
        domain: "AppleLLM",
        code: 2,
        userInfo: [
          NSLocalizedDescriptionKey: "Cannot specify both topP and topK parameters simultaneously. Please use only one sampling method."
        ]
      )
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
  
#endif
}
