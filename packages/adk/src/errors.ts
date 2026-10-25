export type AdkError = Error & {
  code: AdkErrorCode
}

export const AdkErrorCodes = {
  UnsupportedPlatform: 'UNSUPPORTED_PLATFORM',
  ModelUnavailable: 'MODEL_UNAVAILABLE',
  ModelDownloading: 'MODEL_DOWNLOADING',
  DownloadFailed: 'DOWNLOAD_FAILED',
  GenerationError: 'GENERATION_ERROR',
  InvalidMessage: 'INVALID_MESSAGE',
  InvalidSchema: 'INVALID_SCHEMA',
  ContextWindowExceeded: 'CONTEXT_WINDOW_EXCEEDED',
  RateLimited: 'RATE_LIMITED',
  BackgroundUseBlocked: 'BACKGROUND_USE_BLOCKED',
} as const

export type AdkErrorCode = (typeof AdkErrorCodes)[keyof typeof AdkErrorCodes]

const adkErrorCodes = new Set<string>(Object.values(AdkErrorCodes))

export function isAdkErrorCode(value: unknown): value is AdkErrorCode {
  return typeof value === 'string' && adkErrorCodes.has(value)
}

export function createAdkError(message: string, code: AdkErrorCode): AdkError {
  const error = new Error(message) as AdkError
  error.code = code
  return error
}

/**
 * Wraps a native rejection or stream error so it carries an `AdkErrorCode`.
 * Errors without a known code become `GENERATION_ERROR`.
 */
export function toAdkError(error: unknown, code?: string): AdkError {
  const nativeCode =
    code ??
    (typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : undefined)
  const message = error instanceof Error ? error.message : String(error)

  return createAdkError(
    message,
    isAdkErrorCode(nativeCode) ? nativeCode : AdkErrorCodes.GenerationError
  )
}
