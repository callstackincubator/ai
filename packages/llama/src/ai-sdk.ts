import type {
  EmbeddingModelV3,
  EmbeddingModelV3CallOptions,
  EmbeddingModelV3Result,
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3FinishReason,
  LanguageModelV3Prompt,
  LanguageModelV3StreamPart,
  RerankingModelV3,
  RerankingModelV3CallOptions,
  SpeechModelV3,
  SpeechModelV3CallOptions,
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

type LLMState = 'text' | 'reasoning' | 'tool-call' | 'none'

interface LLMMessagePart {
  type: 'text' | 'image_url' | 'input_audio'
  text?: string
  image_url?: { url: string }
  input_audio?:
    | { format: string; data: string }
    | { format: string; url: string }
}

// Taken from https://github.com/mybigday/llama.rn/blob/main/example/src/utils/llmMessages.ts
interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | LLMMessagePart[]
  reasoning_content?: string
  tool_call_id?: string
  tool_calls?: any[]
}

function convertFinishReason(
  result: NativeCompletionResult
): LanguageModelV3FinishReason {
  let unified: LanguageModelV3FinishReason['unified'] = 'other'
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
function prepareMessagesWithMedia(prompt: LanguageModelV3Prompt): LLMMessage[] {
  const messages: LLMMessage[] = []

  type PromptPart = Extract<
    LanguageModelV3Prompt[number],
    { content: unknown[] }
  >['content'][number]

  const convertFilePartToMedia = (
    part: Extract<PromptPart, { type: 'file' }>
  ): LLMMessagePart => {
    const mediaType = part.mediaType.toLowerCase()
    const data = part.data as unknown

    const url =
      data instanceof Uint8Array
        ? `data:${part.mediaType};base64,${uint8ArrayToBase64(data)}`
        : data instanceof URL
          ? data.toString()
          : typeof data === 'string'
            ? data
            : null

    if (!url) {
      return { type: 'text', text: '' }
    }

    if (mediaType.startsWith('image/')) {
      return { type: 'image_url', image_url: { url } }
    }

    if (mediaType.startsWith('audio/')) {
      const format = mediaType.includes('wav') ? 'wav' : 'mp3'
      if (url.startsWith('data:')) {
        return {
          type: 'input_audio',
          input_audio: {
            format,
            data: url,
          },
        }
      }
      return {
        type: 'input_audio',
        input_audio: {
          format,
          url,
        },
      }
    }

    return { type: 'text', text: '' }
  }

  for (const message of prompt) {
    switch (message.role) {
      case 'system':
      case 'user':
        if (typeof message.content === 'string') {
          messages.push({ role: message.role, content: message.content })
        } else {
          for (const part of message.content) {
            switch (part.type) {
              case 'text':
                messages.push({ role: message.role, content: part.text })
                break
              case 'file':
                messages.push({
                  role: message.role,
                  content: [convertFilePartToMedia(part)],
                })
                break
              default:
                throw new Error(
                  `Unsupported message content type: ${JSON.stringify(part)}`
                )
            }
          }
        }
        break
      case 'assistant': {
        const reasoningContent = message.content.find(
          (part) => part.type === 'reasoning'
        )
        const toolCalls = message.content.filter(
          (part) => part.type === 'tool-call'
        )
        const content = message.content.filter(
          (message) => message.type === 'text'
        )
        messages.push({
          role: 'assistant',
          content,
          reasoning_content: reasoningContent?.text,
          tool_calls: toolCalls.map((toolCall) => ({
            type: 'function',
            id: toolCall.toolCallId,
            function: {
              name: toolCall.toolName,
              arguments: JSON.stringify(toolCall.input),
            },
          })),
        })
        const toolResults = message.content.filter(
          (part) => part.type === 'tool-result'
        )
        if (toolResults.length > 0) {
          throw new Error('Model executed tools are not supported.')
        }
        break
      }
      case 'tool': {
        const toolResults = message.content.filter(
          (part) => part.type === 'tool-result'
        )
        for (const toolResult of toolResults) {
          messages.push({
            role: 'tool',
            tool_call_id: toolResult.toolCallId,
            content:
              toolResult.output.type === 'execution-denied'
                ? (toolResult.output.reason ?? 'Execution denied')
                : JSON.stringify(toolResult.output.value),
          })
        }
        break
      }
    }
  }

  return messages
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

const START_OF_TOOL_CALL_PLACEHOLDER = '<tool_call>'
const END_OF_TOOL_CALL_PLACEHOLDER = '</tool_call>'

/**
 * llama.rn Language Model for AI SDK
 *
 * Supports multimodal (vision & audio) when projectorPath is provided
 *
 * @see https://github.com/mybigday/llama.rn
 */
export class LlamaLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3'
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
   * Non-streaming text generation (AI SDK LanguageModelV3)
   */
  async doGenerate(options: LanguageModelV3CallOptions) {
    if (!this.context) {
      console.warn(
        '[llama] Model not prepared. Call prepare() ahead of time to optimize performance.'
      )
    }

    const context = this.context ?? (await this.prepare())

    const messages = prepareMessagesWithMedia(options.prompt)

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
      reasoning_format: 'auto',
    }

    if (options.responseFormat?.type === 'json') {
      completionOptions.response_format = {
        type: 'json_object',
        schema: options.responseFormat.schema,
      }
    }

    if (options.tools) {
      completionOptions.tools = options.tools.map(({ type, ...tool }) => ({
        type,
        function: tool,
      }))
      completionOptions.tool_choice = options.toolChoice?.type ?? 'auto'
    }

    const response = await context.completion(completionOptions)
    let content: LanguageModelV3Content[] = []

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
      finishReason: response.tool_calls
        ? { unified: 'tool-calls' as const, raw: 'tool-calls' }
        : convertFinishReason(response),
      usage: {
        inputTokens: {
          total: response.timings?.prompt_n || 0,
          noCache: undefined,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: response.timings?.predicted_n || 0,
          text: undefined,
          reasoning: undefined,
        },
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
   * Streaming text generation (AI SDK LanguageModelV3)
   */
  async doStream(options: LanguageModelV3CallOptions) {
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

    if (options.tools) {
      completionOptions.tools = options.tools.map(({ type, ...tool }) => ({
        type,
        function: tool,
      }))
      completionOptions.tool_choice = options.toolChoice?.type ?? 'auto'
    }

    if (options.responseFormat?.type === 'json') {
      completionOptions.response_format = {
        type: 'json_object',
        schema: options.responseFormat.schema,
      }
    }

    const stream = new ReadableStream<LanguageModelV3StreamPart>({
      start: async (controller) => {
        try {
          let currentChunkId = generateId()

          let state: LLMState = 'none' as LLMState

          controller.enqueue({
            type: 'stream-start',
            warnings: [],
          })

          const finishCurrentBlock = () => {
            if (state === 'text') {
              controller.enqueue({
                type: 'text-end',
                id: currentChunkId,
              })
            }
            if (state === 'reasoning') {
              controller.enqueue({
                type: 'reasoning-end',
                id: currentChunkId,
              })
            }
            state = 'none'
          }

          const result = await context.completion(
            completionOptions,
            (tokenData: TokenData) => {
              const { token } = tokenData

              switch (token) {
                case START_OF_THINKING_PLACEHOLDER: {
                  finishCurrentBlock()
                  state = 'reasoning'
                  currentChunkId = generateId()
                  controller.enqueue({
                    type: 'reasoning-start',
                    id: currentChunkId,
                  })
                  break
                }
                case START_OF_TOOL_CALL_PLACEHOLDER: {
                  finishCurrentBlock()
                  state = 'tool-call'
                  break
                }
                case END_OF_TOOL_CALL_PLACEHOLDER: {
                  finishCurrentBlock()
                  for (const toolCall of tokenData.tool_calls ?? []) {
                    controller.enqueue({
                      type: 'tool-call',
                      toolCallId: toolCall.id ?? generateId(),
                      toolName: toolCall.function.name,
                      input: toolCall.function.arguments,
                    })
                  }
                  break
                }
                case END_OF_THINKING_PLACEHOLDER: {
                  finishCurrentBlock()
                  break
                }
                default:
                  switch (state) {
                    case 'none': {
                      state = 'text'
                      currentChunkId = generateId()
                      controller.enqueue({
                        type: 'text-start',
                        id: currentChunkId,
                      })
                      controller.enqueue({
                        type: 'text-delta',
                        id: currentChunkId,
                        delta: token,
                      })
                      break
                    }
                    case 'text': {
                      controller.enqueue({
                        type: 'text-delta',
                        id: currentChunkId,
                        delta: token,
                      })
                      break
                    }
                    case 'reasoning': {
                      controller.enqueue({
                        type: 'reasoning-delta',
                        id: currentChunkId,
                        delta: token,
                      })
                      break
                    }
                  }
              }
            }
          )

          finishCurrentBlock()

          controller.enqueue({
            type: 'finish',
            finishReason:
              result.tool_calls?.length > 0
                ? { unified: 'tool-calls' as const, raw: 'tool-calls' }
                : convertFinishReason(result),
            usage: {
              inputTokens: {
                total: result.timings?.prompt_n || 0,
                noCache: undefined,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: {
                total: result.timings?.predicted_n || 0,
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
export class LlamaEmbeddingModel implements EmbeddingModelV3 {
  readonly specificationVersion = 'v3'
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
   * Generate embeddings (AI SDK EmbeddingModelV3)
   */
  async doEmbed(
    options: EmbeddingModelV3CallOptions
  ): Promise<EmbeddingModelV3Result> {
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
export class LlamaRerankModel implements RerankingModelV3 {
  readonly specificationVersion = 'v3'
  readonly provider = 'llama'
  readonly modelId: string

  private modelPath: string
  private options: LlamaRerankOptions
  private context: LlamaContext | null = null

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
   * Rerank documents based on relevance to query (AI SDK RerankingModelV3)
   */
  async doRerank(options: RerankingModelV3CallOptions) {
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
export class LlamaSpeechModel implements SpeechModelV3 {
  readonly specificationVersion = 'v3'
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
   * Generate speech audio (AI SDK SpeechModelV3)
   */
  async doGenerate(options: SpeechModelV3CallOptions) {
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

    const speaker = null // todo: extend to support different speakers and settings
    const formatted = await context.getFormattedAudioCompletion(
      speaker,
      options.text
    )

    const guideTokens: number[] = await context.getAudioCompletionGuideTokens(
      options.text
    )

    const completionResult = await context.completion({
      prompt: formatted.prompt,
      grammar: formatted.grammar,
      guide_tokens: guideTokens,
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
   * Create a rerank model instance for document ranking
   * @param modelPath - Path to a reranker model file (from downloadModel() or getModelPath())
   * @param options - Model configuration options
   */
  provider.rerankModel = (
    modelPath: string,
    options: LlamaRerankOptions = {}
  ): LlamaRerankModel => {
    return new LlamaRerankModel(modelPath, options)
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
