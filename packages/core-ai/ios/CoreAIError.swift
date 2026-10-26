import Foundation

enum CoreAIError: LocalizedError {
  case unsupportedOS
  case missingSource
  case missingSwiftPackage(String)
  case modelNotLoaded(String)
  case sessionNotFound(String)
  case unsupportedTask(String)
  case invalidInput(String)
  case cancelled
  case unsupportedCapability(String)
  case downloadFailed(String)

  var errorDescription: String? {
    switch self {
    case .unsupportedOS:
      return "Core AI requires iOS 27 or macOS 27 or newer."
    case .missingSource:
      return "Core AI model source is missing. Provide a file URI or bundle resource."
    case .missingSwiftPackage(let product):
      return "Missing Apple Core AI Swift Package product: \(product). Add the \"\(Self.task(linkedBy: product))\" task to the Expo config plugin's tasks option (or to CORE_AI_TASKS) and run pod install again."
    case .modelNotLoaded(let handle):
      return "Core AI model is not loaded: \(handle)."
    case .sessionNotFound(let handle):
      return "Core AI language session was not found: \(handle)."
    case .unsupportedTask(let task):
      return "Core AI task is not implemented for this wrapper yet: \(task)."
    case .invalidInput(let message):
      return message
    case .cancelled:
      return "Core AI request was cancelled."
    case .unsupportedCapability(let message):
      return message
    case .downloadFailed(let message):
      return message
    }
  }

  /// Task name that links a coreai-models product, as in ReactNativeAICoreAI.podspec
  private static func task(linkedBy product: String) -> String {
    switch product {
    case "CoreAILM":
      return "language"
    case "CoreAIDiffusion":
      return "diffusion"
    case "CoreAISegmentation":
      return "segmentation"
    case "CoreAIObjectDetection":
      return "object-detection"
    case "CoreAISpeech":
      return "asr"

    case "CoreAIVideoSegmentation":
      return "video-segmentation"
    case "CoreAIVideoDiffusion":
      return "video-diffusion"
    default:
      return product
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
    case .cancelled:
      return "CORE_AI_CANCELLED"
    case .unsupportedCapability:
      return "CORE_AI_UNSUPPORTED_CAPABILITY"
    case .downloadFailed:
      return "CORE_AI_DOWNLOAD_FAILED"
    }
  }
}
