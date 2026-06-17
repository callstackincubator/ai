import type {
  EmbeddingModelV3,
  EmbeddingModelV3CallOptions,
  EmbeddingModelV3Result,
  ImageModelV3,
  ImageModelV3CallOptions,
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3FinishReason,
  LanguageModelV3Prompt,
  LanguageModelV3StreamPart,
  TranscriptionModelV3,
  TranscriptionModelV3CallOptions,
} from '@ai-sdk/provider'
import { generateId } from '@ai-sdk/provider-utils'

import {
  coreAI,
  CoreAIEmbeddingModel,
  CoreAIImageModel,
  CoreAILanguageModel,
  CoreAITranscriptionModel,
  prepareMessages,
} from './core'
import NativeCoreAI from './NativeCoreAI'
import type {
  CoreAIGenerationOptions,
  CoreAIGenerationPart,
  CoreAIModelConfig,
  CoreAIStreamCompleteEvent,
  CoreAIStreamErrorEvent,
  CoreAIStreamUpdateEvent,
} from './types'
import { toNativeModelConfig } from './types'

export function createCoreAIProvider() {
  const provider = function (config: CoreAIModelConfig) {
    return provider.languageModel(config)
  }

  provider.getCapabilities = () => coreAI.getCapabilities()
  provider.languageModel = (config: CoreAIModelConfig) => {
    return new CoreAILanguageModelAdapter(config)
  }
  provider.textEmbeddingModel = (config: CoreAIModelConfig) => {
    return new CoreAITextEmbeddingModel(config)
  }
  provider.embeddingModel = provider.textEmbeddingModel
  provider.imageModel = (config: CoreAIModelConfig) => {
    return new CoreAIImageGenerationModel(config)
  }
  provider.transcriptionModel = (config: CoreAIModelConfig) => {
    return new CoreAITranscriptionAdapter(config)
  }

  return provider
}

export const coreAIProvider = createCoreAIProvider()

export class CoreAILanguageModelAdapter
  extends CoreAILanguageModel
  implements LanguageModelV3
{
  readonly specificationVersion = 'v3'
  readonly supportedUrls = {}
  readonly provider = 'core-ai'
  readonly modelId: string

  constructor(config: CoreAIModelConfig) {
    super({ ...config, task: 'language' })
    this.modelId = config.id
  }

  async doGenerate(options: LanguageModelV3CallOptions) {
    const response = (await NativeCoreAI.generateText(
      toNativeModelConfig(this.config),
      toCoreAIMessages(options.prompt),
      toCoreAIGenerationOptions(options)
    )) as CoreAIGenerationPart[]

    return {
      content: response.map(toLanguageModelContent),
      finishReason: toFinishReason('stop'),
      usage: emptyUsage(),
      warnings: [],
    }
  }

  async doStream(options: LanguageModelV3CallOptions) {
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

    const stream = new ReadableStream<LanguageModelV3StreamPart>({
      start: (controller) => {
        controller.enqueue({ type: 'text-start', id: streamId })

        const updateListener = NativeCoreAI.onStreamUpdate(
          (event: CoreAIStreamUpdateEvent) => {
            if (event.streamId === streamId) {
              controller.enqueue({
                type: 'text-delta',
                id: streamId,
                delta: event.content,
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
          toCoreAIMessages(options.prompt),
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
}

export class CoreAITextEmbeddingModel
  extends CoreAIEmbeddingModel
  implements EmbeddingModelV3
{
  readonly specificationVersion = 'v3'
  readonly provider = 'core-ai'
  readonly modelId: string
  readonly maxEmbeddingsPerCall = Infinity
  readonly supportsParallelCalls = false

  constructor(config: CoreAIModelConfig) {
    super({ ...config, task: 'embedding' })
    this.modelId = config.id
  }

  async doEmbed(
    options: EmbeddingModelV3CallOptions
  ): Promise<EmbeddingModelV3Result> {
    const result = await this.embed(options.values)
    return {
      embeddings: result.embeddings,
      warnings: [],
    }
  }
}

export class CoreAIImageGenerationModel
  extends CoreAIImageModel
  implements ImageModelV3
{
  readonly specificationVersion = 'v3'
  readonly provider = 'core-ai'
  readonly modelId: string
  readonly maxImagesPerCall = 1

  constructor(config: CoreAIModelConfig) {
    super({ ...config, task: 'diffusion' })
    this.modelId = config.id
  }

  async doGenerate(options: ImageModelV3CallOptions) {
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

export class CoreAITranscriptionAdapter
  extends CoreAITranscriptionModel
  implements TranscriptionModelV3
{
  readonly specificationVersion = 'v3'
  readonly provider = 'core-ai'
  readonly modelId: string

  constructor(config: CoreAIModelConfig) {
    super({ ...config, task: 'asr' })
    this.modelId = config.id
  }

  async doGenerate(options: TranscriptionModelV3CallOptions) {
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

function toCoreAIMessages(prompt: LanguageModelV3Prompt) {
  return prepareMessages(prompt)
}

function toCoreAIGenerationOptions(
  options: LanguageModelV3CallOptions
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
): LanguageModelV3FinishReason {
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
