import Foundation

enum CoreAIError: LocalizedError {
  case unsupportedOS
  case missingSource
  case missingSwiftPackage(String)
  case modelNotLoaded(String)
  case sessionNotFound(String)
  case unsupportedTask(String)
  case invalidInput(String)

  var errorDescription: String? {
    switch self {
    case .unsupportedOS:
      return "Core AI requires iOS 27 or macOS 27 or newer."
    case .missingSource:
      return "Core AI model source is missing. Provide a file URI or bundle resource."
    case .missingSwiftPackage(let product):
      return "Missing Apple Core AI Swift Package product: \(product). Add https://github.com/apple/coreai-models to the app target and link \(product)."
    case .modelNotLoaded(let handle):
      return "Core AI model is not loaded: \(handle)."
    case .sessionNotFound(let handle):
      return "Core AI language session was not found: \(handle)."
    case .unsupportedTask(let task):
      return "Core AI task is not implemented for this wrapper yet: \(task)."
    case .invalidInput(let message):
      return message
    }
  }

  var code: String {
    switch self {
    case .unsupportedOS:
      return "CORE_AI_UNSUPPORTED_OS"
    case .missingSource:
      return "CORE_AI_MISSING_SOURCE"
    case .missingSwiftPackage:
      return "CORE_AI_MISSING_SPM_PRODUCT"
    case .modelNotLoaded:
      return "CORE_AI_MODEL_NOT_LOADED"
    case .sessionNotFound:
      return "CORE_AI_SESSION_NOT_FOUND"
    case .unsupportedTask:
      return "CORE_AI_UNSUPPORTED_TASK"
    case .invalidInput:
      return "CORE_AI_INVALID_INPUT"
    }
  }
}
