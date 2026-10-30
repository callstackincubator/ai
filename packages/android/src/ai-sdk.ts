import type {
  EmbeddingModelV4,
  EmbeddingModelV4CallOptions,
  EmbeddingModelV4Result,
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4FilePart,
  LanguageModelV4FinishReason,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  LanguageModelV4ToolResultOutput,
  LanguageModelV4Usage,
  SharedV4Warning,
  TranscriptionModelV4,
  TranscriptionModelV4CallOptions,
} from '@ai-sdk/provider'
import { generateId } from '@ai-sdk/provider-utils'
import { Platform } from 'react-native'

import {
  AndroidAIErrorCodes,
  createAndroidAIError,
  toAndroidAIError,
} from './errors'
import {
  type DownloadProgressEvent,
  getNativeAndroidAI,
  type NanoModelConfig,
  type NativeFunctionCall,
  type NativeFunctionDeclaration,
  type NativeGenerateRequest,
  type NativeMessage,
  type NativeMessagePart,
  type NativeModelInfo,
  type NativeTranscriptionOptions,
} from './NativeAndroidAI'

const MODEL_ID = 'gemini-nano'

export interface AndroidNanoModel {
  /** `stable` (default) or `preview`, which needs the AICore developer preview */
  releaseStage?: 'stable' | 'preview'
  /**
   * `full` (default) favors quality, `fast` favors latency. Function calling
   * needs Gemini Nano 4, so `releaseStage: 'preview'` with `fast`
   */
  preference?: 'full' | 'fast'
}

export interface AndroidLanguageModelOptions {
  /** Gemini Nano model selection, see ML Kit `ModelConfig` */
  model?: AndroidNanoModel
}

/** Per-call options passed as `providerOptions.android` */
export interface AndroidProviderOptions {
  /**
   * Turns Gemini Nano's thinking mode on or off when `reasoning` is not a
   * level, that is when it is unset or `provider-default`
   */
  enableThinking?: boolean
}

export type AndroidModelAvailability =
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'unavailable'
  | 'unknown'

export type AndroidModelFeature =
  | 'systemPrompt'
  | 'thinking'
  | 'prefixCaching'
  | 'structuredOutput'
  | 'functionCalling'

export interface AndroidModelInfo {
  availability: AndroidModelAvailability
  /** Name of the Gemini Nano base model, when ML Kit reports it */
  baseModelName?: string
  /** Gemini Nano input token limit, when ML Kit reports it */
  contextSize?: number
  /** Features this device's Gemini Nano supports, when it is available */
  features?: AndroidModelFeature[]
}

export interface AndroidDownloadProgress {
  phase: 'started' | 'progress' | 'completed'
  bytesDownloaded?: number
  bytesToDownload?: number
}

export interface AndroidPrepareOptions {
  onProgress?: (progress: AndroidDownloadProgress) => void
}

export interface AndroidLanguageModel extends LanguageModelV4 {
  /** Quick synchronous check, see `AndroidProvider.isAvailable` */
  isAvailable: () => boolean
  /** Gemini Nano's availability and features for this model selection */
  getModelInfo: () => Promise<AndroidModelInfo>
  /** Downloads Gemini Nano when needed and loads it, reporting download progress */
  prepare: (options?: AndroidPrepareOptions) => Promise<void>
  /** Counts tokens with the Gemini Nano tokenizer */
  countTokens: (text: string) => Promise<number>
}

export interface AndroidTranscriptionOptions {
  /** BCP 47 locale, such as en-US. Defaults to the device locale */
  language?: string
  /**
   * `basic` uses the traditional on-device recognizer, `advanced` Gemini Nano.
   * ML Kit picks one when it is not set
   */
  mode?: 'basic' | 'advanced'
}

export type AndroidEmbeddingTaskType =
  | 'retrievalQuery'
  | 'retrievalDocument'
  | 'semanticSimilarity'
  | 'classification'
  | 'clustering'
  | 'questionAnswering'
  | 'factVerification'
  | 'codeRetrieval'

