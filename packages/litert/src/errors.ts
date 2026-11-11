import { AISDKError } from '@ai-sdk/provider'

const name = 'AI_LiteRTError'
const marker = `vercel.ai.error.${name}`
const symbol = Symbol.for(marker)

export type LiteRTErrorCode =
  /** No file at the path, no such Hugging Face repo, or a repo without a usable `.litertlm` file. */
  | 'MODEL_NOT_FOUND'
  /** The file exists but is not a readable `.litertlm` bundle. */
  | 'INVALID_MODEL'
  /** The download failed. */
  | 'DOWNLOAD_FAILED'
  /** The engine ran out of memory, or refused to load because it would. */
  | 'OUT_OF_MEMORY'
  /** The bundle needs a newer LiteRT-LM than the installed runtime. */
  | 'RUNTIME_TOO_OLD'
  /** The engine could not start for another reason. */
  | 'LOAD_FAILED'
  /** The prompt is longer than the conversation can hold. */
  | 'CONTEXT_TOO_LONG'
  /** Generation failed for another reason. */
  | 'GENERATION_FAILED'

/** A failure from LiteRT-LM. Branch on `code`; `cause` holds the engine's own error. */
export class LiteRTError extends AISDKError {
  private readonly [symbol] = true
  readonly code: LiteRTErrorCode

  constructor(code: LiteRTErrorCode, message: string, cause?: unknown) {
    super({ name, message, cause })
    this.code = code
  }

  static override isInstance(error: unknown): error is LiteRTError {
    return AISDKError.hasMarker(error, marker)
  }
}

/** The error a cancelled call fails with: what `ai` recognizes as an abort. */
export function createAbortError(): Error {
  const error = new Error('The call was aborted.')
  error.name = 'AbortError'
  return error
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
