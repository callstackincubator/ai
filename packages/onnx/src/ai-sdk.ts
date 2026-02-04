import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3Prompt,
  LanguageModelV3StreamPart,
} from '@ai-sdk/provider'
import { generateId } from '@ai-sdk/provider-utils'
import {
  AutoTokenizer,
  type PretrainedTokenizerOptions,
} from '@huggingface/transformers'
import {
  AISDKStorage,
  type DownloadProgress,
  type ModelInfo,
} from '@react-native-ai/common'
import {
  InferenceSession,
  OnnxModelOptions,
  Tensor,
} from 'onnxruntime-react-native'
import { Platform } from 'react-native'

export type { DownloadProgress, ModelInfo }

type LLMState = 'text' | 'reasoning' | 'none'

function prepareMessages(
  prompt: LanguageModelV3Prompt
): { role: string; content: string }[] {
  const messages: { role: string; content: string }[] = []

  for (const message of prompt) {
    let content = ''

    if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === 'text') {
          content += part.text
        }
      }
    } else if (typeof message.content === 'string') {
      content = message.content
    }

    messages.push({
      role: message.role,
      content,
    })
  }

  return messages
}

/**
 * Configuration options for @huggingface/transformers AutoTokenizer
 */
export interface TokenizerOptions extends PretrainedTokenizerOptions {
  /**
   * Model name to load pretrained tokenizer for
   */
  modelName: string
}

export interface ONNXModelConfig {
  eosID: number
  numKVHeads: number
  hiddenSize: number
  hiddenLayers: number
  numAttentionHeads: number
  KVShape: number[]
}

export type DType = `float${16 | 32}`

export type ONNXLanguageModelCustomOptions = {
  maxTokens?: number
}

export type ONNXLanguageModelOptions = ONNXLanguageModelCustomOptions & {
  sessionOptions: Partial<InferenceSession.SessionOptions>
  tokenizerOptions: PretrainedTokenizerOptions
}

/**
 * onnx-react-native Language Model for AI SDK
 */
