import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4FilePart,
  LanguageModelV4FinishReason,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
  SharedV4Warning,
  TranscriptionModelV4,
  TranscriptionModelV4CallOptions,
  TranscriptionModelV4Result,
} from '@ai-sdk/provider'
import { generateId, resolveFullMediaType } from '@ai-sdk/provider-utils'
import { type CodegenTypes, Platform } from 'react-native'

import { AdkErrorCodes, createAdkError, toAdkError } from './errors'
import {
  type AdkAgentConfig,
  type AdkGenerationOptions,
  type AdkMessage,
  type AdkMessagePart,
  type AdkNanoModelConfig,
  type AdkTranscriptionConfig,
  type AdkUsageMetadata,
  getNativeAdkEngine,
  type NanoDownloadProgressEvent,
} from './NativeAdkEngine'

const MODEL_ID = 'gemini-nano'

export interface AdkLanguageModelOptions {
  /** ADK agent name */
  name?: string
  /** ADK agent description */
  description?: string
  /** System instruction for the agent */
  instruction?: string
  /** Gemini Nano model selection */
  nano?: AdkNanoModelConfig
}

/** Per-call options passed as `providerOptions.adk` */
export interface AdkProviderOptions {
  /** Whether the model's thoughts come back as reasoning parts */
  includeThoughts?: boolean
}

export type AdkModelAvailability =
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'unavailable'
  | 'unknown'

export interface AdkModelInfo {
  availability: AdkModelAvailability
  /** Name of the Gemini Nano base model, when ML Kit reports it */
  baseModelName?: string
  /** Gemini Nano input token limit, when ML Kit reports it */
  contextSize?: number
}

export interface AdkDownloadProgress {
  phase: 'started' | 'progress' | 'completed'
  bytesDownloaded?: number
  bytesToDownload?: number
}

export interface AdkPrepareOptions {
  onProgress?: (progress: AdkDownloadProgress) => void
}

export interface AdkLanguageModel extends LanguageModelV4 {
  /** Downloads Gemini Nano when needed and loads it, reporting download progress */
  prepare: (options?: AdkPrepareOptions) => Promise<void>
  /** Counts tokens with the Gemini Nano tokenizer */
  countTokens: (text: string) => Promise<number>
}

export type AdkTranscriptionOptions = AdkTranscriptionConfig

export interface AdkTranscriptionModel extends TranscriptionModelV4 {
  /** Whether speech recognition for this locale and mode is downloaded or downloadable */
  isAvailable: () => Promise<boolean>
  getAvailability: () => Promise<AdkModelAvailability>
  /** Downloads the speech recognition model, reporting download progress */
  prepare: (options?: AdkPrepareOptions) => Promise<void>
}

export interface AdkProvider {
  (options?: AdkLanguageModelOptions): AdkLanguageModel
  readonly specificationVersion: 'v4'
  languageModel: (options?: AdkLanguageModelOptions) => AdkLanguageModel
  /** Whether Gemini Nano can be used now: it is `available` or `downloadable` */
  isAvailable: () => Promise<boolean>
  /** Gemini Nano's availability, for the provider's model selection or `nano` */
  getModelInfo: (options?: {
    nano?: AdkNanoModelConfig
  }) => Promise<AdkModelInfo>
  /** On-device speech to text with ML Kit GenAI speech recognition */
  transcriptionModel: (
    options?: AdkTranscriptionOptions
  ) => AdkTranscriptionModel
}

const toModelAvailability = (value: string): AdkModelAvailability => {
  switch (value) {
    case 'available':
    case 'downloadable':
    case 'downloading':
    case 'unavailable':
      return value
    default:
      return 'unknown'
  }
}

const listenForDownloadProgress = (
  subscribe: CodegenTypes.EventEmitter<NanoDownloadProgressEvent>,
  onProgress: AdkPrepareOptions['onProgress']
) =>
  onProgress
    ? subscribe((event: NanoDownloadProgressEvent) => {
        onProgress({
          phase: event.phase as AdkDownloadProgress['phase'],
          bytesDownloaded: event.bytesDownloaded,
          bytesToDownload: event.bytesToDownload,
        })
      })
    : null

async function getModelInfo(
  nano: AdkNanoModelConfig | undefined
): Promise<AdkModelInfo> {
  if (Platform.OS !== 'android') {
    return { availability: 'unavailable' }
  }

  const info = await getNativeAdkEngine()
    .getModelInfo(nano)
    .catch((error: unknown) => {
      throw toAdkError(error)
    })
  return {
    availability: toModelAvailability(info.availability),
    baseModelName: info.baseModelName,
    contextSize: info.contextSize,
  }
}

