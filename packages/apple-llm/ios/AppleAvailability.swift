//
//  AppleAvailability.swift
//  AppleLLM
//

import Foundation

/// Mirrors `SystemLanguageModel.Availability` so that the reason why Apple
/// Intelligence is unavailable survives the bridge to JavaScript.
enum AppleAvailability: String {
  case available
  case deviceNotEligible
  case appleIntelligenceNotEnabled
  case modelNotReady
  case unsupportedOS
  case unknown

  /// Human readable explanation, used to give `MODEL_UNAVAILABLE` errors the
  /// same level of detail as `getAvailability()`.
  var unavailableDescription: String {
    switch self {
    case .available:
      return "Apple Intelligence model is available"
    case .deviceNotEligible:
      return "Apple Intelligence model is not available: this device is not eligible for Apple Intelligence"
    case .appleIntelligenceNotEnabled:
      return "Apple Intelligence model is not available: Apple Intelligence is not enabled in Settings"
    case .modelNotReady:
      return "Apple Intelligence model is not available: the model is not ready yet, it may still be downloading"
    case .unsupportedOS:
      return "Apple Intelligence not available on this iOS version"
    case .unknown:
      return "Apple Intelligence model is not available"
    }
  }
}
