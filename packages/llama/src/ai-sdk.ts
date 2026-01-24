import type {
  EmbeddingModelV2,
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2Prompt,
  LanguageModelV2StreamPart,
  SpeechModelV2,
  SpeechModelV2CallOptions,
} from '@ai-sdk/provider'
import { generateId } from '@ai-sdk/provider-utils'
import {
  type CompletionParams,
  type ContextParams,
  type EmbeddingParams,
  initLlama,
  type LlamaContext,
  type NativeCompletionResult,
  type NativeEmbeddingResult,
  type RNLlamaOAICompatibleMessage,
  type TokenData,
} from 'llama.rn'

type LLMState = 'text' | 'reasoning' | 'none'

function convertFinishReason(
  result: NativeCompletionResult
): LanguageModelV2FinishReason {
  if (result.stopped_eos) {
    return 'stop'
  }
  if (result.stopped_word) {
    return 'stop'
  }
  if (result.stopped_limit) {
    return 'length'
  }
  return 'unknown'
}

/**
 * Convert Uint8Array to base64 string
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Prepare messages with multimodal support for llama.rn
 *
 * Supports:
 * - Images: JPEG, PNG, BMP, GIF, TGA, HDR, PIC, PNM
 * - Audio: WAV, MP3
 * - Base64 data URLs and local file paths (file:///)
 * - Note: HTTP URLs are not yet supported
 *
 * @see https://github.com/mybigday/llama.rn#multimodal-vision--audio
 */
function prepareMessagesWithMedia(prompt: LanguageModelV2Prompt): {
  messages: RNLlamaOAICompatibleMessage[]
} {
  const messages: RNLlamaOAICompatibleMessage[] = []

  for (const message of prompt) {
    // String content - push directly
    if (typeof message.content === 'string') {
      messages.push({ role: message.role, content: message.content })
      continue
    }

    // Non-array content - skip
    if (!Array.isArray(message.content)) {
      continue
    }

    // Process array content parts
    const parts: RNLlamaOAICompatibleMessage['content'] = []

    for (const part of message.content) {
      switch (part.type) {
        case 'text':
          parts.push({ type: 'text', text: part.text })
          break

        case 'file': {
          const mediaType = part.mediaType.toLowerCase()
          const { data } = part

          // Convert data to URL string
          const url =
            data instanceof Uint8Array
              ? `data:${part.mediaType};base64,${uint8ArrayToBase64(data)}`
              : data instanceof URL
                ? data.toString()
                : typeof data === 'string'
                  ? data
                  : null

          if (!url) break

          // Handle images
          if (mediaType.startsWith('image/')) {
            parts.push({ type: 'image_url', image_url: { url } })
            break
          }

          // Handle audio
          if (mediaType.startsWith('audio/')) {
            const format = mediaType.includes('wav') ? 'wav' : 'mp3'
            const isDataUrl = url.startsWith('data:')
            parts.push({
              type: 'input_audio',
              input_audio: {
                format,
                data: isDataUrl ? url : undefined,
                url: isDataUrl ? undefined : url,
              },
            })
          }
          break
        }
      }
    }

    if (parts.length > 0) {
      messages.push({ role: message.role, content: parts })
    }
  }

  return { messages }
}

/**
 * Configuration options for llama.rn model initialization
 *
 * @see https://github.com/mybigday/llama.rn
 */
export interface LlamaModelOptions {
  /**
   * Path to multimodal projector (mmproj) file for vision/audio support
   * When provided, enables multimodal capabilities automatically
   *
   * @see https://github.com/mybigday/llama.rn#multimodal-vision--audio
   */
  projectorPath?: string
  /**
   * Use GPU for multimodal processing. Default/Recommended: true
   */
  projectorUseGpu?: boolean
  /**
   * llama.rn context params passed to initLlama()
   */
  contextParams?: Partial<ContextParams>
}

const START_OF_THINKING_PLACEHOLDER = '<think>'
const END_OF_THINKING_PLACEHOLDER = '</think>'

/**
 * llama.rn Language Model for AI SDK
 *
 * Supports multimodal (vision & audio) when projectorPath is provided
 *
 * @see https://github.com/mybigday/llama.rn
 */