export function createAdkProvider(
  defaults: AdkLanguageModelOptions = {}
): AdkProvider {
  const createLanguageModel = (options?: AdkLanguageModelOptions) =>
    new AdkChatLanguageModel({ ...defaults, ...options })

  const provider = function (options?: AdkLanguageModelOptions) {
    return createLanguageModel(options)
  }
  provider.specificationVersion = 'v4' as const
  provider.languageModel = createLanguageModel
  provider.isAvailable = async () => {
    const { availability } = await getModelInfo(defaults.nano)
    return availability === 'available' || availability === 'downloadable'
  }
  provider.getModelInfo = (options: { nano?: AdkNanoModelConfig } = {}) =>
    getModelInfo(options.nano ?? defaults.nano)
  provider.transcriptionModel = (options?: AdkTranscriptionOptions) =>
    new AdkSpeechTranscriptionModel(options)
  return provider
}

export const adk = createAdkProvider()

// Gemini thinking budgets for the AI SDK reasoning levels
const thinkingBudgets = {
  minimal: 512,
  low: 2048,
  medium: 8192,
  high: 24576,
  xhigh: 24576,
  max: 24576,
} as const

function prepareThinking(
  reasoning: LanguageModelV4CallOptions['reasoning'],
  adkOptions: AdkProviderOptions
): AdkGenerationOptions['thinking'] {
  switch (reasoning) {
    case undefined:
    case 'provider-default':
      return adkOptions.includeThoughts === undefined
        ? undefined
        : { includeThoughts: adkOptions.includeThoughts }
    case 'none':
      return { includeThoughts: false, budget: 0 }
    default:
      return {
        includeThoughts: adkOptions.includeThoughts ?? true,
        budget: thinkingBudgets[reasoning],
      }
  }
}

const mapUsage = (usage?: AdkUsageMetadata): LanguageModelV4Usage => {
  const promptTokens = usage?.promptTokenCount
  const cachedTokens = usage?.cachedContentTokenCount
  const textTokens = usage?.candidatesTokenCount
  const reasoningTokens = usage?.thoughtsTokenCount

  return {
    inputTokens: {
      total: promptTokens,
      noCache:
        promptTokens !== undefined && cachedTokens !== undefined
          ? promptTokens - cachedTokens
          : undefined,
      cacheRead: cachedTokens,
      cacheWrite: undefined,
    },
    outputTokens: {
      // Gemini counts thoughts separately from candidates
      total:
        textTokens === undefined && reasoningTokens === undefined
          ? undefined
          : (textTokens ?? 0) + (reasoningTokens ?? 0),
      text: textTokens,
      reasoning: reasoningTokens,
    },
    raw: usage ? { ...usage } : undefined,
  }
}

const contentFilterReasons = new Set([
  'SAFETY',
  'RECITATION',
  'BLOCKLIST',
  'PROHIBITED_CONTENT',
  'SPII',
  'IMAGE_SAFETY',
  'IMAGE_PROHIBITED_CONTENT',
  'IMAGE_RECITATION',
])

const convertFinishReason = (
  finishReason?: string
): LanguageModelV4FinishReason => {
  let unified: LanguageModelV4FinishReason['unified'] = 'other'

  if (finishReason === undefined || finishReason === 'STOP') {
    unified = 'stop'
  } else if (finishReason === 'MAX_TOKENS') {
    unified = 'length'
  } else if (contentFilterReasons.has(finishReason)) {
    unified = 'content-filter'
  }

  return {
    unified,
    raw: finishReason,
  }
}

const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (let index = 0; index < bytes.length; index++) {
    binary += String.fromCharCode(bytes[index])
  }
  return btoa(binary)
}

const localUrlProtocols = new Set(['file:', 'content:'])