export class ONNXLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3'
  readonly supportedUrls = {}
  readonly provider = 'onnx'

  protected storage = new AISDKStorage('onnx-models', 'onnx')
  protected session: InferenceSession | null = null
  protected tokenizer!: AutoTokenizer

  protected modelConfig: ONNXModelConfig | null = null

  protected KVCacheTensors: { [key: string]: Tensor } = {}
  protected emptyKVEntryFactory: () => Uint16Array | Uint32Array

  protected sessionOptions: Partial<InferenceSession.SessionOptions>
  protected tokenizerOptions: PretrainedTokenizerOptions
  protected customOptions: ONNXLanguageModelCustomOptions

  constructor(
    public readonly modelName: string,
    public readonly modelId: string,
    protected dtype: DType,
    {
      sessionOptions,
      tokenizerOptions,
      ...options
    }: ONNXLanguageModelOptions = {
      sessionOptions: {},
      tokenizerOptions: {},
    }
  ) {
    this.emptyKVEntryFactory = () =>
      this.dtype === 'float16' ? new Uint16Array() : new Uint32Array()
    this.sessionOptions = sessionOptions
    this.tokenizerOptions = tokenizerOptions
    this.customOptions = options
  }

  /**
   * Check if model is downloaded
   */
  async isDownloaded(): Promise<boolean> {
    return this.storage.isModelDownloaded(this.modelId)
  }

  /**
   * Download model from HuggingFace
   */
  async download(
    progressCallback?: (progress: DownloadProgress) => void
  ): Promise<void> {
    await this.storage.downloadModel(this.modelId, progressCallback)
  }

  /**
   * Initialize the model
   */
  async prepare(): Promise<void> {
    if (this.session) {
      return
    }

    this.tokenizer = AutoTokenizer.from_pretrained(
      this.modelName,
      this.tokenizerOptions
    )

    const modelPath = this.storage.getModelPath(this.modelId)
    const exists = await this.storage.isModelDownloaded(this.modelId)

    if (!exists) {
      throw new Error(
        `Model not downloaded. Call download() first. Model ID: ${this.modelId}`
      )
    }

    const { repo, filename } = this.storage.parseModelId(this.modelId)
    const modelConfigURL = this.storage.getHFURL(repo, 'config.json')

    const response = await fetch(modelConfigURL)
    const configJSON = await response.json()
    this.modelConfig = {
      eosID: configJSON.eos_token_id,
      numKVHeads: configJSON.num_key_value_heads,
      hiddenSize: configJSON.hidden_size,
      hiddenLayers: configJSON.num_hidden_layers,
      numAttentionHeads: configJSON.num_attention_heads,
      KVShape: [
        1,
        configJSON.num_key_value_heads,
        0,
        configJSON.hidden_size / configJSON.num_attention_heads,
      ],
    }

    const modelDataURL = this.storage.getHFURL(repo, `${filename}_data`)

    console.log(
      'TODO: providers are ',
      ONNXLanguageModel.getDefaultExecutionProviders()
    )

    this.session = await InferenceSession.create(modelPath, {
      executionProviders: ONNXLanguageModel.getDefaultExecutionProviders(),
      graphOptimizationLevel: 'all',
      externalData: [modelDataURL],
      ...this.sessionOptions,
    })

    // initialize KV cache tensors
    this.reinitializeKVCache()
  }

  // implementation of KV cache heavily inspired by https://github.com/daviddaytw/react-native-transformers/blob/main/src/models/base.tsx
  reinitializeKVCache() {
    if (!this.modelConfig) {
      throw new Error('Model not prepared. Call prepare() first.')
    }

    // dispose() tensors of the current cache
    for (const V of Object.values(this.KVCacheTensors)) {
      if (V?.location === 'gpu-buffer') {
        V.dispose()
      }
    }
    // clear the cache
    this.KVCacheTensors = {}

    // prefill the cache with empty tensors
    const empty = this.emptyKVEntryFactory()
    for (let i = 0; i < this.modelConfig.hiddenLayers; i++) {
      for (const KVKey of ['key', 'value'] as const) {
        this.KVCacheTensors[`past.${i}.${KVKey}`] = new Tensor(
          this.dtype,
          empty,
          this.modelConfig.KVShape
        )
      }
    }
  }

  // implementation of argmax courtesy of https://github.com/daviddaytw/react-native-transformers/blob/main/src/models/base.tsx
  protected argmax(t: Tensor): number {
    const arr = t.data
    const dims = t.dims

    if (!dims) {
      throw new Error('Tensor dimensions are undefined')
    }

    if (dims.length < 3) {
      throw new Error('Invalid tensor dimensions')
    }

    if ([dims[1], dims[2]].every((dim) => dim > 0)) {
      throw new Error('Tensor dimensions 2nd and 3rd must be greater than 0')
    }

    const start = dims[2] * (dims[1] - 1)
    let max = { value: arr[start], index: 0 }

    for (let i = 0; i < dims[2]; i++) {
      const val = arr[i + start]
      if (!isFinite(val as number)) {
        throw new Error('found infinitive in logits')
      }
      if (val !== undefined && max.value !== undefined && val > max.value) {
        max.value = val
        max.index = i
      }
    }

    return max.index
  }

  static getDefaultExecutionProviders(): InferenceSession.ExecutionProviderConfig[] {
    return [...(Platform.OS === 'ios' ? ['coreml'] : ['nnapi']), 'cpu']
  }

  /**
   * Get the underlying session (for advanced usage)
   */
  getContext(): InferenceSession | null {
    return this.session
  }

  /**
   * Unload model from memory
   */
  async unload(): Promise<void> {
    if (this.session) {
      await this.session.release()
      this.session = null
    }
  }

  /**
   * Remove model from disk
   */
  async remove(): Promise<void> {
    await this.unload()
    await this.storage.removeModel(this.modelId)
  }

  /**
   * Non-streaming text generation (AI SDK LanguageModelV3)
   */
  async doGenerate(options: LanguageModelV3CallOptions) {
    if (!this.session) {
      throw new Error('Model not prepared. Call prepare() first.')
    }

    const messages = prepareMessages(options.prompt)

    const completionOptions: Partial<CompletionParams> = {
      messages,
      temperature: options.temperature,
      n_predict: options.maxOutputTokens,
      top_p: options.topP,
      top_k: options.topK,
    }

    if (options.responseFormat?.type === 'json') {
      completionOptions.response_format = {
        type: 'json_object',
        schema: options.responseFormat.schema,
      }
    }

    console.log('[llama] Generating text (non-streaming)')

    const response = await this.context.completion(completionOptions)
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

    console.log('[llama] Generation complete:', {
      contentLength: textContent.length,
      finishReason: convertFinishReason(response),
    })

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
      ] as LanguageModelV3Content[],
      finishReason: convertFinishReason(response),
      usage: {
        inputTokens: response.timings?.prompt_n || 0,
        outputTokens: response.timings?.predicted_n || 0,
        totalTokens:
          (response.timings?.prompt_n || 0) +
          (response.timings?.predicted_n || 0),
      },
      warnings: [],
    }
  }

  /**
   * Streaming text generation (AI SDK LanguageModelV3)
   */
  async doStream(options: LanguageModelV3CallOptions) {
    if (!this.context) {
      throw new Error('Model not prepared. Call prepare() first.')
    }

    if (typeof ReadableStream === 'undefined') {
      throw new TypeError(
        'ReadableStream is not available in this environment. Please load a polyfill such as web-streams-polyfill.'
      )
    }

    const messages = prepareMessages(options.prompt)

    const completionOptions: Partial<CompletionParams> = {
      messages,
      temperature: options.temperature,
      n_predict: options.maxOutputTokens,
      top_p: options.topP,
      top_k: options.topK,
    }

    if (options.responseFormat?.type === 'json') {
      completionOptions.response_format = {
        type: 'json_object',
        schema: options.responseFormat.schema,
      }
    }

    console.log('[llama] Starting streaming generation')

    let streamFinished = false
    let isCancelled = false
    const context = this.context

    const stream = new ReadableStream<LanguageModelV3StreamPart>({
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
              if (streamFinished || isCancelled) {
                return
              }

              try {
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
              } catch (err) {
                console.error('[llama] Error in token callback:', err)
              }
            }
          )

          streamFinished = true

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

          if (isCancelled) {
            console.log('[llama] Stream was cancelled')
            return
          }

          try {
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
            console.log('[llama] Streaming complete')
          } catch (err) {
            console.error('[llama] Error closing stream:', err)
          }
        } catch (error) {
          console.error('[llama] Streaming error:', error)
          if (!isCancelled && !streamFinished) {
            try {
              controller.error(error)
            } catch (err) {
              console.error('[llama] Error reporting error:', err)
            }
          }
        }
      },
      cancel: async () => {
        console.log('[llama] Stream cancelled')
        isCancelled = true
        streamFinished = true
        try {
          await context.stopCompletion()
        } catch (error) {
          console.error('[llama] Error stopping completion:', error)
        }
      },
    })

    return {
      stream,
    }
  }
}

/**
 * Engine for managing onnx models (similar to MLCEngine)
 */
export class ONNXEngine {
  static storage = new AISDKStorage('onnx', 'onnx')

  /**
   * Get all downloaded models
   */
  static async getModels(): Promise<ModelInfo[]> {
    return ONNXEngine.storage.getDownloadedModels()
  }

  /**
   * Check if a specific model is downloaded
   */
  static async isDownloaded(modelId: string): Promise<boolean> {
    return ONNXEngine.storage.isModelDownloaded(modelId)
  }

  /**
   * Set custom storage path for models
   * Default: ${DocumentDir}/llama-models/
   */
  static setStoragePath(path: string): void {
    ONNXEngine.storage.setStoragePath(path)
  }
}

/**
 * onnx-react-native provider factory
 */
export const onnx = {
  /**
   * Create a language model instance
   */
  languageModel: (
    modelId: string,
    options: OnnxModelOptions = {},
    dtype: DType = 'float16'
  ): ONNXLanguageModel => {
    return new ONNXLanguageModel(modelId, options, dtype)
  },
}
