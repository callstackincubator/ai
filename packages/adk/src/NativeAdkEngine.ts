import type { CodegenTypes, TurboModule } from 'react-native'
import { Platform, TurboModuleRegistry } from 'react-native'

export type AdkMessageRole = 'assistant' | 'system' | 'user'

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

export interface AdkToolParameter {
  name: string
  description?: string
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array'
  required?: boolean
}

export interface AdkTool {
  id: string
  name: string
  description: string
  inputSchema?: CodegenTypes.UnsafeObject
  parameters?: AdkToolParameter[]
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
  toolCallId: string
  toolId: string
  arguments: string
  streamId?: string
  runId?: string
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

  /** Cancels a stream or a `generateText` run by its id */
  cancelStream(streamId: string): Promise<void>
  submitToolResult(toolCallId: string, result: string): void

  onStreamUpdate: CodegenTypes.EventEmitter<StreamUpdateEvent>
  onStreamComplete: CodegenTypes.EventEmitter<StreamCompleteEvent>
  onStreamError: CodegenTypes.EventEmitter<StreamErrorEvent>
  onStreamToolCall: CodegenTypes.EventEmitter<StreamToolCallEvent>
  onToolCall: CodegenTypes.EventEmitter<ToolCallEvent>
  onNanoDownloadProgress: CodegenTypes.EventEmitter<NanoDownloadProgressEvent>
}

declare global {
  var __ADK_TOOLS__: Record<
    string,
    (args: string) => unknown | Promise<unknown>
  >
}

const NativeAdkEngine: Spec | null =
  Platform.OS === 'android'
    ? TurboModuleRegistry.getEnforcing<Spec>('AdkEngine')
    : null

export default NativeAdkEngine

export function getNativeAdkEngine(): Spec {
  if (!NativeAdkEngine) {
    const error = new Error(
      '@react-native-ai/adk is only available on Android. See https://developer.android.com/ai/adk'
    ) as Error & { code: string }
    error.code = 'UNSUPPORTED_PLATFORM'
    throw error
  }
  return NativeAdkEngine
}
