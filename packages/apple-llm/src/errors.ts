export type AppleLLMError = Error & {
  code?: string
}

export const AppleLLMErrorCodes = {
  ContextWindowExceeded: 'CONTEXT_WINDOW_EXCEEDED',
  ModelUnavailable: 'MODEL_UNAVAILABLE',
} as const

export type AppleLLMErrorCode =
  (typeof AppleLLMErrorCodes)[keyof typeof AppleLLMErrorCodes]

export function createAppleLLMError(
  message: string,
  code?: string
): AppleLLMError {
  const error = new Error(message) as AppleLLMError
  if (code) {
    error.code = code
  }
  return error
}