const toFileMessagePart = (part: LanguageModelV4FilePart): AdkMessagePart => {
  // v4 allows top-level media types such as `image`, which Gemini rejects
  const mimeType = resolveFullMediaType({ part })

  switch (part.data.type) {
    case 'data':
      return {
        type: 'file',
        mimeType,
        data:
          typeof part.data.data === 'string'
            ? part.data.data.replace(/^data:[^;]+;base64,/, '')
            : uint8ArrayToBase64(part.data.data),
      }
    case 'url':
      // The AI SDK downloads other URLs because they are not in `supportedUrls`
      if (!localUrlProtocols.has(part.data.url.protocol)) {
        throw createAdkError(
          `ADK only reads file:// and content:// URLs. Got ${part.data.url.protocol}`,
          AdkErrorCodes.InvalidMessage
        )
      }
      return { type: 'file', mimeType, uri: part.data.url.toString() }
    case 'text':
      return { type: 'text', text: part.data.text }
    default:
      throw createAdkError(
        'ADK does not support provider file references.',
        AdkErrorCodes.InvalidMessage
      )
  }
}

const getAbortReason = (signal: AbortSignal) => {
  if (signal.reason !== undefined) {
    return signal.reason
  }
  const error = new Error('The operation was aborted.')
  error.name = 'AbortError'
  return error
}

