import type { TurboModule } from 'react-native'
import { Platform, TurboModuleRegistry } from 'react-native'
import type { EventEmitter } from 'react-native/Libraries/Types/CodegenTypes'

export type AdkMessageRole = 'assistant' | 'system' | 'user'

export interface AdkMessage {
  role: AdkMessageRole
  content: string
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

export interface AdkGenerationOptions {
  temperature?: number
  maxTokens?: number
  topP?: number
  topK?: number
}

export interface AdkGeneratedMessage {
  role: AdkMessageRole
  content: string
  finishReason?: string
}

export interface StreamUpdateEvent {
  streamId: string
  delta: string
}

export interface StreamCompleteEvent {
  streamId: string
  finishReason?: string
}

export interface StreamErrorEvent {
  streamId: string
  error: string
}

export interface ToolCallEvent {
  toolCallId: string
  toolId: string
  arguments: string
}

export interface Spec extends TurboModule {
  isAvailable(modelType: AdkModelType): Promise<boolean>
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
