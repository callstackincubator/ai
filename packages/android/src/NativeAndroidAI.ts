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
  /** `language`, `transcription`, `embedding` or a task name */
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

export interface NativeTaskOptions {
  /** Summarization: `article` or `conversation`. Proofreading: `keyboard` or `voice` */
  inputType?: string
  /** Summarization: `oneBullet`, `twoBullets` or `threeBullets`. Rewriting: the style */
  outputType?: string
  /** ISO 639-1 language code, such as en */
  language?: string
  /** Summarization: truncates input past the model's token limit */
  autoTruncate?: boolean
  /** Sends the text as it is generated as `text` stream events of the run */
  stream?: boolean
}

export interface Spec extends TurboModule {
  getModelInfo(model?: NanoModelConfig): Promise<NativeModelInfo>
  prepare(model?: NanoModelConfig): Promise<void>
  countTokens(text: string, model?: NanoModelConfig): Promise<number>

  generateText(
    runId: string,
    request: NativeGenerateRequest
  ): Promise<NativeGenerateResponse>
  streamText(streamId: string, request: NativeGenerateRequest): Promise<void>
  /** Cancels a `generateText`, `streamText`, `transcribe` or `runTask` run by its id */
  cancel(runId: string): void

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

  /** `summarization`, `proofreading`, `rewriting` or `imageDescription` */
  getTaskModelInfo(
    task: string,
    options: NativeTaskOptions
  ): Promise<NativeModelInfo>
  prepareTask(task: string, options: NativeTaskOptions): Promise<void>
  /**
   * Runs a task on text, or for image description on a file://, content:// or
   * base64 image. Resolves with its results, best first
   */
  runTask(
    runId: string,
    task: string,
    input: string,
    options: NativeTaskOptions
  ): Promise<string[]>

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
