//
//  AppleLLMError.swift
//  AppleLLM
//
//  Created by Mike Grabowski on 13/07/2025.
//

import Foundation

enum AppleLLMError: Error, LocalizedError {
  case modelUnavailable(String)
  case unsupportedOS
  case generationError(String)
  case streamNotFound(String)
  case invalidMessage(String)
  case conflictingSamplingMethods
  case invalidSchema(String)
  case toolCallError(Error)
  case unknownToolCallError
  case contextWindowExceeded
  case rateLimited
  case guardrailViolation(String)
  case refusal(String)
  case unsupportedLanguage(String)
  case assetsUnavailable(String)
  case concurrentRequests(String)
  case decodingFailure(String)
  case timeout(String)
  case networkFailure(String)
  case serviceUnavailable(String)
  
  var errorDescription: String? {
    switch self {
    case .modelUnavailable(let reason):
      return "Apple Intelligence model is not available (\(reason))"
    case .unsupportedOS:
      return "Apple Intelligence not available on this iOS version"
    case .generationError(let message):
      return "Generation error: \(message)"
    case .streamNotFound(let id):
      return "Stream with ID \(id) not found"
    case .invalidMessage(let message):
      return "Invalid message: \(message)"
    case .conflictingSamplingMethods:
      return "Cannot specify both topP and topK parameters simultaneously. Please use only one sampling method."
    case .invalidSchema(let message):
      return "Invalid schema: \(message)"
    case .toolCallError(let error):
      return "Error calling tool: \(error.localizedDescription)"
    case .unknownToolCallError:
      return "Unknown tool call error"
    case .contextWindowExceeded:
      return "Context window exceeded"
    case .rateLimited:
      return "Apple Intelligence request limit reached"
    case .guardrailViolation(let message),
         .refusal(let message),
         .unsupportedLanguage(let message),
         .assetsUnavailable(let message),
         .concurrentRequests(let message),
         .decodingFailure(let message),
         .timeout(let message),
         .networkFailure(let message),
         .serviceUnavailable(let message):
      return message
    }
    
  }

  var publicErrorCode: String? {
    switch self {
    case .modelUnavailable:
      return "MODEL_UNAVAILABLE"
    case .unsupportedOS:
      return "UNSUPPORTED_OS"
    case .generationError:
      return "GENERATION_ERROR"
    case .invalidMessage:
      return "INVALID_MESSAGE"
    case .conflictingSamplingMethods:
      return "CONFLICTING_SAMPLING_METHODS"
    case .invalidSchema:
      return "INVALID_SCHEMA"
    case .toolCallError:
      return "TOOL_CALL_ERROR"
    case .unknownToolCallError:
      return "UNKNOWN_TOOL_CALL_ERROR"
    case .contextWindowExceeded:
      return "CONTEXT_WINDOW_EXCEEDED"
    case .rateLimited:
      return "RATE_LIMITED"
    case .guardrailViolation:
      return "GUARDRAIL_VIOLATION"
    case .refusal:
      return "REFUSAL"
    case .unsupportedLanguage:
      return "UNSUPPORTED_LANGUAGE"
    case .assetsUnavailable:
      return "ASSETS_UNAVAILABLE"
    case .concurrentRequests:
      return "CONCURRENT_REQUESTS"
    case .decodingFailure:
      return "DECODING_FAILURE"
    case .timeout:
      return "TIMEOUT"
    case .networkFailure:
      return "NETWORK_FAILURE"
    case .serviceUnavailable:
      return "SERVICE_UNAVAILABLE"
    case .streamNotFound:
      return nil
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
    case .unknownToolCallError: return 8
    case .toolCallError: return 9
    case .contextWindowExceeded: return 10
    case .rateLimited: return 11
    case .guardrailViolation: return 12
    case .refusal: return 13
    case .unsupportedLanguage: return 14
    case .assetsUnavailable: return 15
    case .concurrentRequests: return 16
    case .decodingFailure: return 17
    case .timeout: return 18
    case .networkFailure: return 19
    case .serviceUnavailable: return 20
    }
  }
}
