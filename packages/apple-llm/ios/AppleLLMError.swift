//
//  AppleLLMError.swift
//  AppleLLM
//
//  Created by Mike Grabowski on 13/07/2025.
//

import Foundation

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
