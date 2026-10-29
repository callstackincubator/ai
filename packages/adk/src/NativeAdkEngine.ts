import type { CodegenTypes, TurboModule } from 'react-native'
import { Platform, TurboModuleRegistry } from 'react-native'

import { AdkErrorCodes, createAdkError } from './errors'

export type AdkMessageRole = 'assistant' | 'user'

export type AdkMessagePart =
  | { type: 'text'; text: string }
  | { type: 'file'; mimeType: string; data?: string; uri?: string }

export interface AdkMessage {
  role: AdkMessageRole
  content?: string
  parts?: AdkMessagePart[]
}

export interface AdkNanoModelConfig {
  /** `stable` (default) or `preview`, which needs the AICore developer preview */
  releaseStage?: 'stable' | 'preview'
  /** `fast` favors latency, `full` favors quality */
  preference?: 'fast' | 'full'
}

export interface AdkAgentConfig {
  name: string
  description?: string
  instruction?: string
  nano?: AdkNanoModelConfig
}

export interface AdkGenerationOptions {
  temperature?: number
  maxTokens?: number
  topK?: number
  /** Thinking on/off with an optional budget. Gemini Nano only supports on/off */
  thinking?: {
    includeThoughts: boolean
    budget?: number
  }
}

export interface AdkUsageMetadata {
  promptTokenCount?: number
  candidatesTokenCount?: number
  totalTokenCount?: number
  thoughtsTokenCount?: number
  cachedContentTokenCount?: number
}

export interface AdkGeneratedMessage {
  role: AdkMessageRole
  content: string
  reasoning?: string
  finishReason?: string
  usage?: AdkUsageMetadata
}

export interface AdkNativeModelInfo {
  availability: string
  baseModelName?: string
  contextSize?: number
}

export interface StreamUpdateEvent {
  streamId: string
  delta: string
  /** `text` (default) or `reasoning` */
  kind?: string
}

export interface StreamCompleteEvent {
  streamId: string
  finishReason?: string
  usage?: AdkUsageMetadata
}

export interface StreamErrorEvent {
  streamId: string
  error: string
  code?: string
}

export interface NanoDownloadProgressEvent {
  /** `started`, `progress` or `completed` */
  phase: string
  bytesDownloaded?: number
  bytesToDownload?: number
}

export interface AdkTranscriptionConfig {
  /** BCP 47 locale such as `en-US`. Defaults to the device locale */
  language?: string
  /** `basic` (default) or `advanced`, which uses a GenAI model on supported devices */
  mode?: 'basic' | 'advanced'
}

export interface AdkTranscriptionResult {
  text: string
}

export interface Spec extends TurboModule {
  getModelInfo(nano?: AdkNanoModelConfig): Promise<AdkNativeModelInfo>
  prepareNano(nano?: AdkNanoModelConfig): Promise<void>
  countTokens(text: string, nano?: AdkNanoModelConfig): Promise<number>

  generateText(
    runId: string,
    messages: AdkMessage[],
    config: AdkAgentConfig,
    options?: AdkGenerationOptions
  ): Promise<AdkGeneratedMessage>

  streamText(
    streamId: string,
    messages: AdkMessage[],
    config: AdkAgentConfig,
    options?: AdkGenerationOptions
  ): Promise<void>

  getTranscriptionAvailability(config?: AdkTranscriptionConfig): Promise<string>
  prepareTranscription(config?: AdkTranscriptionConfig): Promise<void>
  /** Transcribes base64-encoded audio in any format Android can decode */
  transcribe(
    requestId: string,
    audio: string,
    config?: AdkTranscriptionConfig
  ): Promise<AdkTranscriptionResult>

  /** Cancels a stream, a `generateText` run or a transcription by its id */
  cancelStream(streamId: string): Promise<void>

  onStreamUpdate: CodegenTypes.EventEmitter<StreamUpdateEvent>
  onStreamComplete: CodegenTypes.EventEmitter<StreamCompleteEvent>
  onStreamError: CodegenTypes.EventEmitter<StreamErrorEvent>
  onNanoDownloadProgress: CodegenTypes.EventEmitter<NanoDownloadProgressEvent>
  onTranscriptionDownloadProgress: CodegenTypes.EventEmitter<NanoDownloadProgressEvent>
}

const NativeAdkEngine: Spec | null =
  Platform.OS === 'android'
    ? TurboModuleRegistry.getEnforcing<Spec>('AdkEngine')
    : null

export default NativeAdkEngine

export function getNativeAdkEngine(): Spec {
  if (!NativeAdkEngine) {
    throw createAdkError(
      '@react-native-ai/adk is only available on Android. See https://developer.android.com/ai/adk',
      AdkErrorCodes.UnsupportedPlatform
    )
  }
  return NativeAdkEngine
}
