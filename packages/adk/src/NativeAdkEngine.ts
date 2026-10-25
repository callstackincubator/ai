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

export type AdkModelType = 'gemini' | 'genai-nano'

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
  model: {
    type: AdkModelType
    name: string
    apiKey?: string
    nano?: AdkNanoModelConfig
  }
}

export interface AdkTool {
  name: string
  description: string
  inputSchema?: CodegenTypes.UnsafeObject
}

export interface AdkResponseFormat {
  type: 'json'
  mimeType?: string
  schema?: CodegenTypes.UnsafeObject
}

export interface AdkGenerationOptions {
  temperature?: number
  maxTokens?: number
  topP?: number
  topK?: number
  seed?: number
  stopSequences?: string[]
  presencePenalty?: number
  frequencyPenalty?: number
  responseFormat?: AdkResponseFormat
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

export interface AdkToolCallRecord {
  toolCallId: string
  toolName: string
  input: string
}

export interface AdkToolResultRecord {
  toolCallId: string
  toolName: string
  output: string
}

export interface AdkGeneratedMessage {
  role: AdkMessageRole
  content: string
  reasoning?: string
  toolCalls?: AdkToolCallRecord[]
  toolResults?: AdkToolResultRecord[]
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

export interface StreamToolCallEvent {
  streamId: string
  phase: 'start' | 'delta' | 'end' | 'result'
  toolCallId: string
  toolName?: string
  inputDelta?: string
  input?: string
  output?: string
}

export interface ToolCallEvent {
  /** The `generateText` or `streamText` run that called the tool */
  runId: string
  toolCallId: string
  toolName: string
  arguments: string
}

export interface NanoDownloadProgressEvent {
  /** `started`, `progress` or `completed` */
  phase: string
  bytesDownloaded?: number
  bytesToDownload?: number
}

export interface Spec extends TurboModule {
  isAvailable(
    modelType: AdkModelType,
    nano?: AdkNanoModelConfig
  ): Promise<boolean>
  isNanoSupported(nano?: AdkNanoModelConfig): Promise<boolean>
  getModelInfo(
    modelType: AdkModelType,
    nano?: AdkNanoModelConfig
  ): Promise<AdkNativeModelInfo>
  prepareNano(nano?: AdkNanoModelConfig): Promise<void>
  countTokens(text: string, nano?: AdkNanoModelConfig): Promise<number>

  generateText(
    runId: string,
    messages: AdkMessage[],
    config: AdkAgentConfig,
    options?: AdkGenerationOptions,
    tools?: AdkTool[]
  ): Promise<AdkGeneratedMessage>

  streamText(
    streamId: string,
    messages: AdkMessage[],
    config: AdkAgentConfig,
    options?: AdkGenerationOptions,
    tools?: AdkTool[]
  ): Promise<void>

  /** Cancels a `streamText` or `generateText` run by its id */
  cancelStream(streamId: string): Promise<void>
  /** `result` is JSON */
  submitToolResult(runId: string, toolCallId: string, result: string): void

  onStreamUpdate: CodegenTypes.EventEmitter<StreamUpdateEvent>
  onStreamComplete: CodegenTypes.EventEmitter<StreamCompleteEvent>
  onStreamError: CodegenTypes.EventEmitter<StreamErrorEvent>
  onStreamToolCall: CodegenTypes.EventEmitter<StreamToolCallEvent>
  onToolCall: CodegenTypes.EventEmitter<ToolCallEvent>
  onNanoDownloadProgress: CodegenTypes.EventEmitter<NanoDownloadProgressEvent>
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
