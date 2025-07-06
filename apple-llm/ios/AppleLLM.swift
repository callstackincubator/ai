import Foundation
import React

#if canImport(AppleIntelligence)
import AppleIntelligence
#endif

@objc(AppleLLM)
class AppleLLM: RCTEventEmitter {
    
    private var streamTasks: [String: Task<Void, Never>] = [:]
  
    @objc
    func isAvailable(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        #if canImport(AppleIntelligence)
        // Check if Apple Intelligence system model is available
        let isAvailable = SystemLanguageModel.default.availability == .available
        resolve(isAvailable)
        #else
        resolve(false)
        #endif
    }
    
    @objc
    func generateText(_ messages: NSArray, options: NSDictionary?, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        #if canImport(AppleIntelligence)
        guard SystemLanguageModel.default.availability == .available else {
            reject("MODEL_UNAVAILABLE", "Apple Intelligence model is not available", nil)
            return
        }
        
        Task {
            do {
                let convertedMessages = self.convertMessages(messages)
                let convertedOptions = self.convertOptions(options)
                let response = try await self.generateWithAppleIntelligence(messages: convertedMessages, options: convertedOptions)
                resolve(response)
            } catch {
                reject("GENERATION_ERROR", error.localizedDescription, error)
            }
        }
        #else
        reject("UNSUPPORTED_OS", "Apple Intelligence not available on this iOS version", nil)
        #endif
    }
    
    @objc
    func startStream(_ messages: NSArray, options: NSDictionary?, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        #if canImport(AppleIntelligence)
        guard SystemLanguageModel.default.availability == .available else {
            reject("MODEL_UNAVAILABLE", "Apple Intelligence model is not available", nil)
            return
        }
        
        let streamId = UUID().uuidString
        
        let task = Task {
            do {
                let convertedMessages = self.convertMessages(messages)
                let convertedOptions = self.convertOptions(options)
                try await self.streamWithAppleIntelligence(messages: convertedMessages, options: convertedOptions, streamId: streamId)
            } catch {
                self.sendEvent(withName: "onStreamError", body: [
                    "streamId": streamId,
                    "error": error.localizedDescription
                ])
            }
            
            // Clean up task from map when completed
            self.streamTasks.removeValue(forKey: streamId)
        }
        
        // Store task in map
        streamTasks[streamId] = task
        
        resolve(streamId)
        #else
        reject("UNSUPPORTED_OS", "Apple Intelligence not available on this iOS version", nil)
        #endif
    }
    
    @objc
    func cancelStream(_ streamId: NSString, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        let streamIdString = streamId as String
        
        if let task = streamTasks[streamIdString] {
            task.cancel()
            streamTasks.removeValue(forKey: streamIdString)
            resolve(nil)
        } else {
            reject("STREAM_NOT_FOUND", "Stream with ID \(streamIdString) not found", nil)
        }
    }
    
    @objc
    func isModelAvailable(_ modelId: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        #if canImport(AppleIntelligence)
        resolve(SystemLanguageModel.default.availability == .available)
        #else
        resolve(false)
        #endif
    }
    
    // MARK: - Private Methods
    
    private func convertMessages(_ messages: NSArray) -> [[String: Any]] {
        guard let messagesArray = messages as? [[String: Any]] else {
            return []
        }
        return messagesArray
    }
    
    private func convertOptions(_ options: NSDictionary?) -> [String: Any]? {
        guard let optionsDict = options as? [String: Any] else {
            return nil
        }
        return optionsDict
    }
    
    #if canImport(AppleIntelligence)
    
