import type {
  EmbeddingModelV4,
  EmbeddingModelV4CallOptions,
  EmbeddingModelV4Result,
  ImageModelV4,
  ImageModelV4CallOptions,
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4FinishReason,
  LanguageModelV4StreamPart,
  SharedV4Warning,
  TranscriptionModelV4,
  TranscriptionModelV4CallOptions,
} from '@ai-sdk/provider'
import { generateId, isCustomReasoning } from '@ai-sdk/provider-utils'
import type { CodegenTypes } from 'react-native'

import NativeCoreAI from './NativeCoreAI'
import type {
  CoreAIEmbeddingResult,
  CoreAIGenerationOptions,
  CoreAIGenerationPart,
  CoreAIImageGenerationOptions,
  CoreAIImageGenerationResult,
  CoreAILoadedModel,
  CoreAIMessage,
  CoreAIModelConfig,
  CoreAIModelInfo,
  CoreAIStreamCompleteEvent,
  CoreAIStreamErrorEvent,
  CoreAIStreamUpdateEvent,
  CoreAITranscriptionResult,
} from './types'
import { toNativeModelConfig } from './types'

export function createCoreAIProvider() {
  const provider = function (config: CoreAIModelConfig) {
    return provider.languageModel(config)
  }

  provider.getCapabilities = () => NativeCoreAI.getCapabilities()
  provider.languageModel = (config: CoreAIModelConfig) => {
    return new CoreAILanguageModel(config)
  }
  provider.textEmbeddingModel = (config: CoreAIModelConfig) => {
    return new CoreAITextEmbeddingModel(config)
  }
  provider.embeddingModel = provider.textEmbeddingModel
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

  async prepare(
    options: CodegenTypes.UnsafeObject = {}
  ): Promise<CoreAIModelInfo> {
    const loadedModel = (await NativeCoreAI.loadModel(
      toNativeModelConfig(this.config),
      options
    )) as CoreAILoadedModel
    this.loadedModel = loadedModel
    return loadedModel.info
  }

  async specialize(
    options: CodegenTypes.UnsafeObject = {}
  ): Promise<CoreAIModelInfo> {
    return NativeCoreAI.specializeModel(
      toNativeModelConfig(this.config),
      options
    ) as Promise<CoreAIModelInfo>
  }

  async unload(): Promise<void> {
    if (!this.loadedModel) {
      return
    }
    await NativeCoreAI.unloadModel(this.loadedModel.modelHandle)
    this.loadedModel = undefined
  }

  async remove(): Promise<void> {
    await NativeCoreAI.removeModel(toNativeModelConfig(this.config))
    this.loadedModel = undefined
  }

  async createSession(
    options: CodegenTypes.UnsafeObject = {}
  ): Promise<CoreAILanguageSession> {
    const model = await this.ensureLoaded()
    const sessionHandle = await NativeCoreAI.createLanguageSession(
      model.modelHandle,
      options
    )
    return createLanguageSession(sessionHandle)
  }

  async doGenerate(options: LanguageModelV4CallOptions) {
    const response = (await NativeCoreAI.generateText(
      toNativeModelConfig(this.config),
      prepareMessages(options.prompt),
      toCoreAIGenerationOptions(options)
    )) as CoreAIGenerationPart[]

    return {
      content: response.map(toLanguageModelContent),
      finishReason: toFinishReason('stop'),
      usage: emptyUsage(),
      warnings: getCallWarnings(options),
    }
  }

  async doStream(options: LanguageModelV4CallOptions) {
    if (typeof ReadableStream === 'undefined') {
      throw new Error(
        'ReadableStream is not available. Load a web stream polyfill before streaming Core AI responses.'
      )
    }

    const streamId = generateId()
    const warnings = getCallWarnings(options)
    let listeners: { remove(): void }[] = []

    const cleanup = () => {
      listeners.forEach((listener) => listener.remove())
      listeners = []
    }

    const stream = new ReadableStream<LanguageModelV4StreamPart>({
      start: (controller) => {
        controller.enqueue({ type: 'stream-start', warnings })
        controller.enqueue({ type: 'text-start', id: streamId })

        let previousContent = ''

        const updateListener = NativeCoreAI.onStreamUpdate(
          (event: CoreAIStreamUpdateEvent) => {
            if (event.streamId === streamId) {
              // Native emits the full response so far on every update
              const delta = event.content.startsWith(previousContent)
                ? event.content.slice(previousContent.length)
                : event.content
              previousContent = event.content

              controller.enqueue({
                type: 'text-delta',
                id: streamId,
                delta,
              })
            }
          }
        )
        const completeListener = NativeCoreAI.onStreamComplete(
          (event: CoreAIStreamCompleteEvent) => {
            if (event.streamId === streamId) {
              controller.enqueue({ type: 'text-end', id: streamId })
              controller.enqueue({
                type: 'finish',
                finishReason: toFinishReason('stop'),
                usage: emptyUsage(),
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
        NativeCoreAI.streamText(
          streamId,
          toNativeModelConfig(this.config),
          prepareMessages(options.prompt),
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

  private async ensureLoaded(): Promise<CoreAILoadedModel> {
    if (!this.loadedModel) {
      await this.prepare()
    }
    return this.loadedModel!
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
      warnings: [],
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

export function prepareMessages(messages: unknown): CoreAIMessage[] {
  if (!Array.isArray(messages)) {
    return []
  }

  return messages.map((message: any): CoreAIMessage => {
    const content = Array.isArray(message.content)
      ? message.content.reduce((acc: string, part: any) => {
          if (part.type === 'text') {
            return acc + part.text
          }
          console.warn('Unsupported Core AI message content type:', part)
          return acc
        }, '')
      : String(message.content ?? '')

    return {
      role: message.role,
      content,
    }
  })
}

function toCoreAIGenerationOptions(
  options: LanguageModelV4CallOptions
): CoreAIGenerationOptions {
  return {
    maxTokens: options.maxOutputTokens,
    temperature: options.temperature,
    topP: options.topP,
    topK: options.topK,
    schema:
      options.responseFormat?.type === 'json'
        ? options.responseFormat.schema
        : undefined,
    tools: options.tools,
  }
}

function getCallWarnings(
  options: LanguageModelV4CallOptions
): SharedV4Warning[] {
  if (isCustomReasoning(options.reasoning)) {
    return [
      {
        type: 'unsupported',
        feature: 'reasoning',
        details:
          'Core AI language models do not support configuring reasoning.',
      },
    ]
  }
  return []
}

function toLanguageModelContent(part: CoreAIGenerationPart) {
  switch (part.type) {
    case 'text':
      return part
    case 'reasoning':
      return {
        type: 'reasoning' as const,
        text: part.text,
      }
    case 'tool-call':
      return {
        type: 'tool-call' as const,
        toolCallId: generateId(),
        providerExecuted: true,
        toolName: part.toolName,
        input: part.input,
      }
    case 'tool-result':
      return {
        type: 'tool-result' as const,
        toolCallId: generateId(),
        providerExecuted: true,
        toolName: part.toolName,
        result: part.output,
      }
  }
}

function toFinishReason(
  raw: 'stop' | 'length' | 'tool-calls' | 'error'
): LanguageModelV4FinishReason {
  return {
    unified: raw === 'tool-calls' ? 'tool-calls' : raw,
    raw,
  }
}

function emptyUsage() {
  return {
    inputTokens: {
      total: 0,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: 0,
      text: undefined,
      reasoning: undefined,
    },
  }
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
