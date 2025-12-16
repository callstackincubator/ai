import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
} from '@ai-sdk/provider'
import { type ContextParams, initLlama, type LlamaContext } from 'llama.rn'

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

// Re-export types
export type { DownloadProgress, ModelInfo }

/**
 * Configuration for model context
 */
export interface LlamaRnModelOptions {
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
export const LlamaRnEngine = {
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
   * Default: ${DocumentDir}/llama-rn-models/
   */
  setStoragePath: (path: string): void => {
    setStoragePath(path)
  },
}

/**
 * llama.rn Language Model for AI SDK
 */
class LlamaRnLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2'
  readonly supportedUrls = {}
  readonly provider = 'llama-rn'
  readonly modelId: string

  private options: LlamaRnModelOptions
  private context: LlamaContext | null = null

  constructor(modelId: string, options: LlamaRnModelOptions = {}) {
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
      return // Already prepared
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
   * Non-streaming text generation
   *
   * TODO: Implement in Phase 2
   */
  async doGenerate(_options: LanguageModelV2CallOptions): Promise<any> {
    if (!this.context) {
      throw new Error('Model not prepared. Call prepare() first.')
    }
    // TODO: Implement using this.context.completion()
    throw new Error('doGenerate() not implemented yet. Coming in Phase 2.')
  }

  /**
   * Streaming text generation
   *
   * TODO: Implement in Phase 2
   */
  async doStream(_options: LanguageModelV2CallOptions): Promise<any> {
    if (!this.context) {
      throw new Error('Model not prepared. Call prepare() first.')
    }
    // TODO: Implement using this.context.completion() with callback
    throw new Error('doStream() not implemented yet. Coming in Phase 2.')
  }
}

/**
 * llama.rn provider factory (matching MLC pattern)
 */
export const llamaRn = {
  languageModel: (
    modelId: string,
    options: LlamaRnModelOptions = {}
  ): LlamaRnLanguageModel => {
    return new LlamaRnLanguageModel(modelId, options)
  },
}