    private func generateWithAppleIntelligence(messages: [[String: Any]], options: [String: Any]?) async throws -> String {
        // Extract the last user message as the prompt
        guard let lastMessage = messages.last,
              let content = lastMessage["content"] as? String else {
            throw NSError(domain: "AppleLLM", code: 1, userInfo: [NSLocalizedDescriptionKey: "No valid message found"])
        }
        
        // Create Apple's GenerationOptions from our options
        let generationOptions = createGenerationOptions(from: options)
        
        // Extract system prompt from options (not from messages)
        let systemPrompt = options?["systemPrompt"] as? String
        
        // Create session with or without system prompt - initialize fresh each time
        let session: LanguageModelSession
        if let systemPrompt = systemPrompt, !systemPrompt.isEmpty {
            session = LanguageModelSession(instructions: systemPrompt)
        } else {
            session = LanguageModelSession()
        }
        
        // Generate response
        if let generationOptions = generationOptions {
            return try await session.respond(to: content, options: generationOptions)
        } else {
            return try await session.respond(to: content)
        }
    }
    
    private func streamWithAppleIntelligence(messages: [[String: Any]], options: [String: Any]?, streamId: String) async throws {
        // Extract the last user message as the prompt
        guard let lastMessage = messages.last,
              let content = lastMessage["content"] as? String else {
            throw NSError(domain: "AppleLLM", code: 1, userInfo: [NSLocalizedDescriptionKey: "No valid message found"])
        }
        
        // Create Apple's GenerationOptions from our options
        let generationOptions = createGenerationOptions(from: options)
        
        // Extract system prompt from options (not from messages)
        let systemPrompt = options?["systemPrompt"] as? String
        
        // Create session with or without system prompt - initialize fresh each time
        let session: LanguageModelSession
        if let systemPrompt = systemPrompt, !systemPrompt.isEmpty {
            session = LanguageModelSession(instructions: systemPrompt)
        } else {
            session = LanguageModelSession()
        }
        
        // Note: Apple Intelligence may not support streaming yet
        // For now, we'll simulate streaming by chunking the response
        let response: String
        if let generationOptions = generationOptions {
            response = try await session.respond(to: content, options: generationOptions)
        } else {
            response = try await session.respond(to: content)
        }
        
        // Simulate streaming by sending chunks
        let words = response.components(separatedBy: " ")
        for (index, word) in words.enumerated() {
            // Check if task was cancelled
            if Task.isCancelled {
                break
            }
            
            let chunk = index == 0 ? word : " " + word
            
            self.sendEvent(withName: "onStreamUpdate", body: [
                "streamId": streamId,
                "content": chunk
            ])
            
            // Small delay to simulate streaming
            try await Task.sleep(nanoseconds: 100_000_000) // 0.1 seconds
        }
        
        // Send completion event only if not cancelled
        if !Task.isCancelled {
            self.sendEvent(withName: "onStreamComplete", body: [
                "streamId": streamId
            ])
        }
    }
    
    private func createGenerationOptions(from options: [String: Any]?) -> GenerationOptions? {
        guard let options = options else { return nil }
        
        var temperature: Double?
        var maximumResponseTokens: Int?
        var samplingMode: GenerationOptions.SamplingMode?
        
        // Extract temperature
        if let temp = options["temperature"] as? Double {
            temperature = temp
        }
        
        // Extract maximum response tokens (using AI SDK standard name)
        if let maxTokens = options["maxTokens"] as? Int {
            maximumResponseTokens = maxTokens
        }
        
        // Smart sampling strategy based on provided options
        let topP = options["topP"] as? Double
        let topK = options["topK"] as? Int
        
        if topP != nil && topK != nil {
            // Both provided - use greedy (no sampling mode)
            samplingMode = nil
        } else if let topPValue = topP {
            // Only topP provided
            samplingMode = .topP(topPValue)
        } else if let topKValue = topK {
            // Only topK provided
            samplingMode = .topK(topKValue)
        } else {
            // Neither provided - use greedy (no sampling mode)
            samplingMode = nil
        }
        
        // Only create GenerationOptions if we have at least one parameter
        if temperature != nil || maximumResponseTokens != nil || samplingMode != nil {
            return GenerationOptions(
                sampling: samplingMode,
                temperature: temperature,
                maximumResponseTokens: maximumResponseTokens
            )
        }
        
        return nil
    }
    
    #endif
}
