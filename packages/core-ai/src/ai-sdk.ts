import type {
  EmbeddingModelV4,
  EmbeddingModelV4CallOptions,
  EmbeddingModelV4Result,
  ImageModelV4,
  ImageModelV4CallOptions,
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4FinishReason,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
  SharedV4Warning,
  TranscriptionModelV4,
  TranscriptionModelV4CallOptions,
} from '@ai-sdk/provider'
import { generateId } from '@ai-sdk/provider-utils'
import {
  type AppleStreamEntry,
  createSnapshotStreamHandler,
  prepareAppleMessages,
  toAppleReasoningLevel,
} from '@react-native-ai/apple'
import type { CodegenTypes } from 'react-native'

import NativeCoreAI from './NativeCoreAI'
import type {
  CoreAIEmbeddingResult,
  CoreAIGenerationOptions,
  CoreAIGenerationPart,
  CoreAIGenerationResult,
  CoreAIImageGenerationOptions,
  CoreAIImageGenerationResult,
  CoreAILoadedModel,
  CoreAIMessage,
  CoreAIModelConfig,
  CoreAIModelInfo,
  CoreAIProviderOptions,
  CoreAIReasoningLevel,
  CoreAIStreamCompleteEvent,
  CoreAIStreamErrorEvent,
  CoreAIStreamUpdateEvent,
  CoreAITranscriptionResult,
  CoreAIUsage,
} from './types'
import { toNativeModelConfig } from './types'

export function createCoreAIProvider() {
  const provider = function (config: CoreAIModelConfig) {
    return provider.languageModel(config)
  }

  provider.specificationVersion = 'v4' as const
  provider.getCapabilities = () => NativeCoreAI.getCapabilities()
  provider.languageModel = (config: CoreAIModelConfig) => {
    return new CoreAILanguageModel(config)
  }
  provider.embeddingModel = (config: CoreAIModelConfig) => {
    return new CoreAITextEmbeddingModel(config)
  }
  provider.imageModel = (config: CoreAIModelConfig) => {
    return new CoreAIImageGenerationModel(config)
  }
  provider.transcriptionModel = (config: CoreAIModelConfig) => {
    return new CoreAITranscriptionModel(config)
  }

  return provider
}

export const coreAI = createCoreAIProvider()

export interface CoreAILanguageSession {
  sessionHandle: string
  respond(
    prompt: string,
    options?: CoreAIGenerationOptions
  ): Promise<CoreAIGenerationPart[]>
  stream(
    prompt: string,
    options?: CoreAIGenerationOptions
  ): Promise<ReadableStream<CoreAIStreamUpdateEvent>>
  close(): Promise<void>
}

export class CoreAILanguageModel implements LanguageModelV4 {
  readonly specificationVersion = 'v4'
  readonly supportedUrls = {}
  readonly provider = 'core-ai'
  readonly modelId: string
  readonly config: CoreAIModelConfig

  private loadedModel?: CoreAILoadedModel
  private loading?: Promise<CoreAILoadedModel>

  constructor(config: CoreAIModelConfig) {
    this.config = { ...config, task: 'language' }
    this.modelId = config.id
  }

  get modelHandle() {
    return this.loadedModel?.modelHandle
  }

  async inspect(): Promise<CoreAIModelInfo> {
    return NativeCoreAI.inspectModel(
      toNativeModelConfig(this.config)
    ) as Promise<CoreAIModelInfo>
  }

  /**
   * Loads the model once. Later calls, including generateText and streamText,
   * reuse it until unload()
   */
  async prepare(
    options: CodegenTypes.UnsafeObject = {}
  ): Promise<CoreAIModelInfo> {
    return (await this.load(options)).info
  }

  async specialize(
    options: CodegenTypes.UnsafeObject = {}
  ): Promise<CoreAIModelInfo> {
    return NativeCoreAI.specializeModel(
      toNativeModelConfig(this.config),
      options
    ) as Promise<CoreAIModelInfo>
  }