export interface AndroidEmbeddingOptions {
  /** What the embeddings are for, see ML Kit `TaskConfig` */
  taskType?: AndroidEmbeddingTaskType
}

export interface AndroidEmbeddingModelInfo {
  availability: AndroidModelAvailability
  dimension?: number
  modelSignature?: string
}

const toModelAvailability = (value: string): AndroidModelAvailability => {
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

const modelFeatures: readonly string[] = [
  'systemPrompt',
  'thinking',
  'prefixCaching',
  'structuredOutput',
  'functionCalling',
] satisfies AndroidModelFeature[]

const isModelFeature = (value: string): value is AndroidModelFeature =>
  modelFeatures.includes(value)

const toModelInfo = (info: NativeModelInfo): AndroidModelInfo => ({
  availability: toModelAvailability(info.availability),
  baseModelName: info.baseModelName,
  contextSize: info.contextSize,
  features: info.features?.filter(isModelFeature),
})

const listenForDownloadProgress = (
  model: DownloadProgressEvent['model'],
  onProgress: AndroidPrepareOptions['onProgress']
) =>
  onProgress
    ? getNativeAndroidAI().onDownloadProgress((event) => {
        if (event.model !== model) {
          return
        }
        onProgress({
          phase: event.phase as AndroidDownloadProgress['phase'],
          bytesDownloaded: event.bytesDownloaded,
          bytesToDownload: event.bytesToDownload,
        })
      })
    : null

async function withProgress<T>(
  model: DownloadProgressEvent['model'],
  options: AndroidPrepareOptions,
  run: () => Promise<T>
): Promise<T> {
  const listener = listenForDownloadProgress(model, options.onProgress)
  try {
    return await run()
  } catch (error) {
    throw toAndroidAIError(error)
  } finally {
    listener?.remove()
  }
}

function isAvailable(model: NanoModelConfig | undefined) {
  return Platform.OS === 'android' && getNativeAndroidAI().isAvailable(model)
}

async function getModelInfo(
  model: NanoModelConfig | undefined
): Promise<AndroidModelInfo> {
  if (Platform.OS !== 'android') {
    return { availability: 'unavailable' }
  }

  try {
    return toModelInfo(await getNativeAndroidAI().getModelInfo(model))
  } catch (error) {
    throw toAndroidAIError(error)
  }
}

export function createAndroidProvider(
  defaults: AndroidLanguageModelOptions = {}
) {
  const createLanguageModel = (
    options: AndroidLanguageModelOptions = {}
  ): AndroidLanguageModel =>
    new AndroidChatLanguageModel({ ...defaults, ...options })

  const provider = function (options?: AndroidLanguageModelOptions) {
    return createLanguageModel(options)
  }
  provider.specificationVersion = 'v4' as const
  provider.languageModel = createLanguageModel
  /**
   * Quick synchronous check whether Gemini Nano can be used. It reflects the
   * last status `getModelInfo()` or `prepare()` saw, or else whether AICore is
   * installed. Use `getModelInfo()` for the exact availability
   */
  provider.isAvailable = () => isAvailable(defaults.model)
  /** Gemini Nano's availability, for the provider's model selection or `model` */
  provider.getModelInfo = (options: { model?: AndroidNanoModel } = {}) =>
    getModelInfo(options.model ?? defaults.model)
  provider.transcriptionModel = (options: AndroidTranscriptionOptions = {}) =>
    new AndroidTranscriptionModel(options)
  provider.embeddingModel = (options: AndroidEmbeddingOptions = {}) =>
    new AndroidEmbeddingModel(options)
  return provider
}

export type AndroidProvider = ReturnType<typeof createAndroidProvider>

export const android = createAndroidProvider()

const emptyUsage = (): LanguageModelV4Usage => ({
  // ML Kit reports no token usage for a request
  inputTokens: {
    total: undefined,
    noCache: undefined,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: undefined, text: undefined, reasoning: undefined },
})

const convertFinishReason = (
  finishReason: string | undefined,
  hasToolCalls: boolean
): LanguageModelV4FinishReason => {
  if (hasToolCalls) {
    return { unified: 'tool-calls', raw: finishReason }
  }
  switch (finishReason) {
    case undefined:
    case 'STOP':
      return { unified: 'stop', raw: finishReason }
    case 'MAX_TOKENS':
      return { unified: 'length', raw: finishReason }
    default:
      return { unified: 'other', raw: finishReason }
  }
}

const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
  // One String.fromCharCode per byte stalls the JS thread on large images and audio
  const chunkSize = 0x8000
  let binary = ''
  for (let start = 0; start < bytes.length; start += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(start, start + chunkSize))
  }
  return btoa(binary)
}

