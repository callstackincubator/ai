import type { SharedV4Warning } from '@ai-sdk/provider'

import type { Conversation, ToolSpec } from './prompt'
import type { LiteRTPrepareOptions } from './types'

/** What one call asks the engine to generate. */
export interface GenerationRequest {
  conversation: Conversation
  tools: ToolSpec[]
  temperature?: number
  topK?: number
  topP?: number
  seed?: number
  maxOutputTokens?: number
  frequencyPenalty?: number
  presencePenalty?: number
  /** JSON Schema the output must follow, as text. An empty string asks for any JSON. */
  jsonSchema?: string
  /** `true` or `false` turns the model's reasoning on or off. Undefined keeps the model's default. */
  thinking?: boolean
}

/** A piece of generated output. */
export type OutputChunk =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | {
      type: 'tool-call'
      /** May be empty when the engine's output had no readable name. */
      name: string
      /** The arguments as JSON text. Passed on as is, so `ai` reports it when it doesn't parse. */
      argumentsJson: string
    }

export interface GenerationResult {
  continued: boolean
  reloaded: boolean
  inputTokens?: number
  outputTokens?: number
  tokensPerSecond?: number
  timeToFirstTokenMs?: number
  /** The engine stopped at its output limit, before the model finished. */
  cutOff?: boolean
}

/**
 * The runtime under a language model.
 * Calls are made one at a time.
 */
export interface LiteRTRuntime {
  /** What a call would change in the loaded engine, and what it can't honor. */
  warningsFor(request: GenerationRequest): SharedV4Warning[]
  prepare(options?: LiteRTPrepareOptions): Promise<void>
  /**
   * Generate, sending output through `onChunk`. Resolves when the model stops.
   * Aborting the signal stops generation and rejects with an AbortError.
   */
  generate(
    request: GenerationRequest,
    onChunk: (chunk: OutputChunk) => void,
    abortSignal?: AbortSignal
  ): Promise<GenerationResult>
  unload(): Promise<void>
}

/** Runs tasks one after another. */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve()

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task)
    this.tail = result.catch(() => {})
    return result
  }
}
