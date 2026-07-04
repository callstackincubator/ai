export type AppleLLMError = Error & {
  code: AppleLLMErrorCode
}

export const AppleLLMErrorCodes = {
  ModelUnavailable: 'MODEL_UNAVAILABLE',
  UnsupportedOS: 'UNSUPPORTED_OS',
  GenerationError: 'GENERATION_ERROR',
  InvalidMessage: 'INVALID_MESSAGE',
  ConflictingSamplingMethods: 'CONFLICTING_SAMPLING_METHODS',
  InvalidSchema: 'INVALID_SCHEMA',
  ToolCallError: 'TOOL_CALL_ERROR',
  UnknownToolCallError: 'UNKNOWN_TOOL_CALL_ERROR',
  ContextWindowExceeded: 'CONTEXT_WINDOW_EXCEEDED',
  RateLimited: 'RATE_LIMITED',
} as const

export type AppleLLMErrorCode =
  (typeof AppleLLMErrorCodes)[keyof typeof AppleLLMErrorCodes]

const appleLLMErrorCodes = new Set<string>(Object.values(AppleLLMErrorCodes))

export function isAppleLLMErrorCode(
  value: unknown
): value is AppleLLMErrorCode {
  return typeof value === 'string' && appleLLMErrorCodes.has(value)
}

export function createAppleLLMError(
  message: string,
  code: AppleLLMErrorCode
): AppleLLMError {
  const error = new Error(message) as AppleLLMError
  error.code = code
  return error
}