  /**
   * Releases the native model and the sessions created from it
   */
  async unload(): Promise<void> {
    const loading = this.loading
    if (!loading) {
      return
    }
    this.loading = undefined
    this.loadedModel = undefined
    await NativeCoreAI.unloadModel((await loading).modelHandle)
  }

  async remove(): Promise<void> {
    await NativeCoreAI.removeModel(toNativeModelConfig(this.config))
    this.loading = undefined
    this.loadedModel = undefined
  }

  async createSession(
    options: CodegenTypes.UnsafeObject = {}
  ): Promise<CoreAILanguageSession> {
    const model = await this.load()
    const sessionHandle = await NativeCoreAI.createLanguageSession(
      model.modelHandle,
      options
    )
    return createLanguageSession(sessionHandle)
  }

  async doGenerate(options: LanguageModelV4CallOptions) {
    const { modelHandle } = await this.load()
    const { messages, warnings } = prepareCall(options)
    const { abortSignal } = options
    if (abortSignal?.aborted) {
      throw toAbortError(abortSignal)
    }

    const requestId = generateId()
    const cancel = () => NativeCoreAI.cancelStream(requestId)
    abortSignal?.addEventListener('abort', cancel, { once: true })

    try {
      const response = (await NativeCoreAI.generateText(
        requestId,
        modelHandle,
        messages,
        toCoreAIGenerationOptions(options)
      )) as CoreAIGenerationResult

      return {
        content: response.content.flatMap(toLanguageModelContent),
        finishReason: toFinishReason(response.usage, options.maxOutputTokens),
        usage: toUsage(response.usage),
        warnings,
      }
    } catch (error) {
      if (abortSignal?.aborted) {
        throw toAbortError(abortSignal)
      }
      throw error
    } finally {
      abortSignal?.removeEventListener('abort', cancel)
    }
  }

