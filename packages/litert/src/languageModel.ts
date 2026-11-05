import type {
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4FinishReason,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
  LanguageModelV4Usage,
  SharedV4ProviderMetadata,
  SharedV4Warning,
} from '@ai-sdk/provider'

import type {
  GenerationRequest,
  GenerationResult,
  LiteRTRuntime,
  OutputChunk,
  SerialQueue,
} from './backend'
import { createAbortError } from './errors'
import { canonicalJson, selectTools, toConversation } from './prompt'
import {
  type LiteRTCallMetadata,
  type LiteRTLanguageModel,
  type LiteRTPrepareOptions,
  PROVIDER_NAME,
} from './types'

let idCounter = 0
function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`
}

/** A model asked for JSON may still wrap it in a code fence, which `ai` can't parse. */
function stripCodeFence(text: string): string {
  const match = /^\s*```(?:json)?\s*\n?([\s\S]*?)\n?\s*```\s*$/i.exec(text)
  return match?.[1] ?? text.trim()
}

/** A tool name the model's output did not give. `ai` reports the call as a tool error. */
const UNREADABLE_TOOL_NAME = 'unreadable_tool_call'

function toToolCall(chunk: Extract<OutputChunk, { type: 'tool-call' }>) {
  return {
    type: 'tool-call' as const,
    toolCallId: nextId('call'),
    toolName: chunk.name.length > 0 ? chunk.name : UNREADABLE_TOOL_NAME,
    input: chunk.argumentsJson,
  }
}

function buildRequest(options: LanguageModelV4CallOptions): {
  request: GenerationRequest
  warnings: SharedV4Warning[]
} {
  const warnings: SharedV4Warning[] = []
  const conversation = toConversation(options.prompt)
  const tools = selectTools(options, warnings)

  if (options.stopSequences !== undefined && options.stopSequences.length > 0) {
    warnings.push({ type: 'unsupported', feature: 'stopSequences' })
  }

  let jsonSchema: string | undefined
  if (options.responseFormat?.type === 'json') {
    jsonSchema =
      options.responseFormat.schema !== undefined
        ? canonicalJson(options.responseFormat.schema)
        : ''
  }

  let thinking: boolean | undefined
  if (
    options.reasoning !== undefined &&
    options.reasoning !== 'provider-default'
  ) {
    thinking = options.reasoning !== 'none'
  }

  return {
    warnings,
    request: {
      conversation,
      tools,
      temperature: options.temperature,
      topK: options.topK,
      topP: options.topP,
      seed: options.seed,
      maxOutputTokens: options.maxOutputTokens,
      frequencyPenalty: options.frequencyPenalty,
      presencePenalty: options.presencePenalty,
      jsonSchema,
      thinking,
    },
  }
}

function toUsage(result: GenerationResult): LanguageModelV4Usage {
  return {
    inputTokens: {
      total: result.inputTokens,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: result.outputTokens,
      text: undefined,
      reasoning: undefined,
    },
  }
}

function toFinishReason(
  result: GenerationResult,
  sawToolCall: boolean
): LanguageModelV4FinishReason {
  if (sawToolCall) return { unified: 'tool-calls', raw: 'tool-calls' }
  if (result.cutOff === true) return { unified: 'length', raw: 'length' }
  return { unified: 'stop', raw: 'stop' }
}

function toProviderMetadata(
  result: GenerationResult
): SharedV4ProviderMetadata {
  const metadata: LiteRTCallMetadata = {
    continued: result.continued,
    reloaded: result.reloaded,
    tokensPerSecond: result.tokensPerSecond,
    timeToFirstTokenMs: result.timeToFirstTokenMs,
  }
  // Keep only defined values: provider metadata must be JSON.
  return {
    [PROVIDER_NAME]: JSON.parse(JSON.stringify(metadata)) as Record<
      string,
      never
    >,
  }
}

export class LanguageModel implements LiteRTLanguageModel {
  readonly specificationVersion = 'v4' as const
  readonly provider = PROVIDER_NAME
  readonly supportedUrls: Record<string, RegExp[]> = {}

  constructor(
    readonly modelId: string,
    private readonly runtime: LiteRTRuntime,
    /** Shared by a provider's models: phones and browsers run one engine at a time. */
    private readonly queue: SerialQueue
  ) {}

  prepare(options?: LiteRTPrepareOptions): Promise<void> {
    return this.queue.run(() => this.runtime.prepare(options))
  }

  unload(): Promise<void> {
    return this.queue.run(() => this.runtime.unload())
  }

  async doGenerate(
    options: LanguageModelV4CallOptions
  ): Promise<LanguageModelV4GenerateResult> {
    const { request, warnings } = buildRequest(options)

    let text = ''
    let reasoning = ''
    const toolCalls: LanguageModelV4Content[] = []
    const result = await this.queue.run(() => {
      if (options.abortSignal?.aborted) throw createAbortError()
      // Read once it's this call's turn: what it changes depends on the calls before it.
      warnings.push(...this.runtime.warningsFor(request))
      return this.runtime.generate(
        request,
        (chunk) => {
          if (chunk.type === 'text') text += chunk.text
          else if (chunk.type === 'reasoning') reasoning += chunk.text
          else toolCalls.push(toToolCall(chunk))
        },
        options.abortSignal
      )
    })

    if (request.jsonSchema !== undefined) text = stripCodeFence(text)
    const content: LanguageModelV4Content[] = []
    if (reasoning.length > 0)
      content.push({ type: 'reasoning', text: reasoning })
    if (text.length > 0) content.push({ type: 'text', text })
    content.push(...toolCalls)

    return {
      content,
      finishReason: toFinishReason(result, toolCalls.length > 0),
      usage: toUsage(result),
      providerMetadata: toProviderMetadata(result),
      warnings,
    }
  }

  async doStream(
    options: LanguageModelV4CallOptions
  ): Promise<LanguageModelV4StreamResult> {
    if (typeof ReadableStream === 'undefined') {
      throw new TypeError(
        'ReadableStream is not available here. Bare React Native apps need a polyfill such as web-streams-polyfill.'
      )
    }
    const { request, warnings } = buildRequest(options)

    // A consumer that cancels the stream stops generation the same way the caller's signal does.
    const abort = new AbortController()
    const onCallerAbort = () => abort.abort()
    if (options.abortSignal?.aborted) abort.abort()
    else options.abortSignal?.addEventListener('abort', onCallerAbort)

    const stream = new ReadableStream<LanguageModelV4StreamPart>({
      start: (controller) => {
        // Tokens already queued natively can arrive after a cancel, and enqueueing
        // on a cancelled stream throws inside the native callback.
        const enqueue = (part: LanguageModelV4StreamPart) => {
          if (!abort.signal.aborted) controller.enqueue(part)
        }

        // A consumer that cancelled the stream is gone. A caller's abort ends it like a fetch's.
        const endAborted = () => {
          if (options.abortSignal?.aborted !== true) return
          try {
            controller.error(createAbortError())
          } catch {
            // The consumer already cancelled the stream.
          }
        }

        let open: { type: 'text' | 'reasoning'; id: string } | undefined
        const close = () => {
          if (open === undefined) return
          enqueue({ type: `${open.type}-end`, id: open.id })
          open = undefined
        }
        const openPart = (type: 'text' | 'reasoning'): string => {
          if (open?.type === type) return open.id
          close()
          open = { type, id: nextId(type) }
          enqueue({ type: `${type}-start`, id: open.id })
          return open.id
        }

        // JSON goes out whole, once its code fence (if any) can be removed.
        let bufferedJson = request.jsonSchema !== undefined ? '' : undefined
        let sawToolCall = false
        const onChunk = (chunk: OutputChunk) => {
          if (chunk.type === 'tool-call') {
            close()
            sawToolCall = true
            enqueue(toToolCall(chunk))
            return
          }
          if (chunk.type === 'text' && bufferedJson !== undefined) {
            bufferedJson += chunk.text
            return
          }
          const id = openPart(chunk.type)
          enqueue({ type: `${chunk.type}-delta`, id, delta: chunk.text })
        }

        void this.queue
          .run(() => {
            if (abort.signal.aborted) throw createAbortError()
            // Read once it's this call's turn: what it changes depends on the calls before it.
            warnings.push(...this.runtime.warningsFor(request))
            enqueue({ type: 'stream-start', warnings })
            return this.runtime.generate(request, onChunk, abort.signal)
          })
          .then(
            (result) => {
              if (abort.signal.aborted) {
                endAborted()
                return
              }
              if (bufferedJson !== undefined && bufferedJson.length > 0) {
                const id = openPart('text')
                enqueue({
                  type: 'text-delta',
                  id,
                  delta: stripCodeFence(bufferedJson),
                })
              }
              close()
              enqueue({
                type: 'finish',
                finishReason: toFinishReason(result, sawToolCall),
                usage: toUsage(result),
                providerMetadata: toProviderMetadata(result),
              })
              controller.close()
            },
            (error: unknown) => {
              if (abort.signal.aborted) {
                endAborted()
                return
              }
              close()
              enqueue({ type: 'error', error })
              enqueue({
                type: 'finish',
                finishReason: { unified: 'error', raw: undefined },
                usage: toUsage({ continued: false, reloaded: false }),
              })
              controller.close()
            }
          )
          .finally(() =>
            options.abortSignal?.removeEventListener('abort', onCallerAbort)
          )
      },
      cancel: () => {
        abort.abort()
      },
    })

    return { stream }
  }
}
