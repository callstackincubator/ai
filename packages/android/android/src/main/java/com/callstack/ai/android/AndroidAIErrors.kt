package com.callstack.ai.android

import com.google.mlkit.genai.common.GenAiException
import com.google.mlkit.genai.common.GenAiException.ErrorCode
import org.json.JSONException

/** Error codes shared with `AndroidAIErrorCodes` in `src/errors.ts`. */
object AndroidAIErrors {
  const val MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE"
  const val MODEL_DOWNLOADING = "MODEL_DOWNLOADING"
  const val DOWNLOAD_FAILED = "DOWNLOAD_FAILED"
  const val FEATURE_NOT_SUPPORTED = "FEATURE_NOT_SUPPORTED"
  const val GENERATION_ERROR = "GENERATION_ERROR"
  const val INVALID_MESSAGE = "INVALID_MESSAGE"
  const val INVALID_SCHEMA = "INVALID_SCHEMA"
  const val CONTEXT_WINDOW_EXCEEDED = "CONTEXT_WINDOW_EXCEEDED"
  const val RATE_LIMITED = "RATE_LIMITED"
  const val BACKGROUND_USE_BLOCKED = "BACKGROUND_USE_BLOCKED"
  const val MAX_TURNS_EXCEEDED = "MAX_TURNS_EXCEEDED"

  /** Exception that already knows its error code. */
  class CodedException(val code: String, message: String, cause: Throwable? = null) :
    Exception(message, cause)

  fun codeFor(error: Throwable): String {
    var current: Throwable? = error
    while (current != null) {
      when (current) {
        is CodedException -> return current.code
        is GenAiException -> return codeFor(current)
        is JSONException, is IllegalArgumentException -> return INVALID_MESSAGE
      }
      current = current.cause
    }
    return GENERATION_ERROR
  }

  private fun codeFor(error: GenAiException): String =
    when (error.errorCode) {
      ErrorCode.NOT_AVAILABLE,
      ErrorCode.AICORE_INCOMPATIBLE,
      ErrorCode.NEEDS_SYSTEM_UPDATE,
      ErrorCode.NOT_ENOUGH_DISK_SPACE -> MODEL_UNAVAILABLE
      ErrorCode.NOT_SUPPORTED -> FEATURE_NOT_SUPPORTED
      ErrorCode.BUSY,
      ErrorCode.PER_APP_BATTERY_USE_QUOTA_EXCEEDED -> RATE_LIMITED
      ErrorCode.BACKGROUND_USE_BLOCKED -> BACKGROUND_USE_BLOCKED
      ErrorCode.REQUEST_TOO_LARGE -> CONTEXT_WINDOW_EXCEEDED
      ErrorCode.MAX_TURNS_EXCEEDED -> MAX_TURNS_EXCEEDED
      ErrorCode.INVALID_INPUT_IMAGE,
      ErrorCode.REQUEST_TOO_SMALL -> INVALID_MESSAGE
      else -> GENERATION_ERROR
    }
}