  async doStream(options: LanguageModelV4CallOptions) {
    if (typeof ReadableStream === 'undefined') {
      throw new Error(
        'ReadableStream is not available. Load a web stream polyfill before streaming Core AI responses.'
      )
    }

    const { modelHandle } = await this.load()
    const { messages, warnings } = prepareCall(options)
    const { abortSignal } = options
    const streamId = generateId()
    let listeners: { remove(): void }[] = []
    let onAbort: (() => void) | undefined

    const cleanup = () => {
      listeners.forEach((listener) => listener.remove())
      listeners = []
      if (onAbort) {
        abortSignal?.removeEventListener('abort', onAbort)
      }
    }

    const stream = new ReadableStream<LanguageModelV4StreamPart>({
      start: (controller) => {
        controller.enqueue({ type: 'stream-start', warnings })

        const snapshots = createSnapshotStreamHandler(
          controller,
          streamId,
          'core-ai'
        )

        const updateListener = NativeCoreAI.onStreamUpdate(
          (event: CoreAIStreamUpdateEvent) => {
            if (event.streamId === streamId) {
              snapshots.update(
                event.content,
                event.entries as AppleStreamEntry[] | undefined
              )
            }
          }
        )
        const completeListener = NativeCoreAI.onStreamComplete(
          (event: CoreAIStreamCompleteEvent) => {
            if (event.streamId === streamId) {
              snapshots.end()
              controller.enqueue({
                type: 'finish',
                finishReason: toFinishReason(
                  event.usage as CoreAIUsage | undefined,
                  options.maxOutputTokens
                ),
                usage: toUsage(event.usage as CoreAIUsage | undefined),
              })
              cleanup()
              controller.close()
            }
          }
        )
        const errorListener = NativeCoreAI.onStreamError(
          (event: CoreAIStreamErrorEvent) => {
            if (event.streamId === streamId) {
              controller.enqueue({
                type: 'error',
                error: new Error(event.error),
              })
              cleanup()
              controller.close()
            }
          }
        )
        listeners = [updateListener, completeListener, errorListener]

        onAbort = () => {
          cleanup()
          NativeCoreAI.cancelStream(streamId)
          controller.error(toAbortError(abortSignal!))
        }
        if (abortSignal?.aborted) {
          onAbort()
          return
        }
        abortSignal?.addEventListener('abort', onAbort, { once: true })

        NativeCoreAI.streamText(
          streamId,
          modelHandle,
          messages,
          toCoreAIGenerationOptions(options)
        )
      },
      cancel: () => {
        cleanup()
        NativeCoreAI.cancelStream(streamId)
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

  private load(
    options: CodegenTypes.UnsafeObject = {}
  ): Promise<CoreAILoadedModel> {
    this.loading ??= (
      NativeCoreAI.loadModel(
        toNativeModelConfig(this.config),
        options
      ) as Promise<CoreAILoadedModel>
    ).then(
      (loadedModel) => (this.loadedModel = loadedModel),
      (error) => {
        this.loading = undefined
        throw error
      }
    )
    return this.loading
  }
}

export class CoreAITextEmbeddingModel implements EmbeddingModelV4 {
  readonly specificationVersion = 'v4'
  readonly provider = 'core-ai'
  readonly modelId: string
  readonly maxEmbeddingsPerCall = Infinity
  readonly supportsParallelCalls = false
  readonly config: CoreAIModelConfig

  constructor(config: CoreAIModelConfig) {
    this.config = { ...config, task: 'embedding' }
    this.modelId = config.id
  }

  async embed(
    values: string[],
    options: CodegenTypes.UnsafeObject = {}
  ): Promise<CoreAIEmbeddingResult> {
    return NativeCoreAI.embed(
      toNativeModelConfig(this.config),
      values,
      options
    ) as Promise<CoreAIEmbeddingResult>
  }

  async doEmbed(
    options: EmbeddingModelV4CallOptions
  ): Promise<EmbeddingModelV4Result> {
    const result = await this.embed(options.values)
    return {
      embeddings: result.embeddings,
      warnings: [],
    }
  }
}

export class CoreAIImageGenerationModel implements ImageModelV4 {
  readonly specificationVersion = 'v4'
  readonly provider = 'core-ai'
  readonly modelId: string
  readonly maxImagesPerCall = 1
  readonly config: CoreAIModelConfig

  constructor(config: CoreAIModelConfig) {
    this.config = { ...config, task: 'diffusion' }
    this.modelId = config.id
  }

  async generate(
    prompt: string,
    options: CoreAIImageGenerationOptions = {}
  ): Promise<CoreAIImageGenerationResult> {
    return NativeCoreAI.generateImage(
      toNativeModelConfig(this.config),
      prompt,
      options
    ) as Promise<CoreAIImageGenerationResult>
  }

  async doGenerate(options: ImageModelV4CallOptions) {
    const result = await this.generate(options.prompt ?? '', {
      n: options.n,
      size: options.size,
      aspectRatio: options.aspectRatio,
      seed: options.seed,
      ...(options.providerOptions?.['core-ai'] ?? {}),
    })

    return {
      images: result.images,
      warnings: getImageWarnings(options, result.metadata),
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: undefined,
      },
      providerMetadata: result.metadata
        ? ({
            'core-ai': {
              images: [],
              ...result.metadata,
            },
          } as any)
        : undefined,
    }
  }
}

export class CoreAITranscriptionModel implements TranscriptionModelV4 {
  readonly specificationVersion = 'v4'
  readonly provider = 'core-ai'
  readonly modelId: string
  readonly config: CoreAIModelConfig

  constructor(config: CoreAIModelConfig) {
    this.config = { ...config, task: 'asr' }
    this.modelId = config.id
  }

  async transcribe(
    audio: Uint8Array | string,
    mediaType: string,
    options: CodegenTypes.UnsafeObject = {}
  ): Promise<CoreAITranscriptionResult> {
    return NativeCoreAI.transcribe(
      toNativeModelConfig(this.config),
      toBase64(audio),
      mediaType,
      options
    ) as Promise<CoreAITranscriptionResult>
  }

  async doGenerate(options: TranscriptionModelV4CallOptions) {
    const result = await this.transcribe(options.audio, options.mediaType, {
      ...(options.providerOptions?.['core-ai'] ?? {}),
    })

    return {
      text: result.text,
      segments: result.segments,
      language: result.language,
      durationInSeconds: result.durationInSeconds,
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
      },
      providerMetadata: result.metadata
        ? ({
            'core-ai': result.metadata,
          } as any)
        : undefined,
    }
  }
}

// Exported models generate one fixed size, which the metadata reports
function getImageWarnings(
  options: ImageModelV4CallOptions,
  metadata: CoreAIImageGenerationResult['metadata']
): SharedV4Warning[] {
  const { width, height } = metadata ?? {}
  if (!width || !height) {
    return []
  }

  const warnings: SharedV4Warning[] = []
  if (options.size && options.size !== `${width}x${height}`) {
    warnings.push({
      type: 'unsupported',
      feature: 'size',
      details: `This model only generates ${width}x${height} images.`,
    })
  }
  if (options.aspectRatio) {
    const [x, y] = options.aspectRatio.split(':').map(Number)
    if (x * height !== y * width) {
      warnings.push({
        type: 'unsupported',
        feature: 'aspectRatio',
        details: `This model only generates ${width}x${height} images.`,
      })
    }
  }
  return warnings
}

function createLanguageSession(sessionHandle: string): CoreAILanguageSession {
  return {
    sessionHandle,
    respond(prompt, options = {}) {
      return NativeCoreAI.respondToLanguageSession(
        sessionHandle,
        prompt,
        options
      ) as Promise<CoreAIGenerationPart[]>
    },
    stream(prompt, options = {}) {
      return streamLanguageSession(sessionHandle, prompt, options)
    },
    close() {
      return NativeCoreAI.releaseLanguageSession(sessionHandle)
    },
  }
}

function streamLanguageSession(
  sessionHandle: string,
  prompt: string,
  options: CoreAIGenerationOptions
): Promise<ReadableStream<CoreAIStreamUpdateEvent>> {
  if (typeof ReadableStream === 'undefined') {
    throw new Error(
      'ReadableStream is not available. Load a web stream polyfill before streaming Core AI responses.'
    )
  }

  const streamId = generateId()
  let listeners: { remove(): void }[] = []

  const cleanup = () => {
    listeners.forEach((listener) => listener.remove())
    listeners = []
  }

  const stream = new ReadableStream<CoreAIStreamUpdateEvent>({
    start(controller) {
      const updateListener = NativeCoreAI.onStreamUpdate(
        (event: CoreAIStreamUpdateEvent) => {
          if (event.streamId === streamId) {
            controller.enqueue(event)
          }
        }
      )
      const completeListener = NativeCoreAI.onStreamComplete(
        (event: CoreAIStreamCompleteEvent) => {
          if (event.streamId === streamId) {
            cleanup()
            controller.close()
          }
        }
      )
      const errorListener = NativeCoreAI.onStreamError(
        (event: CoreAIStreamErrorEvent) => {
          if (event.streamId === streamId) {
            cleanup()
            controller.error(new Error(event.error))
          }
        }
      )

      listeners = [updateListener, completeListener, errorListener]
      NativeCoreAI.streamLanguageSession(
        streamId,
        sessionHandle,
        prompt,
        options
      )
    },
    cancel() {
      cleanup()
      NativeCoreAI.cancelStream(streamId)
    },
  })

  return Promise.resolve(stream)
}

const UNSUPPORTED_SETTINGS = [
  'topP',
  'topK',
  'seed',
  'presencePenalty',
  'frequencyPenalty',
] as const

/**
 * Converts the prompt into messages replayed natively as the session
 * transcript, and warns about the options Core AI ignores
 */
function prepareCall(options: LanguageModelV4CallOptions): {
  messages: CoreAIMessage[]
  warnings: SharedV4Warning[]
} {
  const warnings = getCallWarnings(options)

  // Core AI language models have no vision input yet
  let hasFiles = false
  const prompt = options.prompt.map((message) => {
    if (message.role !== 'user') {
      return message
    }
    const content = message.content.filter((part) => part.type !== 'file')
    hasFiles ||= content.length !== message.content.length
    return { ...message, content }
  }) as LanguageModelV4Prompt

  if (hasFiles) {
    warnings.push({
      type: 'unsupported',
      feature: 'file parts',
      details:
        'Core AI language models do not accept files yet, so they were left out of the prompt.',
    })
  }

  return {
    messages: prepareAppleMessages(prompt) as CoreAIMessage[],
    warnings,
  }
}

function toCoreAIGenerationOptions(
  options: LanguageModelV4CallOptions
): CoreAIGenerationOptions {
  return {
    maxTokens: options.maxOutputTokens,
    temperature: options.temperature,
    // Runs as guided generation, so the output always matches the schema
    schema:
      options.responseFormat?.type === 'json'
        ? options.responseFormat.schema
        : undefined,
    providerOptions: { reasoningLevel: getReasoningLevel(options) },
  }
}

function getReasoningLevel(
  options: LanguageModelV4CallOptions
): CoreAIReasoningLevel | undefined {
  const coreAIOptions = (options.providerOptions?.['core-ai'] ??
    {}) as CoreAIProviderOptions

  // providerOptions['core-ai'].reasoningLevel takes precedence over the
  // provider-agnostic `reasoning` call option. `none` turns thinking off
  return (
    coreAIOptions.reasoningLevel ??
    (options.reasoning === 'none'
      ? 'none'
      : toAppleReasoningLevel(options.reasoning))
  )
}

function getCallWarnings(
  options: LanguageModelV4CallOptions
): SharedV4Warning[] {
  const warnings: SharedV4Warning[] = []

  // Core AI only reads temperature and maximum response tokens
  for (const setting of UNSUPPORTED_SETTINGS) {
    if (options[setting] !== undefined) {
      warnings.push({
        type: 'unsupported',
        feature: setting,
        details: 'Core AI language models ignore this setting.',
      })
    }
  }
  if (options.stopSequences?.length) {
    warnings.push({
      type: 'unsupported',
      feature: 'stopSequences',
      details: 'Core AI language models ignore this setting.',
    })
  }
  if (options.tools?.length) {
    warnings.push({
      type: 'unsupported',
      feature: 'tools',
      details:
        'Core AI tool calling is not supported yet, so the tools were not passed to the model.',
    })
  }
  if (
    options.responseFormat?.type === 'json' &&
    !options.responseFormat.schema
  ) {
    warnings.push({
      type: 'unsupported',
      feature: 'responseFormat',
      details:
        'Core AI language models only enforce JSON output that has a schema.',
    })
  }
  return warnings
}

function toLanguageModelContent(
  part: CoreAIGenerationPart
): LanguageModelV4Content[] {
  switch (part.type) {
    case 'text':
      return [{ type: 'text', text: part.text }]
    case 'reasoning':
      return [
        {
          type: 'reasoning',
          text: part.text,
          providerMetadata: {
            'core-ai': part.signature ? { signature: part.signature } : {},
          },
        },
      ]
    default:
      // No tools are passed to Core AI models, so there are no tool parts
      return []
  }
}

// Core AI does not say why generation ended, so reaching maxOutputTokens
// counts as stopping for length
function toFinishReason(
  usage: CoreAIUsage | undefined,
  maxOutputTokens: number | undefined
): LanguageModelV4FinishReason {
  const raw =
    maxOutputTokens !== undefined &&
    usage !== undefined &&
    usage.outputTokens >= maxOutputTokens
      ? 'length'
      : 'stop'
  return { unified: raw, raw }
}

function toUsage(usage: CoreAIUsage | undefined): LanguageModelV4Usage {
  return {
    inputTokens: {
      total: usage?.inputTokens,
      noCache: usage && usage.inputTokens - usage.cachedInputTokens,
      cacheRead: usage?.cachedInputTokens,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: usage?.outputTokens,
      text: usage && usage.outputTokens - usage.reasoningTokens,
      reasoning: usage?.reasoningTokens,
    },
  }
}

function toAbortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) {
    return signal.reason
  }
  const error = new Error('The operation was aborted.')
  error.name = 'AbortError'
  return error
}

function toBase64(data: Uint8Array | string): string {
  if (typeof data === 'string') {
    return data
  }

  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}
