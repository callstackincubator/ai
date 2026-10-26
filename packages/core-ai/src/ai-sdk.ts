import type {
  EmbeddingModelV4,
  EmbeddingModelV4CallOptions,
  EmbeddingModelV4Result,
  Experimental_TranscriptionModelV4StreamOptions as TranscriptionModelV4StreamOptions,
  Experimental_TranscriptionModelV4StreamPart as TranscriptionModelV4StreamPart,
  Experimental_TranscriptionModelV4StreamResult as TranscriptionModelV4StreamResult,
  Experimental_VideoModelV4 as VideoModelV4,
  Experimental_VideoModelV4CallOptions as VideoModelV4CallOptions,
  Experimental_VideoModelV4Result as VideoModelV4Result,
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
import { UnsupportedFunctionalityError } from '@ai-sdk/provider'
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
  CoreAIEmbeddingOptions,
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
  CoreAITool,
  CoreAITranscriptionResult,
  CoreAIUsage,
  CoreAIVideoGenerationOptions,
  CoreAIVideoGenerationResult,
} from './types'
import { getModelId } from './types'

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
  provider.videoModel = (config: CoreAIModelConfig) => {
    return new CoreAIVideoModel(config)
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
  // Local images are read natively, so the AI SDK passes their URLs through
  readonly supportedUrls = {
    'image/*': [/^file:\/\//, /^data:image\//],
  }
  readonly provider = 'core-ai'
  readonly modelId: string
  readonly config: CoreAIModelConfig

  private loadedModel?: CoreAILoadedModel
  private loading?: Promise<CoreAILoadedModel>
  private removing?: Promise<void>

  constructor(config: CoreAIModelConfig) {
    this.config = { ...config, task: 'language' }
    this.modelId = getModelId(config)
  }

  get modelHandle() {
    return this.loadedModel?.modelHandle
  }

  async inspect(): Promise<CoreAIModelInfo> {
    return NativeCoreAI.inspectModel(this.config) as Promise<CoreAIModelInfo>
  }

  // Loads the model once. Later calls, including generateText and streamText,
  // reuse it until unload()
  async prepare(
    options: CodegenTypes.UnsafeObject = {}
  ): Promise<CoreAIModelInfo> {
    return (await this.load(options)).info
  }

  async specialize(
    options: CodegenTypes.UnsafeObject = {}
  ): Promise<CoreAIModelInfo> {
    return NativeCoreAI.specializeModel(
      this.config,
      options
    ) as Promise<CoreAIModelInfo>
  }

  // Releases the native model and the sessions created from it
  async unload(): Promise<void> {
    const loading = this.loading
    if (!loading) {
      return
    }
    this.loading = undefined
    this.loadedModel = undefined
    await NativeCoreAI.unloadModel((await loading).modelHandle)
  }

  // Unloads the model before deleting its files. Loads that start meanwhile
  // wait for the files to be gone
  async remove(): Promise<void> {
    const removal = (async () => {
      await this.unload().catch(() => {})
      await NativeCoreAI.removeModel(this.config)
    })()
    this.removing = removal
    try {
      await removal
    } finally {
      if (this.removing === removal) {
        this.removing = undefined
      }
    }
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

      const content = response.content.flatMap(toLanguageModelContent)
      return {
        content,
        finishReason: toFinishReason(
          response.usage,
          options.maxOutputTokens,
          content.some((part) => part.type === 'tool-call')
        ),
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
        // Tool calls end the generation, so they are sent once it completes
        let toolCalls: LanguageModelV4StreamPart[] = []

        const updateListener = NativeCoreAI.onStreamUpdate(
          (event: CoreAIStreamUpdateEvent) => {
            if (event.streamId === streamId) {
              const entries = event.entries as AppleStreamEntry[] | undefined
              snapshots.update(event.content, entries)
              if (entries) {
                toolCalls = (entries as CoreAIGenerationPart[])
                  .flatMap(toLanguageModelContent)
                  .filter((part) => part.type === 'tool-call')
              }
            }
          }
        )
        const completeListener = NativeCoreAI.onStreamComplete(
          (event: CoreAIStreamCompleteEvent) => {
            if (event.streamId === streamId) {
              snapshots.end()
              toolCalls.forEach((part) => controller.enqueue(part))
              controller.enqueue({
                type: 'finish',
                finishReason: toFinishReason(
                  event.usage as CoreAIUsage | undefined,
                  options.maxOutputTokens,
                  toolCalls.length > 0
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
                error: toStreamError(event),
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
    if (this.loading) {
      return this.loading
    }
    const removing = this.removing ?? Promise.resolve()
    const loading: Promise<CoreAILoadedModel> = removing
      .catch(() => {})
      .then(
        () =>
          NativeCoreAI.loadModel(
            this.config,
            options
          ) as Promise<CoreAILoadedModel>
      )
      .then(
        (loadedModel) => {
          // unload() during the load drops it, and the next call loads again
          if (this.loading === loading) {
            this.loadedModel = loadedModel
          }
          return loadedModel
        },
        (error) => {
          if (this.loading === loading) {
            this.loading = undefined
          }
          throw error
        }
      )
    this.loading = loading
    return loading
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
    this.modelId = getModelId(config)
  }

  async embed(
    values: string[],
    options: CodegenTypes.UnsafeObject = {}
  ): Promise<CoreAIEmbeddingResult> {
    return NativeCoreAI.embed(
      this.config,
      values,
      options
    ) as Promise<CoreAIEmbeddingResult>
  }

  // Embeds images into the same space as text, with the model's
  // `encode_image` function. The AI SDK has no image embedding call
  async embedImages(
    imageUris: string[],
    options: CoreAIEmbeddingOptions = {}
  ): Promise<CoreAIEmbeddingResult> {
    const result = (await NativeCoreAI.runTask(
      'embedding',
      this.config,
      { data: { imageUris } },
      options
    )) as { output: CoreAIEmbeddingResult }
    return result.output
  }

  async doEmbed(
    options: EmbeddingModelV4CallOptions
  ): Promise<EmbeddingModelV4Result> {
    const result = await this.embed(
      options.values,
      options.providerOptions?.['core-ai'] ?? {}
    )
    return {
      embeddings: result.embeddings,
      warnings: [],
      providerMetadata: result.metadata
        ? ({ 'core-ai': result.metadata } as any)
        : undefined,
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
    this.modelId = getModelId(config)
  }

  async generate(
    prompt: string,
    options: CoreAIImageGenerationOptions = {}
  ): Promise<CoreAIImageGenerationResult> {
    return NativeCoreAI.generateImage(
      this.config,
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

// Wan 2.1 sizes for the aspect ratios it is trained on
const VIDEO_SIZES: Record<string, { width: number; height: number }> = {
  '16:9': { width: 832, height: 480 },
  '9:16': { width: 480, height: 832 },
  '1:1': { width: 480, height: 480 },
}

export class CoreAIVideoModel implements VideoModelV4 {
  readonly specificationVersion = 'v4'
  readonly provider = 'core-ai'
  readonly modelId: string
  readonly maxVideosPerCall = 1
  readonly config: CoreAIModelConfig

  constructor(config: CoreAIModelConfig) {
    this.config = { ...config, task: 'video-diffusion' }
    this.modelId = getModelId(config)
  }

  // Generates an MP4 from the prompt. Takes minutes on device, and the abort
  // signal stops it after the current denoising step
  async generate(
    prompt: string,
    options: CoreAIVideoGenerationOptions = {},
    abortSignal?: AbortSignal
  ): Promise<CoreAIVideoGenerationResult> {
    // React Native's AbortSignal has no throwIfAborted()
    if (abortSignal?.aborted) {
      throw toAbortError(abortSignal)
    }
    const requestId = generateId()
    const onAbort = () => NativeCoreAI.cancelStream(requestId)
    abortSignal?.addEventListener('abort', onAbort)
    try {
      return (await NativeCoreAI.generateVideo(
        requestId,
        this.config,
        prompt,
        options
      )) as CoreAIVideoGenerationResult
    } finally {
      abortSignal?.removeEventListener('abort', onAbort)
    }
  }

  async doGenerate(
    options: VideoModelV4CallOptions
  ): Promise<VideoModelV4Result> {
    const warnings: SharedV4Warning[] = []
    for (const feature of [
      'image',
      'frameImages',
      'inputReferences',
      'generateAudio',
    ] as const) {
      if (options[feature]) {
        warnings.push({
          type: 'unsupported',
          feature,
          details: 'Core AI video models generate from text only.',
        })
      }
    }

    let size: { width: number; height: number } | undefined
    if (options.resolution) {
      const [width, height] = options.resolution.split('x').map(Number)
      size = { width, height }
    } else if (options.aspectRatio && options.aspectRatio !== 'adaptive') {
      size = VIDEO_SIZES[options.aspectRatio]
      if (!size) {
        warnings.push({
          type: 'unsupported',
          feature: 'aspectRatio',
          details: `Use resolution, or one of ${Object.keys(VIDEO_SIZES).join(', ')}.`,
        })
      }
    }

    const result = await this.generate(
      options.prompt ?? '',
      {
        ...size,
        duration: options.duration,
        fps: options.fps,
        seed: options.seed,
        ...(options.providerOptions?.['core-ai'] ?? {}),
      },
      options.abortSignal
    )
    const { video, mediaType, ...metadata } = result

    return {
      videos: [{ type: 'base64', data: video, mediaType }],
      warnings,
      providerMetadata: { 'core-ai': metadata },
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: undefined,
      },
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
    this.modelId = getModelId(config)
  }

  async transcribe(
    audio: Uint8Array | string,
    mediaType: string,
    options: CodegenTypes.UnsafeObject = {}
  ): Promise<CoreAITranscriptionResult> {
    return NativeCoreAI.transcribe(
      this.config,
      toBase64(audio),
      mediaType,
      options
    ) as Promise<CoreAITranscriptionResult>
  }

  // Transcribes live 16-bit PCM audio on a streaming Parakeet TDT bundle.
  // Segments close at pauses, and their text only ever grows until then
  async doStream(
    options: TranscriptionModelV4StreamOptions
  ): Promise<TranscriptionModelV4StreamResult> {
    const { inputAudioFormat, abortSignal } = options
    if (inputAudioFormat.type !== 'audio/pcm') {
      throw new UnsupportedFunctionalityError({
        functionality: `streaming transcription of ${inputAudioFormat.type}`,
        message: `Core AI streams 16-bit PCM audio (audio/pcm), not ${inputAudioFormat.type}.`,
      })
    }

    // React Native's AbortSignal has no throwIfAborted()
    if (abortSignal?.aborted) {
      throw toAbortError(abortSignal)
    }

    const streamId = generateId()
    const config = this.config
    const modelId = this.modelId
    const audio = options.audio.getReader()
    let listener: { remove(): void } | undefined
    const cleanup = () => {
      listener?.remove()
      abortSignal?.removeEventListener('abort', onAbort)
    }
    function onAbort() {
      NativeCoreAI.cancelStream(streamId)
      audio.cancel().catch(() => {})
    }

    const stream = new ReadableStream<TranscriptionModelV4StreamPart>({
      async start(controller) {
        controller.enqueue({ type: 'stream-start', warnings: [] })
        controller.enqueue({
          type: 'response-metadata',
          timestamp: new Date(),
          modelId,
        })

        // Text sent so far of each segment, to send what the next update adds
        const sentText = new Map<number, string>()
        listener = NativeCoreAI.onTranscriptionUpdate((update) => {
          if (update.streamId !== streamId) {
            return
          }
          const id = `segment-${update.segmentIndex}`
          const sent = sentText.get(update.segmentIndex) ?? ''
          const text = update.text.trim()
          if (text.startsWith(sent) && text.length > sent.length) {
            // Segments after the first start with a space
            const separator = sent === '' && update.segmentIndex > 0 ? ' ' : ''
            controller.enqueue({
              type: 'transcript-delta',
              id,
              delta: separator + text.slice(sent.length),
            })
            sentText.set(update.segmentIndex, text)
          }
          if (update.type === 'final' && text) {
            controller.enqueue({
              type: 'transcript-final',
              id,
              text,
              startSecond: update.startSecond,
              endSecond: update.endSecond,
            })
          }
        })
        abortSignal?.addEventListener('abort', onAbort)

        try {
          await NativeCoreAI.startTranscriptionStream(streamId, config, {
            sampleRate: inputAudioFormat.rate ?? 16000,
          })
          // A sample can be split across chunks
          let carry: number | undefined
          while (true) {
            const { done, value } = await audio.read()
            if (done || abortSignal?.aborted) {
              break
            }
            const bytes =
              typeof value === 'string'
                ? Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
                : value
            let chunk = bytes
            if (carry !== undefined) {
              chunk = new Uint8Array(bytes.length + 1)
              chunk[0] = carry
              chunk.set(bytes, 1)
              carry = undefined
            }
            if (chunk.length % 2 === 1) {
              carry = chunk[chunk.length - 1]
              chunk = chunk.subarray(0, chunk.length - 1)
            }
            if (chunk.length > 0) {
              await NativeCoreAI.appendTranscriptionAudio(
                streamId,
                toBase64(chunk)
              )
            }
          }
          if (abortSignal?.aborted) {
            throw abortSignal.reason ?? new Error('Transcription was aborted.')
          }

          const result = (await NativeCoreAI.finishTranscriptionStream(
            streamId
          )) as CoreAITranscriptionResult
          if (abortSignal?.aborted) {
            throw abortSignal.reason ?? new Error('Transcription was aborted.')
          }
          controller.enqueue({
            type: 'finish',
            text: result.text,
            segments: result.segments,
            durationInSeconds: result.durationInSeconds,
            providerMetadata: result.metadata
              ? ({ 'core-ai': result.metadata } as any)
              : undefined,
          })
          controller.close()
        } catch (error) {
          NativeCoreAI.cancelStream(streamId)
          // Stops a live source, such as a microphone, from capturing on
          audio.cancel(error).catch(() => {})
          controller.error(error)
        } finally {
          cleanup()
          audio.releaseLock()
        }
      },
      cancel() {
        onAbort()
        cleanup()
      },
    })

    return { stream, response: { timestamp: new Date(), modelId } }
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
            controller.error(toStreamError(event))
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

// Converts the prompt into messages replayed natively as the session
// transcript, and warns about the options Core AI ignores
function prepareCall(options: LanguageModelV4CallOptions): {
  messages: CoreAIMessage[]
  warnings: SharedV4Warning[]
} {
  const warnings = getCallWarnings(options)

  // Image parts of the last user message become transcript attachments, read
  // by vision language model bundles. Other files, and images of earlier
  // turns, are left out
  let hasOmittedFiles = false
  const prompt = options.prompt.map((message, index) => {
    if (message.role !== 'user') {
      return message
    }
    const isFinalPrompt = index === options.prompt.length - 1
    const content = message.content.filter(
      (part) =>
        part.type !== 'file' ||
        (isFinalPrompt && part.mediaType.toLowerCase().startsWith('image'))
    )
    hasOmittedFiles ||= content.length !== message.content.length
    return { ...message, content }
  }) as LanguageModelV4Prompt

  if (hasOmittedFiles) {
    warnings.push({
      type: 'unsupported',
      feature: 'file parts',
      details:
        'Core AI language models accept images in the last user message only, so other files were left out of the prompt.',
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
    tools: getTools(options),
    providerOptions: { reasoningLevel: getReasoningLevel(options) },
  }
}

// Function tools the model can call. Core AI models decide themselves whether
// to call one, so a required tool choice only limits the tools offered
function getTools(options: LanguageModelV4CallOptions): CoreAITool[] {
  const { toolChoice } = options
  if (toolChoice?.type === 'none') {
    return []
  }
  return (options.tools ?? []).flatMap((tool) =>
    tool.type === 'function' &&
    (toolChoice?.type !== 'tool' || toolChoice.toolName === tool.name)
      ? [
          {
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          },
        ]
      : []
  )
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
  for (const tool of options.tools ?? []) {
    if (tool.type === 'provider') {
      warnings.push({
        type: 'unsupported',
        feature: `provider-defined tool ${tool.id}`,
        details: 'Core AI language models only call function tools.',
      })
    }
  }
  if (
    options.toolChoice?.type === 'required' ||
    options.toolChoice?.type === 'tool'
  ) {
    warnings.push({
      type: 'unsupported',
      feature: 'toolChoice',
      details:
        'Core AI language models decide themselves whether to call a tool, so it is not required.',
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
    case 'tool-call':
      // The AI SDK runs the tool and replays the result on the next call
      return [
        {
          type: 'tool-call',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
        },
      ]
    default:
      // Tools run in the AI SDK, so Core AI returns no tool results
      return []
  }
}

// Core AI does not say why generation ended, so reaching maxOutputTokens
// counts as stopping for length. Tool calls end generation too
function toFinishReason(
  usage: CoreAIUsage | undefined,
  maxOutputTokens: number | undefined,
  hasToolCalls = false
): LanguageModelV4FinishReason {
  if (hasToolCalls) {
    return { unified: 'tool-calls', raw: 'tool-calls' }
  }
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

// Keeps the native error code, like errors from rejected native calls
function toStreamError(event: CoreAIStreamErrorEvent): Error {
  return Object.assign(new Error(event.error), { code: event.code })
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