const localUrlProtocols = new Set(['file:', 'content:'])

const toImagePart = (part: LanguageModelV4FilePart): NativeMessagePart => {
  if (!part.mediaType.startsWith('image')) {
    throw createAndroidAIError(
      `Gemini Nano only takes image files. Got ${part.mediaType}`,
      AndroidAIErrorCodes.InvalidMessage
    )
  }

  switch (part.data.type) {
    case 'data':
      return {
        type: 'image',
        data:
          typeof part.data.data === 'string'
            ? part.data.data.replace(/^data:[^;]+;base64,/, '')
            : uint8ArrayToBase64(part.data.data),
      }
    case 'url':
      // The AI SDK downloads other URLs because they are not in `supportedUrls`
      if (!localUrlProtocols.has(part.data.url.protocol)) {
        throw createAndroidAIError(
          `Gemini Nano only reads file:// and content:// URLs. Got ${part.data.url.protocol}`,
          AndroidAIErrorCodes.InvalidMessage
        )
      }
      return { type: 'image', uri: part.data.url.toString() }
    default:
      throw createAndroidAIError(
        'Gemini Nano does not take text files or provider file references.',
        AndroidAIErrorCodes.InvalidMessage
      )
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// ML Kit takes a function response as a JSON object
const toFunctionResponse = (
  output: LanguageModelV4ToolResultOutput
): Record<string, unknown> => {
  switch (output.type) {
    case 'json':
      return isPlainObject(output.value)
        ? output.value
        : { result: output.value }
    case 'error-text':
    case 'error-json':
      return { error: output.value }
    case 'execution-denied':
      return { error: output.reason ?? 'Execution denied' }
    default:
      return { result: output.value }
  }
}

function prepareMessages(
  prompt: LanguageModelV4Prompt,
  warnings: SharedV4Warning[]
) {
  const systemPrompts: string[] = []
  const messages: NativeMessage[] = []

  // ML Kit takes turns that alternate between the user and the model, so tool
  // results join the user turn around them
  const addParts = (role: 'user' | 'model', parts: NativeMessagePart[]) => {
    if (parts.length === 0) {
      return
    }
    const last = messages.at(-1)
    if (last?.role === role) {
      last.parts.push(...parts)
    } else {
      messages.push({ role, parts })
    }
  }

  for (const message of prompt) {
    switch (message.role) {
      case 'system':
        systemPrompts.push(message.content)
        break
      case 'user':
        addParts(
          'user',
          message.content.map((part) =>
            part.type === 'text'
              ? { type: 'text', text: part.text }
              : toImagePart(part)
          )
        )
        break
      case 'assistant':
        addParts(
          'model',
          message.content.flatMap((part): NativeMessagePart[] => {
            switch (part.type) {
              case 'text':
                return part.text ? [{ type: 'text', text: part.text }] : []
              case 'reasoning':
                return []
              case 'tool-call':
                return [
                  {
                    type: 'functionCall',
                    id: part.toolCallId,
                    name: part.toolName,
                    json:
                      typeof part.input === 'string'
                        ? part.input
                        : JSON.stringify(part.input ?? {}),
                  },
                ]
              default:
                warnings.push({
                  type: 'unsupported',
                  feature: `assistant ${part.type} parts`,
                  details: 'Gemini Nano takes text and function call history.',
                })
                return []
            }
          })
        )
        break
      case 'tool':
        addParts(
          'user',
          message.content.flatMap((part): NativeMessagePart[] =>
            part.type === 'tool-result'
              ? [
                  {
                    type: 'functionResponse',
                    id: part.toolCallId,
                    name: part.toolName,
                    json: JSON.stringify(toFunctionResponse(part.output)),
                  },
                ]
              : []
          )
        )
        break
    }
  }

  return {
    messages,
    systemInstruction:
      systemPrompts.length > 0 ? systemPrompts.join('\n\n') : undefined,
  }
}

function prepareTools(
  options: LanguageModelV4CallOptions,
  features: AndroidModelFeature[],
  warnings: SharedV4Warning[]
): NativeFunctionDeclaration[] | undefined {
  if (!options.tools?.length || options.toolChoice?.type === 'none') {
    return undefined
  }

  // Without it, ML Kit fails the whole request
  if (!features.includes('functionCalling')) {
    warnings.push({
      type: 'unsupported',
      feature: 'tools',
      details:
        "This device's Gemini Nano has no function calling. It needs Gemini Nano 4, the preview release with the fast preference.",
    })
    return undefined
  }

  if (
    options.toolChoice?.type === 'required' ||
    options.toolChoice?.type === 'tool'
  ) {
    warnings.push({
      type: 'unsupported',
      feature: 'toolChoice',
      details: 'Gemini Nano decides itself whether to call a function.',
    })
  }

  return options.tools.flatMap((tool) => {
    if (tool.type !== 'function') {
      warnings.push({
        type: 'unsupported',
        feature: `provider tool ${tool.name}`,
        details: 'Gemini Nano only takes function tools.',
      })
      return []
    }
    return [
      {
        name: tool.name,
        description: tool.description ?? '',
        parameters: JSON.stringify(tool.inputSchema),
      },
    ]
  })
}

function prepareThinking(
  options: LanguageModelV4CallOptions,
  androidOptions: AndroidProviderOptions,
  features: AndroidModelFeature[],
  warnings: SharedV4Warning[]
) {
  let enableThinking: boolean | undefined
  switch (options.reasoning) {
    case undefined:
    case 'provider-default':
      enableThinking = androidOptions.enableThinking
      break
    case 'none':
      enableThinking = false
      break
    default:
      // Gemini Nano's thinking mode is on or off
      enableThinking = true
  }

  if (enableThinking && !features.includes('thinking')) {
    warnings.push({
      type: 'unsupported',
      feature: 'reasoning',
      details: "This device's Gemini Nano has no thinking mode.",
    })
    return undefined
  }
  return enableThinking
}

function prepareRequest(
  options: LanguageModelV4CallOptions,
  model: NanoModelConfig | undefined,
  features: AndroidModelFeature[]
) {
  const warnings: SharedV4Warning[] = []
  const androidOptions = (options.providerOptions?.android ??
    {}) as AndroidProviderOptions

  // ML Kit's GenerateContentRequest has no setting for these, and structured
  // output only takes Kotlin classes generated at build time
  const unsupported = {
    topP: options.topP,
    stopSequences: options.stopSequences,
    presencePenalty: options.presencePenalty,
    frequencyPenalty: options.frequencyPenalty,
    responseFormat:
      options.responseFormat?.type === 'json' ? 'json' : undefined,
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

  const { messages, systemInstruction } = prepareMessages(
    options.prompt,
    warnings
  )
  // Without system prompt support the native side merges the conversation
  // into one text part, which leaves function parts out
  if (
    !features.includes('systemPrompt') &&
    messages.some((message) =>
      message.parts.some(
        (part) =>
          part.type === 'functionCall' || part.type === 'functionResponse'
      )
    )
  ) {
    warnings.push({
      type: 'unsupported',
      feature: 'tool call history',
      details:
        'This Gemini Nano model gets the conversation as one text prompt, so earlier tool calls and results are left out.',
    })
  }

  const request: NativeGenerateRequest = {
    messages,
    systemInstruction,
    tools: prepareTools(options, features, warnings),
    temperature: options.temperature,
    topK: options.topK,
    seed: options.seed,
    maxOutputTokens: options.maxOutputTokens,
    enableThinking: prepareThinking(
      options,
      androidOptions,
      features,
      warnings
    ),
    model,
  }

  return { request, warnings }
}

const toToolCall = (call: NativeFunctionCall) => ({
  type: 'tool-call' as const,
  toolCallId: call.id || generateId(),
  toolName: call.name,
  input: call.arguments,
})

const getAbortReason = (signal: AbortSignal) => {
  if (signal.reason !== undefined) {
    return signal.reason
  }
  const error = new Error('The operation was aborted.')
  error.name = 'AbortError'
  return error
}

class AndroidChatLanguageModel implements AndroidLanguageModel {
  readonly specificationVersion = 'v4'
  // expo-file-system and Android's Uri.fromFile write file:/path, with one slash
  readonly supportedUrls = {
    'image/*': [/^file:/, /^content:/],
  }

  readonly provider = 'android'
  readonly modelId = MODEL_ID

  private readonly model: NanoModelConfig | undefined
  // Resolves to the prepared model's features
  private preparePromise: Promise<AndroidModelFeature[]> | null = null

  constructor(options: AndroidLanguageModelOptions) {
    this.model = options.model
  }

  isAvailable(): boolean {
    return isAvailable(this.model)
  }

  getModelInfo(): Promise<AndroidModelInfo> {
    return getModelInfo(this.model)
  }

  prepare(options: AndroidPrepareOptions = {}): Promise<void> {
    return withProgress('language', options, async () => {
      await this.ensurePrepared()
    })
  }

  async countTokens(text: string): Promise<number> {
    await this.ensurePrepared()
    try {
      return await getNativeAndroidAI().countTokens(text, this.model)
    } catch (error) {
      throw toAndroidAIError(error)
    }
  }

  private ensurePrepared(): Promise<AndroidModelFeature[]> {
    if (!this.preparePromise) {
      const native = getNativeAndroidAI()
      this.preparePromise = native
        .prepare(this.model)
        .then(() => native.getModelInfo(this.model))
        .then((info) => toModelInfo(info).features ?? [])
        .catch((error: unknown) => {
          this.preparePromise = null
          throw toAndroidAIError(error)
        })
    }
    return this.preparePromise
  }

  async doGenerate(options: LanguageModelV4CallOptions) {
    const native = getNativeAndroidAI()
    const runId = generateId()
    const abortSignal = options.abortSignal

    if (abortSignal?.aborted) {
      throw getAbortReason(abortSignal)
    }

    const onAbort = () => native.cancel(runId)
    abortSignal?.addEventListener('abort', onAbort, { once: true })

    try {
      const features = await this.ensurePrepared()
      // Preparing can take minutes, before there is a native run to cancel
      if (abortSignal?.aborted) {
        throw getAbortReason(abortSignal)
      }
      const { request, warnings } = prepareRequest(
        options,
        this.model,
        features
      )
      const response = await native.generateText(runId, request)

      const content: LanguageModelV4Content[] = []
      if (response.reasoning) {
        content.push({ type: 'reasoning', text: response.reasoning })
      }
      if (response.text) {
        content.push({ type: 'text', text: response.text })
      }
      content.push(...response.functionCalls.map(toToolCall))

      return {
        content,
        finishReason: convertFinishReason(
          response.finishReason,
          response.functionCalls.length > 0
        ),
        usage: emptyUsage(),
        warnings,
        request: { body: request },
      }
    } catch (error) {
      if (abortSignal?.aborted) {
        throw getAbortReason(abortSignal)
      }
      throw toAndroidAIError(error)
    } finally {
      abortSignal?.removeEventListener('abort', onAbort)
    }
  }

  async doStream(options: LanguageModelV4CallOptions) {
    const native = getNativeAndroidAI()
    const streamId = generateId()
    const abortSignal = options.abortSignal

    if (typeof ReadableStream === 'undefined') {
      throw new Error(
        'ReadableStream is not available in this environment. Please load a polyfill, such as web-streams-polyfill.'
      )
    }

    if (abortSignal?.aborted) {
      throw getAbortReason(abortSignal)
    }

    const features = await this.ensurePrepared()
    // Preparing can take minutes, before there is a native stream to cancel
    if (abortSignal?.aborted) {
      throw getAbortReason(abortSignal)
    }
    const { request, warnings } = prepareRequest(options, this.model, features)

    let listener: { remove(): void } | undefined
    let onAbort = () => {}

    const cleanup = () => {
      listener?.remove()
      listener = undefined
      abortSignal?.removeEventListener('abort', onAbort)
    }

    const stream = new ReadableStream<LanguageModelV4StreamPart>({
      start: async (controller) => {
        const textId = `${streamId}-text`
        let textOpen = false
        let reasoningId: string | undefined
        let reasoningCount = 0
        let hasToolCalls = false

        const closeReasoning = () => {
          if (reasoningId) {
            controller.enqueue({ type: 'reasoning-end', id: reasoningId })
            reasoningId = undefined
          }
        }

        controller.enqueue({ type: 'stream-start', warnings })

        onAbort = () => {
          cleanup()
          native.cancel(streamId)
          controller.error(abortSignal && getAbortReason(abortSignal))
        }
        abortSignal?.addEventListener('abort', onAbort, { once: true })

        listener = native.onStreamEvent((event) => {
          if (event.streamId !== streamId) {
            return
          }

          switch (event.type) {
            case 'reasoning':
              if (!event.delta) return
              if (!reasoningId) {
                reasoningId = `${streamId}-reasoning-${reasoningCount++}`
                controller.enqueue({ type: 'reasoning-start', id: reasoningId })
              }
              controller.enqueue({
                type: 'reasoning-delta',
                id: reasoningId,
                delta: event.delta,
              })
              return
            case 'text':
              if (!event.delta) return
              closeReasoning()
              if (!textOpen) {
                controller.enqueue({ type: 'text-start', id: textId })
                textOpen = true
              }
              controller.enqueue({
                type: 'text-delta',
                id: textId,
                delta: event.delta,
              })
              return
            case 'functionCall':
              if (!event.functionCall) return
              closeReasoning()
              hasToolCalls = true
              controller.enqueue(toToolCall(event.functionCall))
              return
            case 'finish':
              closeReasoning()
              if (textOpen) {
                controller.enqueue({ type: 'text-end', id: textId })
              }
              controller.enqueue({
                type: 'finish',
                finishReason: convertFinishReason(
                  event.finishReason,
                  hasToolCalls
                ),
                usage: emptyUsage(),
              })
              cleanup()
              controller.close()
              return
            case 'error':
              controller.enqueue({
                type: 'error',
                error: toAndroidAIError(event.error, event.code),
              })
              cleanup()
              controller.close()
              return
          }
        })

        try {
          await native.streamText(streamId, request)
        } catch (error) {
          cleanup()
          controller.error(toAndroidAIError(error))
        }
      },
      cancel: () => {
        cleanup()
        native.cancel(streamId)
      },
    })

    return { stream, request: { body: request } }
  }
}

const toAudioBase64 = (audio: TranscriptionModelV4CallOptions['audio']) =>
  typeof audio === 'string' ? audio : uint8ArrayToBase64(audio)

class AndroidTranscriptionModel implements TranscriptionModelV4 {
  readonly specificationVersion = 'v4'
  readonly provider = 'android'
  readonly modelId = 'speech-recognition'

  private readonly options: NativeTranscriptionOptions

  constructor(options: AndroidTranscriptionOptions) {
    this.options = { locale: options.language, mode: options.mode }
  }

  /** Recognizer availability for the model's language and mode */
  async getModelInfo(): Promise<AndroidModelInfo> {
    try {
      return toModelInfo(
        await getNativeAndroidAI().getTranscriptionModelInfo(this.options)
      )
    } catch (error) {
      throw toAndroidAIError(error)
    }
  }

  /** Whether the recognizer for this language and mode is available, downloadable or downloading */
  async isAvailable(): Promise<boolean> {
    try {
      const { availability } = await this.getModelInfo()
      return (
        availability === 'available' ||
        availability === 'downloadable' ||
        availability === 'downloading'
      )
    } catch {
      return false
    }
  }

  /** Downloads the recognizer's model when needed, reporting download progress */
  prepare(options: AndroidPrepareOptions = {}): Promise<void> {
    return withProgress('transcription', options, () =>
      getNativeAndroidAI().prepareTranscription(this.options)
    )
  }

  async doGenerate(options: TranscriptionModelV4CallOptions) {
    const native = getNativeAndroidAI()
    const runId = generateId()
    const abortSignal = options.abortSignal

    if (abortSignal?.aborted) {
      throw getAbortReason(abortSignal)
    }

    const onAbort = () => native.cancel(runId)
    abortSignal?.addEventListener('abort', onAbort, { once: true })

    try {
      const text = await native.transcribe(
        runId,
        toAudioBase64(options.audio),
        this.options
      )

      return {
        text,
        // Word timings only come with streamed audio, not a whole file
        segments: [],
        language: this.options.locale?.split(/[-_]/)[0],
        durationInSeconds: undefined,
        warnings: [],
        response: { timestamp: new Date(), modelId: this.modelId },
      }
    } catch (error) {
      if (abortSignal?.aborted) {
        throw getAbortReason(abortSignal)
      }
      throw toAndroidAIError(error)
    } finally {
      abortSignal?.removeEventListener('abort', onAbort)
    }
  }
}

class AndroidEmbeddingModel implements EmbeddingModelV4 {
  readonly specificationVersion = 'v4'
  readonly provider = 'android'
  readonly modelId = 'embedding'
  readonly maxEmbeddingsPerCall = Infinity
  readonly supportsParallelCalls = false

  private readonly taskType: AndroidEmbeddingTaskType | undefined

  constructor(options: AndroidEmbeddingOptions) {
    this.taskType = options.taskType
  }

  /** Embedding model availability, dimension and signature */
  async getModelInfo(): Promise<AndroidEmbeddingModelInfo> {
    try {
      const info = await getNativeAndroidAI().getEmbeddingModelInfo()
      return { ...info, availability: toModelAvailability(info.availability) }
    } catch (error) {
      throw toAndroidAIError(error)
    }
  }

  /** Downloads the embedding model when needed, reporting download progress */
  prepare(options: AndroidPrepareOptions = {}): Promise<void> {
    return withProgress('embedding', options, () =>
      getNativeAndroidAI().prepareEmbedding()
    )
  }

  async doEmbed(
    options: EmbeddingModelV4CallOptions
  ): Promise<EmbeddingModelV4Result> {
    const abortSignal = options.abortSignal
    // ML Kit cannot stop an embedding once it starts, so abort is checked around the call
    if (abortSignal?.aborted) {
      throw getAbortReason(abortSignal)
    }
    let embeddings: number[][]
    try {
      embeddings = await getNativeAndroidAI().embed(
        options.values,
        this.taskType
      )
    } catch (error) {
      throw toAndroidAIError(error)
    }
    if (abortSignal?.aborted) {
      throw getAbortReason(abortSignal)
    }
    return { embeddings, warnings: [] }
  }
}