export class LlamaLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2'
  readonly provider = 'llama'
  readonly modelId: string

  private modelPath: string
  private options: LlamaModelOptions
  private context: LlamaContext | null = null
  private multimodalInitialized: boolean = false

  /**
   * Supported URL patterns
   * Note: Only file:// and data: URLs supported (HTTP URLs not yet supported)
   */
  get supportedUrls(): Record<string, RegExp[]> {
    if (this.options.projectorPath) {
      return {
        'image/*': [/^file:\/\//, /^data:image\//],
        'audio/*': [/^file:\/\//, /^data:audio\//],
      }
    }
    return {}
  }

  /**
   * @param modelPath - Path to the model file (from downloadModel() or getModelPath())
   * @param options - Model configuration options
   */
  constructor(modelPath: string, options: LlamaModelOptions = {}) {
    this.modelPath = modelPath
    this.modelId = modelPath

    this.options = {
      projectorUseGpu: true,
      ...options,
      contextParams: {
        n_ctx: Boolean(options.projectorPath) ? 4096 : 2048,
        n_gpu_layers: 99,
        ...options.contextParams,
      },
    }
  }

  /**
   * Initialize the model (load LlamaContext)
   * @returns The initialized LlamaContext
   */
  async prepare(): Promise<LlamaContext> {
    if (this.context) {
      return this.context
    }

    this.context = await initLlama({
      model: this.modelPath,
      // Important: ctx_shift must be false for multimodal (required per docs)
      ...(this.options.projectorPath ? { ctx_shift: false } : {}),
      ...this.options.contextParams,
    })

    // Initialize multimodal support if projector path is provided
    if (this.options.projectorPath) {
      await this.initializeMultimodal()
    }

    return this.context
  }

  /**
   * Initialize multimodal support (vision/audio)
   *
   * @see https://github.com/mybigday/llama.rn#multimodal-vision--audio
   */
  private async initializeMultimodal(): Promise<void> {
    if (!this.context) {
      throw new Error('Context not initialized')
    }

    if (!this.options.projectorPath) {
      throw new Error('Projector path not provided in options')
    }

    this.multimodalInitialized = await this.context.initMultimodal({
      path: this.options.projectorPath,
      use_gpu: this.options.projectorUseGpu ?? true,
    })

    if (!this.multimodalInitialized) {
      throw new Error('Failed to initialize multimodal support')
    }
  }

  /**
   * Get the underlying LlamaContext (for advanced usage)
   */
  getContext(): LlamaContext | null {
    return this.context
  }

  /**
   * Unload model from memory
   */
  async unload(): Promise<void> {
    if (this.context) {
      if (this.multimodalInitialized) {
        await this.context.releaseMultimodal()
        this.multimodalInitialized = false
      }
      await this.context.release()
      this.context = null
    }
  }

  /**
   * Non-streaming text generation (AI SDK LanguageModelV2)
   */
  async doGenerate(options: LanguageModelV2CallOptions) {
    if (!this.context) {
      console.warn(
        '[llama] Model not prepared. Call prepare() ahead of time to optimize performance.'
      )
    }

    const context = this.context ?? (await this.prepare())

    const { messages } = prepareMessagesWithMedia(options.prompt)

    const completionOptions: Partial<CompletionParams> = {
      messages,
      temperature: options.temperature,
      n_predict: options.maxOutputTokens,
      top_p: options.topP,
      top_k: options.topK,
      penalty_present: options.presencePenalty,
      penalty_freq: options.frequencyPenalty,
      stop: options.stopSequences,
      seed: options.seed,
    }

    if (options.responseFormat?.type === 'json') {
      completionOptions.response_format = {
        type: 'json_object',
        schema: options.responseFormat.schema,
      }
    }

    const response = await context.completion(completionOptions)
    let textContent = response.content

    // filter out thinking tags from content
    const thinkingStartIndex = textContent.indexOf(
      START_OF_THINKING_PLACEHOLDER
    )
    const thinkingEndIndex = textContent.indexOf(END_OF_THINKING_PLACEHOLDER)

    if (thinkingStartIndex !== -1 && thinkingEndIndex !== -1) {
      // remove reasoning block from text content
      const beforeThinking = textContent.slice(0, thinkingStartIndex)
      const afterThinking = textContent.slice(
        thinkingEndIndex + END_OF_THINKING_PLACEHOLDER.length
      )
      textContent = beforeThinking + afterThinking
    }

    return {
      content: [
        {
          type: 'text',
          text: textContent,
        },
        {
          type: 'reasoning',
          text: response.reasoning_content,
        },
      ] as LanguageModelV2Content[],
      finishReason: convertFinishReason(response),
      usage: {
        inputTokens: response.timings?.prompt_n || 0,
        outputTokens: response.timings?.predicted_n || 0,
        totalTokens:
          (response.timings?.prompt_n || 0) +
          (response.timings?.predicted_n || 0),
      },
      providerMetadata: {
        llama: {
          timings: response.timings,
        },
      },
      warnings: [],
    }
  }

  /**
   * Streaming text generation (AI SDK LanguageModelV2)
   */
  async doStream(options: LanguageModelV2CallOptions) {
    if (!this.context) {
      console.warn(
        '[llama] Model not prepared. Call prepare() ahead of time to optimize performance.'
      )
    }

    if (typeof ReadableStream === 'undefined') {
      throw new TypeError(
        'ReadableStream is not available in this environment. Please load a polyfill, such as web-streams-polyfill.'
      )
    }

    const context = this.context ?? (await this.prepare())

    const { messages } = prepareMessagesWithMedia(options.prompt)

    const completionOptions: Partial<CompletionParams> = {
      messages,
      temperature: options.temperature,
      n_predict: options.maxOutputTokens,
      top_p: options.topP,
      top_k: options.topK,
      penalty_present: options.presencePenalty,
      penalty_freq: options.frequencyPenalty,
      stop: options.stopSequences,
      seed: options.seed,
    }

    if (options.responseFormat?.type === 'json') {
      completionOptions.response_format = {
        type: 'json_object',
        schema: options.responseFormat.schema,
      }
    }

    const stream = new ReadableStream<LanguageModelV2StreamPart>({
      start: async (controller) => {
        try {
          let textId = generateId()

          let state: LLMState = 'none' as LLMState

          controller.enqueue({
            type: 'stream-start',
            warnings: [],
          })

          const result = await context.completion(
            completionOptions,
            (tokenData: TokenData) => {
              const { token } = tokenData

              switch (token) {
                case START_OF_THINKING_PLACEHOLDER:
                  // start reasoning block
                  if (state === 'text') {
                    // finish text block
                    controller.enqueue({
                      type: 'text-end',
                      id: textId,
                    })
                  }

                  state = 'reasoning'
                  textId = generateId()

                  controller.enqueue({
                    type: 'reasoning-start',
                    id: textId,
                  })
                  break

                case END_OF_THINKING_PLACEHOLDER:
                  // finish reasoning block
                  if (state === 'reasoning') {
                    controller.enqueue({
                      type: 'reasoning-end',
                      id: textId,
                    })
                  }

                  state = 'none'
                  break

                default:
                  // process regular token

                  switch (state) {
                    case 'none':
                      // start text block
                      state = 'text'
                      textId = generateId()
                      controller.enqueue({
                        type: 'text-start',
                        id: textId,
                      })
                      controller.enqueue({
                        type: 'text-delta',
                        id: textId,
                        delta: token,
                      })
                      break

                    case 'text':
                      // continue text block
                      controller.enqueue({
                        type: 'text-delta',
                        id: textId,
                        delta: token,
                      })
                      break

                    case 'reasoning':
                      // continue reasoning block
                      controller.enqueue({
                        type: 'reasoning-delta',
                        id: textId,
                        delta: token,
                      })
                      break
                  }
              }
            }
          )

          if (state === 'text') {
            // finish text block
            controller.enqueue({
              type: 'text-end',
              id: textId,
            })
          }

          if (state === 'reasoning') {
            // finish reasoning block
            controller.enqueue({
              type: 'reasoning-end',
              id: textId,
            })
          }

          controller.enqueue({
            type: 'finish',
            finishReason: convertFinishReason(result),
            usage: {
              inputTokens: result.timings?.prompt_n || 0,
              outputTokens: result.timings?.predicted_n || 0,
              totalTokens:
                (result.timings?.prompt_n || 0) +
                (result.timings?.predicted_n || 0),
            },
            providerMetadata: {
              llama: {
                timings: result.timings,
              },
            },
          })

          controller.close()
        } catch (error) {
          controller.error(new Error(`Llama stream failed: ${error}`))
        }
      },
      cancel: async () => {
        await context.stopCompletion()
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

export interface LlamaEmbeddingOptions {
  /**
   * Normalize embeddings
   */
  normalize?: number
  /**
   * llama.rn context params passed to initLlama()
   */
  contextParams?: Partial<ContextParams>
}

/**
 * llama.rn Embedding Model for AI SDK
 */
export class LlamaEmbeddingModel implements EmbeddingModelV2<string> {
  readonly specificationVersion = 'v2'
  readonly provider = 'llama'
  readonly modelId: string

  get maxEmbeddingsPerCall(): number {
    return this.options.contextParams?.n_parallel ?? 8
  }
  get supportsParallelCalls(): boolean {
    return this.maxEmbeddingsPerCall > 0
  }

  private modelPath: string
  private options: LlamaEmbeddingOptions
  private context: LlamaContext | null = null

  /**
   * @param modelPath - Path to the model file (from downloadModel() or getModelPath())
   * @param options - Model configuration options
   */
  constructor(modelPath: string, options: LlamaEmbeddingOptions = {}) {
    this.modelPath = modelPath
    this.modelId = modelPath
    this.options = {
      normalize: -1,
      ...options,
      contextParams: {
        n_ctx: 2048,
        n_gpu_layers: 99,
        n_parallel: 8,
        embedding: true,
        embd_normalize: options.normalize ?? -1,
        ...options.contextParams,
      },
    }
  }

  /**
   * Initialize the model (load LlamaContext with embedding enabled)
   * @returns The initialized LlamaContext
   */
  async prepare(): Promise<LlamaContext> {
    if (this.context) {
      return this.context
    }

    this.context = await initLlama({
      model: this.modelPath,
      ...this.options.contextParams,
    })

    return this.context
  }

  /**
   * Get the underlying LlamaContext (for advanced usage)
   */
  getContext(): LlamaContext | null {
    return this.context
  }

  /**
   * Unload model from memory
   */
  async unload(): Promise<void> {
    if (this.context) {
      await this.context.release()
      this.context = null
    }
  }

  /**
   * Generate embeddings (AI SDK EmbeddingModelV2)
   */
  async doEmbed(options: {
    values: string[]
    abortSignal?: AbortSignal
    headers?: Record<string, string | undefined>
  }) {
    if (!this.context) {
      console.warn(
        '[llama] Model not prepared. Call prepare() ahead of time to optimize performance.'
      )
    }

    const context = this.context ?? (await this.prepare())

    const embeddings: number[][] = []
    const embeddingParams: EmbeddingParams = {
      embd_normalize: this.options.normalize,
    }

    // Process one at a time since maxEmbeddingsPerCall = 1
    for (const value of options.values) {
      if (options.abortSignal?.aborted) {
        throw new Error('Embedding generation was aborted')
      }

      const result: NativeEmbeddingResult = await context.embedding(
        value,
        embeddingParams
      )
      embeddings.push(result.embedding)
    }

    return {
      embeddings,
      usage: {
        tokens: options.values.reduce((acc, val) => acc + val.length, 0),
      },
    }
  }
}

/**
 * Configuration options for llama.rn speech model (vocoder-based TTS)
 */
export interface LlamaSpeechOptions {
  /** Path to vocoder model for TTS */
  vocoderPath?: string
  /** Batch size for vocoder processing */
  vocoderBatchSize?: number
  /** llama.rn context params passed to initLlama() */
  contextParams?: Partial<ContextParams>
}

/**
 * llama.rn Speech Model for AI SDK (using vocoder for TTS)
 */
export class LlamaSpeechModel implements SpeechModelV2 {
  readonly specificationVersion = 'v2'
  readonly provider = 'llama'
  readonly modelId: string

  private modelPath: string
  private options: LlamaSpeechOptions
  private context: LlamaContext | null = null
  private vocoderInitialized: boolean = false

  /**
   * @param modelPath - Path to the model file (from downloadModel() or getModelPath())
   * @param options - Model configuration options
   */
  constructor(modelPath: string, options: LlamaSpeechOptions = {}) {
    this.modelPath = modelPath
    this.modelId = modelPath
    this.options = {
      ...options,
      contextParams: {
        n_ctx: 2048,
        n_gpu_layers: 99,
        ...options.contextParams,
      },
    }
  }

  /**
   * Initialize the model and vocoder
   * @returns The initialized LlamaContext
   */
  async prepare(): Promise<LlamaContext> {
    if (this.context) {
      return this.context
    }

    this.context = await initLlama({
      model: this.modelPath,
      ...this.options.contextParams,
    })

    // Initialize vocoder if path provided
    if (this.options.vocoderPath) {
      await this.initializeVocoder()
    }

    return this.context
  }

  /**
   * Initialize vocoder for TTS
   */
  private async initializeVocoder(): Promise<void> {
    if (!this.context) {
      throw new Error('Context not initialized')
    }

    if (!this.options.vocoderPath) {
      throw new Error('Vocoder path not provided in options')
    }

    this.vocoderInitialized = await this.context.initVocoder({
      path: this.options.vocoderPath,
      n_batch: this.options.vocoderBatchSize,
    })

    if (!this.vocoderInitialized) {
      throw new Error('Failed to initialize vocoder')
    }
  }

  /**
   * Get the underlying LlamaContext (for advanced usage)
   */
  getContext(): LlamaContext | null {
    return this.context
  }

  /**
   * Unload model from memory
   */
  async unload(): Promise<void> {
    if (this.context) {
      if (this.vocoderInitialized) {
        await this.context.releaseVocoder()
        this.vocoderInitialized = false
      }
      await this.context.release()
      this.context = null
    }
  }

  /**
   * Generate speech audio (AI SDK SpeechModelV2)
   */
  async doGenerate(options: SpeechModelV2CallOptions) {
    if (!this.context) {
      console.warn(
        '[llama] Model not prepared. Call prepare() ahead of time to optimize performance.'
      )
    }

    const context = this.context ?? (await this.prepare())

    if (!this.vocoderInitialized) {
      throw new Error(
        'Vocoder not initialized. Provide vocoderPath in constructor options.'
      )
    }

    // Get formatted audio completion prompt
    const speaker = null // Can be extended to support different speakers
    const formatted = await context.getFormattedAudioCompletion(
      speaker,
      options.text
    )

    // Generate audio tokens via completion
    const completionResult = await context.completion({
      prompt: formatted.prompt,
      grammar: formatted.grammar,
      temperature: 0.8,
      n_predict: -1,
    })

    if (
      !completionResult.audio_tokens ||
      completionResult.audio_tokens.length === 0
    ) {
      throw new Error('No audio tokens generated')
    }

    // Decode audio tokens to PCM
    const audioData = await context.decodeAudioTokens(
      completionResult.audio_tokens
    )

    // Convert to Uint8Array
    const audio = new Uint8Array(audioData)

    return {
      audio,
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
      },
    }
  }
}

/**
 * Create a llama.rn provider with all model types
 */
export function createLlamaProvider() {
  const provider = function (modelPath: string, options?: LlamaModelOptions) {
    return provider.languageModel(modelPath, options)
  }

  /**
   * Create a language model instance
   * @param modelPath - Path to the model file (from downloadModel() or getModelPath())
   * @param options - Model configuration options
   */
  provider.languageModel = (
    modelPath: string,
    options: LlamaModelOptions = {}
  ): LlamaLanguageModel => {
    return new LlamaLanguageModel(modelPath, options)
  }

  /**
   * Create an embedding model instance
   * @param modelPath - Path to the model file (from downloadModel() or getModelPath())
   * @param options - Model configuration options
   */
  provider.textEmbeddingModel = (
    modelPath: string,
    options: LlamaEmbeddingOptions = {}
  ): LlamaEmbeddingModel => {
    return new LlamaEmbeddingModel(modelPath, options)
  }

  /**
   * Create a speech model instance
   * @param modelPath - Path to the model file (from downloadModel() or getModelPath())
   * @param options - Model configuration options (vocoderPath required)
   */
  provider.speechModel = (
    modelPath: string,
    options: LlamaSpeechOptions = {}
  ): LlamaSpeechModel => {
    if (!options.vocoderPath) {
      throw new Error(
        'vocoderPath is required in options for speech model. ' +
          'Provide the path to a vocoder model file.'
      )
    }
    return new LlamaSpeechModel(modelPath, options)
  }

  provider.imageModel = () => {
    throw new Error('Image generation models are not supported by llama.rn')
  }

  return provider
}

/**
 * Default llama.rn provider instance
 */
export const llama = createLlamaProvider()
