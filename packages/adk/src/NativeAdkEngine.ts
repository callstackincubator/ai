import type { TurboModule } from 'react-native'
import { Platform, TurboModuleRegistry } from 'react-native'
import type { EventEmitter, UnsafeObject } from 'react-native/Libraries/Types/CodegenTypes'

export type AdkMessageRole = 'assistant' | 'system' | 'user'

export type AdkMessagePart =
  | { type: 'text'; text: string }
  | { type: 'file'; mimeType: string; data: string }

export interface AdkMessage {
  role: AdkMessageRole
  content?: string
  parts?: AdkMessagePart[]
}

export type AdkModelType = 'gemini' | 'genai-nano'

export interface AdkAgentConfig {
  name: string
  description?: string
  instruction?: string
  model: {
    type: AdkModelType
    name: string
    apiKey?: string
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
  parameters?: AdkToolParameter[]
}

export interface AdkResponseFormat {
  type: 'json'
  mimeType?: string
  schema: UnsafeObject
}

export interface AdkGenerationOptions {
  temperature?: number
  maxTokens?: number
  topP?: number
  topK?: number
  responseFormat?: AdkResponseFormat
}

export interface AdkUsageMetadata {
  promptTokenCount?: number
  candidatesTokenCount?: number
  totalTokenCount?: number
}

export interface AdkGeneratedMessage {
  role: AdkMessageRole
  content: string
  finishReason?: string
  usage?: AdkUsageMetadata
}

export interface StreamUpdateEvent {
  streamId: string
  delta: string
}

export interface StreamCompleteEvent {
  streamId: string
  finishReason?: string
  usage?: AdkUsageMetadata
}

export interface StreamErrorEvent {
  streamId: string
  error: string
}

export interface StreamToolCallEvent {
  streamId: string
  phase: 'start' | 'delta' | 'end'
  toolCallId: string
  toolName?: string
  inputDelta?: string
  input?: string
}

export interface ToolCallEvent {
  toolCallId: string
  toolId: string
  arguments: string
}

export interface Spec extends TurboModule {
  isAvailable(modelType: AdkModelType): Promise<boolean>
  isNanoSupported(): Promise<boolean>
  prepareNano(): Promise<void>

  generateText(
    messages: AdkMessage[],
    config: AdkAgentConfig,
    options?: AdkGenerationOptions,
    tools?: AdkTool[]
  ): Promise<AdkGeneratedMessage>

  streamText(
    messages: AdkMessage[],
    config: AdkAgentConfig,
    options?: AdkGenerationOptions,
    tools?: AdkTool[]
  ): Promise<string>

  cancelStream(streamId: string): Promise<void>
  submitToolResult(toolCallId: string, result: string): void

  onStreamUpdate: EventEmitter<StreamUpdateEvent>
  onStreamComplete: EventEmitter<StreamCompleteEvent>
  onStreamError: EventEmitter<StreamErrorEvent>
  onStreamToolCall: EventEmitter<StreamToolCallEvent>
  onToolCall: EventEmitter<ToolCallEvent>
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
    throw new Error(
      '@react-native-ai/adk is only available on Android. See https://developer.android.com/ai/adk'
    )
  }
  return NativeAdkEngine
}
