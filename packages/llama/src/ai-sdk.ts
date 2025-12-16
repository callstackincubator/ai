import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2FinishReason,
  LanguageModelV2Prompt,
  LanguageModelV2StreamPart,
} from '@ai-sdk/provider'
import {
  type CompletionParams,
  type ContextParams,
  initLlama,
  type LlamaContext,
  type NativeCompletionResult,
  type TokenData,
} from 'llama.rn'

import {
  downloadModel,
  type DownloadProgress,
  getDownloadedModels,
  getModelPath,
  isModelDownloaded,
  type ModelInfo,
  removeModel as removeModelFromStorage,
  setStoragePath,
} from './storage'

export type { DownloadProgress, ModelInfo }

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

function prepareMessages(
  prompt: LanguageModelV2Prompt
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
 * Configuration options for llama.rn model initialization
 */
export interface LlamaModelOptions {
  /** Context size (default: 2048) */
  n_ctx?: number
  /** Number of GPU layers (default: 99) */
  n_gpu_layers?: number
  /** Additional llama.rn context params */
  contextParams?: Partial<ContextParams>
}

/**
 * Engine for managing llama.rn models (similar to MLCEngine)
 */
export const LlamaEngine = {
  /**
   * Get all downloaded models
   */
  getModels: (): Promise<ModelInfo[]> => {
    return getDownloadedModels()
  },

  /**
   * Check if a specific model is downloaded
   */
  isDownloaded: (modelId: string): Promise<boolean> => {
    return isModelDownloaded(modelId)
  },

  /**
   * Set custom storage path for models
   * Default: ${DocumentDir}/llama-models/
   */
  setStoragePath: (path: string): void => {
    setStoragePath(path)
  },
}

/**
 * llama.rn Language Model for AI SDK
 */
export class LlamaLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2'
  readonly supportedUrls = {}
  readonly provider = 'llama'
  readonly modelId: string

  private options: LlamaModelOptions
  private context: LlamaContext | null = null

  constructor(modelId: string, options: LlamaModelOptions = {}) {
    this.modelId = modelId
    this.options = {
      n_ctx: 2048,
      n_gpu_layers: 99,
      ...options,
    }
  }

  /**
   * Check if model is downloaded
   */
  async isDownloaded(): Promise<boolean> {
    return isModelDownloaded(this.modelId)
  }

  /**
   * Download model from HuggingFace
   */
  async download(
    progressCallback?: (progress: DownloadProgress) => void
  ): Promise<void> {
    await downloadModel(this.modelId, progressCallback)
  }

  /**
   * Initialize the model (load LlamaContext)
   */
  async prepare(): Promise<void> {
    if (this.context) {
      return
    }

    const modelPath = getModelPath(this.modelId)
    const exists = await isModelDownloaded(this.modelId)

    if (!exists) {
      throw new Error(
        `Model not downloaded. Call download() first. Model ID: ${this.modelId}`
      )
    }

    this.context = await initLlama({
      model: modelPath,
      n_ctx: this.options.n_ctx,
      n_gpu_layers: this.options.n_gpu_layers,
      ...this.options.contextParams,
    })
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
   * Remove model from disk
   */
  async remove(): Promise<void> {
    await this.unload()
    await removeModelFromStorage(this.modelId)
  }

  /**
   * Non-streaming text generation (AI SDK LanguageModelV2)
   */
  async doGenerate(options: LanguageModelV2CallOptions) {
    if (!this.context) {
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

    const textContent = response.content || response.text || ''

    console.log('[llama] Generation complete:', {
      contentLength: textContent.length,
      finishReason: convertFinishReason(response),
    })

    return {
      content: [
        {
          type: 'text' as const,
          text: textContent,
        },
      ],
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
   * Streaming text generation (AI SDK LanguageModelV2)
   */
  async doStream(options: LanguageModelV2CallOptions) {
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

    const stream = new ReadableStream<LanguageModelV2StreamPart>({
      start: async (controller) => {
        try {
          const textId = `text-${Date.now()}`

          controller.enqueue({
            type: 'text-start',
            id: textId,
          })

          const result = await context.completion(
            completionOptions,
            (tokenData: TokenData) => {
              if (streamFinished || isCancelled) {
                return
              }

              try {
                const delta = tokenData.token || tokenData.content || ''

                if (delta) {
                  controller.enqueue({
                    type: 'text-delta',
                    id: textId,
                    delta,
                  })
                }
              } catch (err) {
                console.error('[llama] Error in token callback:', err)
              }
            }
          )

          streamFinished = true

          if (isCancelled) {
            console.log('[llama] Stream was cancelled')
            return
          }

          try {
            controller.enqueue({
              type: 'text-end',
              id: textId,
            })

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
 * llama.rn provider factory
 */
export const llama = {
  /**
   * Create a language model instance
   */
  languageModel: (
    modelId: string,
    options: LlamaModelOptions = {}
  ): LlamaLanguageModel => {
    return new LlamaLanguageModel(modelId, options)
  },
}
