export type AndroidAIError = Error & {
  code: AndroidAIErrorCode
}

export const AndroidAIErrorCodes = {
  UnsupportedPlatform: 'UNSUPPORTED_PLATFORM',
  ModelUnavailable: 'MODEL_UNAVAILABLE',
  ModelDownloading: 'MODEL_DOWNLOADING',
  DownloadFailed: 'DOWNLOAD_FAILED',
  FeatureNotSupported: 'FEATURE_NOT_SUPPORTED',
  GenerationError: 'GENERATION_ERROR',
  InvalidMessage: 'INVALID_MESSAGE',
  InvalidSchema: 'INVALID_SCHEMA',
  ContextWindowExceeded: 'CONTEXT_WINDOW_EXCEEDED',
  RateLimited: 'RATE_LIMITED',
  BackgroundUseBlocked: 'BACKGROUND_USE_BLOCKED',
  MaxTurnsExceeded: 'MAX_TURNS_EXCEEDED',
} as const

export type AndroidAIErrorCode =
  (typeof AndroidAIErrorCodes)[keyof typeof AndroidAIErrorCodes]

const androidAIErrorCodes = new Set<string>(Object.values(AndroidAIErrorCodes))

export function isAndroidAIErrorCode(
  value: unknown
): value is AndroidAIErrorCode {
  return typeof value === 'string' && androidAIErrorCodes.has(value)
}

export function createAndroidAIError(
  message: string,
  code: AndroidAIErrorCode,
  cause?: unknown
): AndroidAIError {
  const error = new Error(message, { cause }) as AndroidAIError
  error.code = code
  return error
}

/**
 * Wraps a native rejection or stream error so it carries an
 * `AndroidAIErrorCode`. Errors without a known code become `GENERATION_ERROR`
 */
export function toAndroidAIError(
  error: unknown,
  code?: string
): AndroidAIError {
  const nativeCode =
    code ??
    (typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : undefined)
  const message = error instanceof Error ? error.message : String(error)

  return createAndroidAIError(
    message,
    isAndroidAIErrorCode(nativeCode)
      ? nativeCode
      : AndroidAIErrorCodes.GenerationError,
    error
  )
}