class AdkChatLanguageModel implements AdkLanguageModel {
  readonly specificationVersion = 'v4'
  readonly supportedUrls = {
    'image/*': [/^file:\/\//, /^content:\/\//],
  }

  readonly provider = 'adk'
  readonly modelId = MODEL_ID

  private readonly agentConfig: AdkAgentConfig
  private preparePromise: Promise<void> | null = null

  constructor(options: AdkLanguageModelOptions) {
    this.agentConfig = {
      name: options.name ?? 'react_native_adk_agent',
      description: options.description ?? 'React Native ADK agent',
      instruction: options.instruction,
      nano: options.nano,
    }
  }

  async prepare(options: AdkPrepareOptions = {}): Promise<void> {
    const listener = listenForDownloadProgress(
      getNativeAdkEngine().onNanoDownloadProgress,
      options.onProgress
    )
    try {
      await this.ensurePrepared()
    } finally {
      listener?.remove()
    }
  }

  async countTokens(text: string): Promise<number> {
    try {
      return await getNativeAdkEngine().countTokens(text, this.agentConfig.nano)
    } catch (error) {
      throw toAdkError(error)
    }
  }

  private ensurePrepared(): Promise<void> {
    if (!this.preparePromise) {
      this.preparePromise = getNativeAdkEngine()
        .prepareNano(this.agentConfig.nano)
        .catch((error: unknown) => {
          this.preparePromise = null
          throw toAdkError(error)
        })
    }

    return this.preparePromise
  }

  private prepareMessages(
    messages: LanguageModelV4Prompt,
    warnings: SharedV4Warning[]
  ): AdkMessage[] {
    // System messages become part of the agent instruction instead
    return messages.flatMap((message): AdkMessage[] => {
      if (message.role === 'system') {
        return []
      }

      if (message.role === 'user') {
        const parts = message.content.map((part): AdkMessagePart => {
          if (part.type === 'text') {
            return { type: 'text', text: part.text }
          }
          return toFileMessagePart(part)
        })

        if (parts.length === 1 && parts[0]?.type === 'text') {
          return [{ role: 'user', content: parts[0].text }]
        }

        return [{ role: 'user', parts }]
      }

      if (message.role === 'assistant') {
        const content = message.content
          .flatMap((part) => {
            switch (part.type) {
              case 'text':
                return [part.text]
              case 'reasoning':
                return []
              default:
                warnings.push({
                  type: 'unsupported',
                  feature: `assistant ${part.type} parts`,
                  details: 'Gemini Nano only takes text history.',
                })
                return []
            }
          })
          .join('\n')

        return [{ role: 'assistant', content }]
      }

      warnings.push({
        type: 'unsupported',
        feature: 'tool messages',
        details: "ADK's ML Kit model has no tool calling for Gemini Nano.",
      })
      return []
    })
  }

  private prepareAgentConfig(
    options: LanguageModelV4CallOptions
  ): AdkAgentConfig {
    // ADK only takes a system prompt as the agent instruction
    const systemPrompts = options.prompt.flatMap((message) =>
      message.role === 'system' ? [message.content] : []
    )
    if (systemPrompts.length === 0) {
      return this.agentConfig
    }

    const instruction = [this.agentConfig.instruction, ...systemPrompts]
      .filter(Boolean)
      .join('\n\n')

    return { ...this.agentConfig, instruction }
  }

  private prepareGenerationOptions(
    options: LanguageModelV4CallOptions,
    warnings: SharedV4Warning[]
  ): AdkGenerationOptions {
    const adkOptions = (options.providerOptions?.adk ??
      {}) as AdkProviderOptions

    // ADK's ML Kit model only passes on temperature, topK, maxOutputTokens
    // and thinking, and has no tool calling or JSON mode
    const unsupported = {
      topP: options.topP,
      seed: options.seed,
      stopSequences: options.stopSequences,
      presencePenalty: options.presencePenalty,
      frequencyPenalty: options.frequencyPenalty,
      responseFormat:
        options.responseFormat?.type === 'json' ? 'json' : undefined,
      tools: options.tools?.length ? options.tools : undefined,
    }
    for (const [feature, value] of Object.entries(unsupported)) {
      if (value !== undefined) {
        warnings.push({
          type: 'unsupported',
          feature,
          details: 'Gemini Nano does not support this setting.',
        })
      }
    }

    return {
      temperature: options.temperature,
      maxTokens: options.maxOutputTokens,
      topK: options.topK,
      thinking: prepareThinking(options.reasoning, adkOptions),
    }
  }

  private prepareCall(options: LanguageModelV4CallOptions) {
    const warnings: SharedV4Warning[] = []
    const messages = this.prepareMessages(options.prompt, warnings)
    const generationOptions = this.prepareGenerationOptions(options, warnings)

    return {
      messages,
      generationOptions,
      agentConfig: this.prepareAgentConfig(options),
      warnings,
    }
  }

  async doGenerate(options: LanguageModelV4CallOptions) {
    const { messages, generationOptions, agentConfig, warnings } =
      this.prepareCall(options)
    const runId = generateId()
    const native = getNativeAdkEngine()
    const abortSignal = options.abortSignal

    if (abortSignal?.aborted) {
      throw getAbortReason(abortSignal)
    }

    const onAbort = () => {
      void native
        .cancelStream(runId)
        .catch((error) => console.warn('[adk] cancel failed:', error))
    }
    abortSignal?.addEventListener('abort', onAbort, { once: true })

    try {
      await this.ensurePrepared()

      const response = await native.generateText(
        runId,
        messages,
        agentConfig,
        generationOptions
      )

      const content: LanguageModelV4Content[] = []
      if (response.reasoning) {
        content.push({ type: 'reasoning', text: response.reasoning })
      }
      content.push({ type: 'text', text: response.content })

      return {
        content,
        finishReason: convertFinishReason(response.finishReason),
        usage: mapUsage(response.usage),
        warnings,
      }
    } catch (error) {
      if (abortSignal?.aborted) {
        throw getAbortReason(abortSignal)
      }
      throw toAdkError(error)
    } finally {
      abortSignal?.removeEventListener('abort', onAbort)
    }
  }

  async doStream(options: LanguageModelV4CallOptions) {
    const { messages, generationOptions, agentConfig, warnings } =
      this.prepareCall(options)
    const streamId = generateId()
    const native = getNativeAdkEngine()
    const abortSignal = options.abortSignal

    if (typeof ReadableStream === 'undefined') {
      throw new Error(
        'ReadableStream is not available in this environment. Please load a polyfill, such as web-streams-polyfill.'
      )
    }

    if (abortSignal?.aborted) {
      throw getAbortReason(abortSignal)
    }

    let listeners: { remove(): void }[] = []
    let cleanedUp = false

    let onAbort = () => {}

    const cleanup = () => {
      if (cleanedUp) {
        return
      }
      cleanedUp = true
      listeners.forEach((listener) => {
        listener.remove()
      })
      listeners = []
      abortSignal?.removeEventListener('abort', onAbort)
    }

    const cancelNative = () => {
      void native
        .cancelStream(streamId)
        .catch((error) => console.warn('[adk] cancelStream failed:', error))
    }

    const stream = new ReadableStream<LanguageModelV4StreamPart>({
      start: async (controller) => {
        const textId = `${streamId}-text`
        let textOpen = false
        let reasoningId: string | undefined
        let reasoningCount = 0

        const addListener = (listener: { remove(): void }) => {
          listeners.push(listener)
        }

        const closeReasoning = () => {
          if (reasoningId) {
            controller.enqueue({ type: 'reasoning-end', id: reasoningId })
            reasoningId = undefined
          }
        }

        const emitText = (delta: string) => {
          if (!delta) {
            return
          }
          closeReasoning()
          if (!textOpen) {
            controller.enqueue({ type: 'text-start', id: textId })
            textOpen = true
          }
          controller.enqueue({ type: 'text-delta', id: textId, delta })
        }

        controller.enqueue({ type: 'stream-start', warnings })

        onAbort = () => {
          cleanup()
          cancelNative()
          controller.error(abortSignal && getAbortReason(abortSignal))
        }
        abortSignal?.addEventListener('abort', onAbort, { once: true })

        addListener(
          native.onStreamUpdate((data) => {
            if (data.streamId !== streamId || !data.delta) {
              return
            }

            if (data.kind === 'reasoning') {
              if (!reasoningId) {
                reasoningId = `${streamId}-reasoning-${reasoningCount++}`
                controller.enqueue({ type: 'reasoning-start', id: reasoningId })
              }
              controller.enqueue({
                type: 'reasoning-delta',
                id: reasoningId,
                delta: data.delta,
              })
              return
            }

            emitText(data.delta)
          })
        )

        addListener(
          native.onStreamComplete((data) => {
            if (data.streamId !== streamId) {
              return
            }
            closeReasoning()
            if (textOpen) {
              controller.enqueue({ type: 'text-end', id: textId })
            }
            controller.enqueue({
              type: 'finish',
              finishReason: convertFinishReason(data.finishReason),
              usage: mapUsage(data.usage),
            })
            cleanup()
            controller.close()
          })
        )

        addListener(
          native.onStreamError((data) => {
            if (data.streamId === streamId) {
              controller.enqueue({
                type: 'error',
                error: toAdkError(data.error, data.code),
              })
              cleanup()
              controller.close()
            }
          })
        )

        try {
          await this.ensurePrepared()

          await native.streamText(
            streamId,
            messages,
            agentConfig,
            generationOptions
          )
        } catch (error) {
          cleanup()
          controller.error(toAdkError(error))
        }
      },
      cancel: () => {
        cleanup()
        cancelNative()
      },
    })

    return {
      stream,
      rawCall: {
        rawPrompt: options.prompt,
        rawSettings: {},
      },
    }
  }
}

class AdkSpeechTranscriptionModel implements AdkTranscriptionModel {
  readonly specificationVersion = 'v4'
  readonly provider = 'adk'
  readonly modelId = 'genai-speech-recognition'

