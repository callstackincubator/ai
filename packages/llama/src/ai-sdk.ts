import type {
  EmbeddingModelV4,
  EmbeddingModelV4CallOptions,
  EmbeddingModelV4Result,
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4FinishReason,
  LanguageModelV4StreamPart,
  RerankingModelV4,
  RerankingModelV4CallOptions,
  SharedV4Warning,
  SpeechModelV4,
  SpeechModelV4CallOptions,
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
  type TokenData,
} from 'llama.rn'

import {
  buildLlamaCompletionOptions,
  prepareMessagesWithMedia,
} from './completionOptions'
import { createLlamaStreamParser } from './streamParser'

function convertFinishReason(
  result: NativeCompletionResult
): LanguageModelV4FinishReason {
  let unified: LanguageModelV4FinishReason['unified'] = 'other'
  let raw: string | undefined

  if (result.stopped_eos) {
    unified = 'stop'
    raw = 'stopped_eos'
  } else if (result.stopped_word) {
    unified = 'stop'
    raw = 'stopped_word'
  } else if (result.stopped_limit) {
    unified = 'length'
    raw = 'stopped_limit'
  }

  return {
    unified,
    raw,
  }
}

/**
 * Stops the running completion when the call is aborted, so the native side
 * stops generating instead of running to completion in the background
 *
 * @returns A function that removes the abort listener
 */
