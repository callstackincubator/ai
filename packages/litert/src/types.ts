import type { LanguageModelV4, ProviderV4 } from '@ai-sdk/provider'

/** Where a model runs. `npu` needs a bundle compiled for the phone's chip. */
export type LiteRTBackendName = 'gpu' | 'cpu' | 'npu'

export interface LiteRTProgress {
  /** Download progress from 0 to 1. Undefined when the total size is unknown. */
  fraction?: number
}

export interface LiteRTPrepareOptions {
  onProgress?: (progress: LiteRTProgress) => void
  abortSignal?: AbortSignal
}

/** Settings for one model. They apply when the model loads. */
export interface LiteRTModelSettings {
  /**
   * Compute backend. Defaults to the bundle's preference, then the CPU.
   */
  backend?: LiteRTBackendName
  /** Tokens the conversation can hold: prompt, history and output together. */
  maxContextTokens?: number
  /** Sampling defaults, used when a call does not set its own. */
  temperature?: number
  topK?: number
  topP?: number
  /** Use the bundle's drafter for speculative decoding, if it has one. */
  speculativeDecoding?: boolean
  /** Hugging Face token of the user loading a gated or private model. */
  accessToken?: string
  /** The file's SHA-256 as lowercase hex, checked after the download. */
  sha256?: string
  /** Called while the model downloads, when it loads on the first call instead of through `prepare()`. */
  onProgress?: (progress: LiteRTProgress) => void
}

/** A language model that can also be downloaded, loaded and released ahead of a call. */
export interface LiteRTLanguageModel extends LanguageModelV4 {
  /** Download and load the model now, so the first call does not wait for it. */
  prepare(options?: LiteRTPrepareOptions): Promise<void>
  /** Free the engine's memory. The next call or `prepare()` loads the model again. */
  unload(): Promise<void>
}

export interface LiteRTProvider extends ProviderV4 {
  (modelId: string, settings?: LiteRTModelSettings): LiteRTLanguageModel
  languageModel(
    modelId: string,
    settings?: LiteRTModelSettings
  ): LiteRTLanguageModel
  /** Free every model this provider has loaded. */
  unloadAll(): Promise<void>
}

/** Key of the provider's entry in `providerMetadata`. */
export const PROVIDER_NAME = 'litert'

/** What each call reports in `providerMetadata.litert`. */
export interface LiteRTCallMetadata {
  /** The call continued the conversation already in the engine, so nothing was replayed. */
  continued: boolean
  /** The call reloaded the model because its sampling or tools changed. */
  reloaded: boolean
  /** Generated tokens per second, when the engine reports it. */
  tokensPerSecond?: number
  /** Milliseconds to the first generated token, when the engine reports it. */
  timeToFirstTokenMs?: number
}