  private readonly config: AdkTranscriptionConfig

  constructor(options: AdkTranscriptionOptions = {}) {
    this.config = options
  }

  async getAvailability(): Promise<AdkModelAvailability> {
    if (Platform.OS !== 'android') {
      return 'unavailable'
    }
    const availability = await getNativeAdkEngine()
      .getTranscriptionAvailability(this.config)
      .catch((error: unknown) => {
        throw toAdkError(error)
      })
    return toModelAvailability(availability)
  }

  async isAvailable(): Promise<boolean> {
    const availability = await this.getAvailability()
    return availability === 'available' || availability === 'downloadable'
  }

  async prepare(options: AdkPrepareOptions = {}): Promise<void> {
    const native = getNativeAdkEngine()
    const listener = listenForDownloadProgress(
      native.onTranscriptionDownloadProgress,
      options.onProgress
    )
    try {
      await native.prepareTranscription(this.config)
    } catch (error) {
      throw toAdkError(error)
    } finally {
      listener?.remove()
    }
  }

  async doGenerate(
    options: TranscriptionModelV4CallOptions
  ): Promise<TranscriptionModelV4Result> {
    const native = getNativeAdkEngine()
    const requestId = generateId()
    const abortSignal = options.abortSignal

    if (abortSignal?.aborted) {
      throw getAbortReason(abortSignal)
    }

    const onAbort = () => {
      void native
        .cancelStream(requestId)
        .catch((error) => console.warn('[adk] cancel failed:', error))
    }
    abortSignal?.addEventListener('abort', onAbort, { once: true })

    const audio =
      typeof options.audio === 'string'
        ? options.audio.replace(/^data:[^;]+;base64,/, '')
        : uint8ArrayToBase64(options.audio)

    try {
      const result = await native.transcribe(requestId, audio, this.config)
      return {
        text: result.text,
        // ML Kit speech recognition does not report timestamps
        segments: [],
        language: this.config.language,
        durationInSeconds: result.durationInSeconds,
        warnings: [],
        response: {
          timestamp: new Date(),
          modelId: this.modelId,
        },
      }
    } catch (error) {
      if (abortSignal?.aborted) {
        throw getAbortReason(abortSignal)
      }
      throw toAdkError(error)
    } finally {
      abortSignal?.removeEventListener('abort', onAbort)
    }
  }
}