function stopCompletionOnAbort(
  context: LlamaContext,
  abortSignal: AbortSignal | undefined
): () => void {
  const stop = () => {
    context.stopCompletion()
  }
  abortSignal?.addEventListener('abort', stop, { once: true })
  return () => abortSignal?.removeEventListener('abort', stop)
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

/**
 * llama.rn Language Model for AI SDK
 *
 * Supports multimodal (vision & audio) when projectorPath is provided
 *
 * @see https://github.com/mybigday/llama.rn
 */
export class LlamaLanguageModel implements LanguageModelV4 {
  readonly specificationVersion = 'v4'
  readonly provider = 'llama'
  readonly modelId: string

  private modelPath: string
  private options: LlamaModelOptions
  private context: LlamaContext | null = null
  private loading: Promise<LlamaContext> | null = null
  private multimodalInitialized: boolean = false
  private pendingCompletion: Promise<unknown> = Promise.resolve()

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
        // llama.rn's prefix cache for recurrent and hybrid models (e.g. Qwen3.5)
        // crashes natively on the completion after a tool call or structured
        // output, so it is off unless enabled explicitly
        state_cache_budget_mb: 0,
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

    // Loading a model twice at once crashes natively, so concurrent calls share
    // one load
    this.loading ??= this.load().finally(() => {
      this.loading = null
    })
    return this.loading
  }

  private async load(): Promise<LlamaContext> {
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
   * Count tokens in text with the model's tokenizer
   */
  async countTokens(text: string): Promise<number> {
    const context = this.context ?? (await this.prepare())
    const { tokens } = await context.tokenize(text)
    return tokens.length
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
    // A model that is still loading is released once it is loaded
    await this.loading?.catch(() => {})
    if (this.context) {
      // Releasing the context under a running completion crashes natively
      await this.context.stopCompletion()
      await this.pendingCompletion
      if (this.multimodalInitialized) {
        await this.context.releaseMultimodal()
        this.multimodalInitialized = false
      }
      await this.context.release()
      this.context = null
    }
  }

  /**
   * Runs completions on this model one at a time. An aborted completion keeps
   * running natively until stopCompletion() takes effect, and llama.rn rejects
   * a completion started while another one is in progress
   */
  private runCompletion(
    context: LlamaContext,
    params: Partial<CompletionParams>,
    abortSignal: AbortSignal | undefined,
    callback?: (tokenData: TokenData) => void
  ): Promise<NativeCompletionResult> {
    const completion = this.pendingCompletion.then(() => {
      const removeAbortListener = stopCompletionOnAbort(context, abortSignal)
      return context.completion(params, callback).finally(removeAbortListener)
    })
    this.pendingCompletion = completion.catch(() => {})
    return completion
  }

  /**
   * Non-streaming text generation (AI SDK LanguageModelV4)
   */
  async doGenerate(options: LanguageModelV4CallOptions) {
    if (!this.context) {
      console.warn(
        '[llama] Model not prepared. Call prepare() ahead of time to optimize performance.'
      )
    }

    const context = this.context ?? (await this.prepare())

    const messages = prepareMessagesWithMedia(options.prompt)

    const warnings: SharedV4Warning[] = []
    const completionOptions = buildLlamaCompletionOptions(options, messages, {
      contextSize: this.options.contextParams?.n_ctx,
      warnings,
    })

    const response = await this.runCompletion(
      context,
      completionOptions,
      options.abortSignal
    )
    let content: LanguageModelV4Content[] = []

    if (response.content) {
      content.push({
        type: 'text',
        text: response.content,
      })
    }

    if (response.reasoning_content) {
      content.push({
        type: 'reasoning',
        text: response.reasoning_content,
      })
    }

    if (response.tool_calls) {
      content.push(
        ...response.tool_calls.map((toolCall) => ({
          type: 'tool-call' as const,
          toolCallId: toolCall.id ?? generateId(),
          toolName: toolCall.function.name,
          input: toolCall.function.arguments,
        }))
      )
    }

    return {
      content,
      finishReason:
        response.tool_calls?.length > 0
          ? { unified: 'tool-calls' as const, raw: 'tool-calls' }
          : convertFinishReason(response),
      usage: {
        inputTokens: {
          total: response.timings?.prompt_n,
          noCache: undefined,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: response.timings?.predicted_n,
          text: undefined,
          reasoning: undefined,
        },
      },
      providerMetadata: {
        llama: {
          timings: response.timings,
        },
      },
      warnings,
    }
  }

  /**
   * Streaming text generation (AI SDK LanguageModelV4)
   */
  async doStream(options: LanguageModelV4CallOptions) {
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

    const messages = prepareMessagesWithMedia(options.prompt)

    const warnings: SharedV4Warning[] = []
    const completionOptions = buildLlamaCompletionOptions(options, messages, {
      contextSize: this.options.contextParams?.n_ctx,
      warnings,
    })

    const stream = new ReadableStream<LanguageModelV4StreamPart>({
      start: async (controller) => {
        try {
          const streamParser = createLlamaStreamParser({
            enqueue: (part) => controller.enqueue(part),
          })

          controller.enqueue({
            type: 'stream-start',
            warnings,
          })

          const result = await this.runCompletion(
            context,
            completionOptions,
            options.abortSignal,
            (tokenData) => {
              streamParser.processToken(tokenData)
            }
          )

          streamParser.finish()

          controller.enqueue({
            type: 'finish',
            finishReason:
              result.tool_calls?.length > 0
                ? { unified: 'tool-calls' as const, raw: 'tool-calls' }
                : convertFinishReason(result),
            usage: {
              inputTokens: {
                total: result.timings?.prompt_n,
                noCache: undefined,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: {
                total: result.timings?.predicted_n,
                text: undefined,
                reasoning: undefined,
              },
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
export class LlamaEmbeddingModel implements EmbeddingModelV4 {
  readonly specificationVersion = 'v4'
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
  private loading: Promise<LlamaContext> | null = null

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

    // Loading a model twice at once crashes natively, so concurrent calls share
    // one load
    this.loading ??= this.load().finally(() => {
      this.loading = null
    })
    return this.loading
  }

  private async load(): Promise<LlamaContext> {
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
    // A model that is still loading is released once it is loaded
    await this.loading?.catch(() => {})
    if (this.context) {
      await this.context.release()
      this.context = null
    }
  }

  /**
   * Generate embeddings (AI SDK EmbeddingModelV4)
   */
  async doEmbed(
    options: EmbeddingModelV4CallOptions
  ): Promise<EmbeddingModelV4Result> {
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
      warnings: [],
    }
  }
}

export interface LlamaRerankOptions {
  /**
   * Normalize scores (default: from model config)
   */
  normalize?: number
  /**
   * llama.rn context params passed to initLlama()
   */
  contextParams?: Partial<ContextParams>
}

/**
 * llama.rn Rerank Model for AI SDK
 *
 * Ranks documents based on their relevance to a query.
 * Useful for improving search results and implementing RAG systems.
 *
 * @see https://github.com/mybigday/llama.rn
 */
export class LlamaRerankModel implements RerankingModelV4 {
  readonly specificationVersion = 'v4'
  readonly provider = 'llama'
  readonly modelId: string

  private modelPath: string
  private options: LlamaRerankOptions
  private context: LlamaContext | null = null
  private loading: Promise<LlamaContext> | null = null

  /**
   * @param modelPath - Path to the reranker model file (from downloadModel() or getModelPath())
   * @param options - Model configuration options
   */
  constructor(modelPath: string, options: LlamaRerankOptions = {}) {
    this.modelPath = modelPath
    this.modelId = modelPath
    this.options = {
      normalize: options.normalize,
      ...options,
      contextParams: {
        n_ctx: 2048,
        n_gpu_layers: 99,
        embedding: true,
        pooling_type: 'rank',
        ...options.contextParams,
      },
    }
  }

  /**
   * Initialize the model (load LlamaContext with rank pooling enabled)
   * @returns The initialized LlamaContext
   */
  async prepare(): Promise<LlamaContext> {
    if (this.context) {
      return this.context
    }

    // Loading a model twice at once crashes natively, so concurrent calls share
    // one load
    this.loading ??= this.load().finally(() => {
      this.loading = null
    })
    return this.loading
  }

  private async load(): Promise<LlamaContext> {
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
    // A model that is still loading is released once it is loaded
    await this.loading?.catch(() => {})
    if (this.context) {
      await this.context.release()
      this.context = null
    }
  }

  /**
   * Rerank documents based on relevance to query (AI SDK RerankingModelV4)
   */
  async doRerank(options: RerankingModelV4CallOptions) {
    if (!this.context) {
      console.warn(
        '[llama] Model not prepared. Call prepare() ahead of time to optimize performance.'
      )
    }

    const context = this.context ?? (await this.prepare())

    // Convert documents to string array for llama.rn
    const documentStrings =
      options.documents.type === 'text'
        ? options.documents.values
        : options.documents.values.map((doc) => JSON.stringify(doc))

    const results = await context.rerank(options.query, documentStrings, {
      normalize: this.options.normalize,
    })

    // Map to AI SDK V3 format
    let ranking = results.map((result) => ({
      index: result.index,
      relevanceScore: result.score,
    }))

    // Apply topN filter if specified
    if (options.topN !== undefined && options.topN > 0) {
      ranking = ranking.slice(0, options.topN)
    }

    return {
      ranking,
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
export class LlamaSpeechModel implements SpeechModelV4 {
  readonly specificationVersion = 'v4'
  readonly provider = 'llama'
  readonly modelId: string

  private modelPath: string
  private options: LlamaSpeechOptions
  private context: LlamaContext | null = null
  private loading: Promise<LlamaContext> | null = null
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

    // Loading a model twice at once crashes natively, so concurrent calls share
    // one load
    this.loading ??= this.load().finally(() => {
      this.loading = null
    })
    return this.loading
  }

  private async load(): Promise<LlamaContext> {
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
    // A model that is still loading is released once it is loaded
    await this.loading?.catch(() => {})
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
   * Generate speech audio (AI SDK SpeechModelV4)
   */
  async doGenerate(options: SpeechModelV4CallOptions) {
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

    // todo: extend to support different speakers and settings
    const formatted = await context.getFormattedAudioCompletion({
      prompt: options.text,
    })

    const completionResult = await context.completion({
      prompt: formatted.prompt,
      grammar: formatted.grammar,
      temperature: 0.8,
    })

    if (!completionResult.audio_tokens) {
      throw new Error('No audio tokens generated')
    }

    const audioData = await context.decodeAudioTokens(
      completionResult.audio_tokens
    )

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

  provider.specificationVersion = 'v4' as const

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
  provider.embeddingModel = (
    modelPath: string,
    options: LlamaEmbeddingOptions = {}
  ): LlamaEmbeddingModel => {
    return new LlamaEmbeddingModel(modelPath, options)
  }

  /** @deprecated Use `embeddingModel` */
  provider.textEmbeddingModel = provider.embeddingModel

  /**
   * Create a rerank model instance for document ranking
   * @param modelPath - Path to a reranker model file (from downloadModel() or getModelPath())
   * @param options - Model configuration options
   */
  provider.rerankingModel = (
    modelPath: string,
    options: LlamaRerankOptions = {}
  ): LlamaRerankModel => {
    return new LlamaRerankModel(modelPath, options)
  }

  /** @deprecated Use `rerankingModel` */
  provider.rerankModel = provider.rerankingModel

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
