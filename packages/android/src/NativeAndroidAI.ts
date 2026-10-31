import type { CodegenTypes, TurboModule } from 'react-native'
import { Platform, TurboModuleRegistry } from 'react-native'

import { AndroidAIErrorCodes, createAndroidAIError } from './errors'

/** Gemini Nano model selection, see ML Kit `ModelConfig` */
export interface NanoModelConfig {
  /** `stable` (default) or `preview`, which needs the AICore developer preview */
  releaseStage?: string
  /** `full` (default) favors quality, `fast` favors latency */
  preference?: string
}

/**
 * One part of a Gemini Nano message. `type` is `text`, `image`,
 * `functionCall` or `functionResponse`
 */
export interface NativeMessagePart {
  type: string
  text?: string
  /** Base64 image bytes */
  data?: string
  /** file:// or content:// image URI */
  uri?: string
  /** Function call id */
  id?: string
  /** Function name */
  name?: string
  /** Function call arguments or function response, as a JSON object */
  json?: string
}

export interface NativeMessage {
  /** `user` or `model` */
  role: string
  parts: NativeMessagePart[]
}

export interface NativeFunctionDeclaration {
  name: string
  description: string
  /** JSON Schema of the parameters */
  parameters: string
}

export interface NativeGenerateRequest {
  messages: NativeMessage[]
  systemInstruction?: string
  tools?: NativeFunctionDeclaration[]
  temperature?: number
  topK?: number
  seed?: number
  maxOutputTokens?: number
  enableThinking?: boolean
  model?: NanoModelConfig
}

export interface NativeFunctionCall {
  id: string
  name: string
  /** Arguments as a JSON object */
  arguments: string
}

export interface NativeGenerateResponse {
  text: string
  reasoning?: string
  functionCalls: NativeFunctionCall[]
  /** `STOP`, `MAX_TOKENS` or `OTHER` */
  finishReason?: string
}

export interface NativeModelInfo {
  availability: string
  baseModelName?: string
  contextSize?: number
  /** ML Kit features: systemPrompt, thinking, prefixCaching, structuredOutput, functionCalling */
  features?: string[]
}

export interface StreamEvent {
  streamId: string
  /** `text`, `reasoning`, `functionCall`, `finish` or `error` */
  type: string
  delta?: string
  functionCall?: NativeFunctionCall
  finishReason?: string
  error?: string
  code?: string
}

export interface DownloadProgressEvent {
  /** `language`, `transcription` or `embedding` */
  model: string
  /** `started`, `progress` or `completed` */
  phase: string
  bytesDownloaded?: number
  bytesToDownload?: number
}

export interface NativeTranscriptionOptions {
  /** BCP 47 locale, such as en-US */
  locale?: string
  /** `basic` or `advanced` */
  mode?: string
}

export interface NativeEmbeddingModelInfo {
  availability: string
  dimension?: number
  modelSignature?: string
}

export interface Spec extends TurboModule {
  /** Quick synchronous check, see `AndroidProvider.isAvailable` */
  isAvailable(model?: NanoModelConfig): boolean
  getModelInfo(model?: NanoModelConfig): Promise<NativeModelInfo>
  prepare(model?: NanoModelConfig): Promise<void>
  countTokens(text: string, model?: NanoModelConfig): Promise<number>

  generateText(
    runId: string,
    request: NativeGenerateRequest
  ): Promise<NativeGenerateResponse>
  streamText(streamId: string, request: NativeGenerateRequest): Promise<void>
  /** Cancels a `generateText`, `streamText` or `transcribe` run by its id */
  cancel(runId: string): void

  /** Quick synchronous check, see `AndroidTranscriptionModel.isAvailable` */
  isTranscriptionAvailable(options: NativeTranscriptionOptions): boolean
  getTranscriptionModelInfo(
    options: NativeTranscriptionOptions
  ): Promise<NativeModelInfo>
  prepareTranscription(options: NativeTranscriptionOptions): Promise<void>
  /** Transcribes a whole audio file (MP3, WAV, FLAC, M4A or OGG) */
  transcribe(
    runId: string,
    audio: string,
    options: NativeTranscriptionOptions
  ): Promise<string>

  getEmbeddingModelInfo(): Promise<NativeEmbeddingModelInfo>
  prepareEmbedding(): Promise<void>
  embed(values: string[], taskType?: string): Promise<number[][]>

  onStreamEvent: CodegenTypes.EventEmitter<StreamEvent>
  onDownloadProgress: CodegenTypes.EventEmitter<DownloadProgressEvent>
}

const NativeAndroidAI: Spec | null =
  Platform.OS === 'android'
    ? TurboModuleRegistry.getEnforcing<Spec>('AndroidAI')
    : null

export default NativeAndroidAI

export function getNativeAndroidAI(): Spec {
  if (!NativeAndroidAI) {
    throw createAndroidAIError(
      '@react-native-ai/android is only available on Android',
      AndroidAIErrorCodes.UnsupportedPlatform
    )
  }
  return NativeAndroidAI
}
