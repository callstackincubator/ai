import type { TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'
import type { EventEmitter } from 'react-native/Libraries/Types/CodegenTypes'

export interface ModelConfig {
  model_id?: string
}

type MessageRole = 'assistant' | 'system' | 'tool' | 'user'

export interface Message {
  role: MessageRole
  content: string
}

export interface CompletionUsageExtra {
  ttft_s: number
  prefill_tokens_per_s: number
  prompt_tokens: number
  jump_forward_tokens: number
  completion_tokens: number
  end_to_end_latency_s: number
  prefill_tokens: number
  inter_token_latency_s: number
  decode_tokens_per_s: number
  decode_tokens: number
}

export interface CompletionUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  extra: CompletionUsageExtra
}

export interface GeneratedMessage {
  role: MessageRole
  content: string
  tool_calls: ChatToolCall[]
  finish_reason: 'stop' | 'length' | 'tool_calls'
  usage: CompletionUsage
}

export interface ResponseFormat {
  type: 'json_object' | 'text'
  schema?: string
}

export interface ChatFunctionCall {
  name: string
  arguments?: Record<string, string>
}

export interface ChatToolCall {
  id: string
  type: string
  function: ChatFunctionCall
}

export interface ChatFunctionTool {
  name: string
  description?: string
  parameters: Record<string, string>
}

export interface ChatTool {
  type: 'function'
  function: ChatFunctionTool
}

export interface GenerationOptions {
  temperature?: number
  maxTokens?: number
  topP?: number
  topK?: number
  responseFormat?: ResponseFormat
  tools?: ChatTool[]
  toolChoice?: 'none' | 'auto'
}

export interface DownloadProgress {
  percentage: number
}

export interface ChatUpdateEvent {
  delta: {
    content: string
    role: MessageRole
  }
}

export interface ChatCompleteEvent {
  usage: CompletionUsage
  finish_reason: 'stop' | 'length' | 'tool_calls'
}

export interface Spec extends TurboModule {
  getModel(name: string): Promise<ModelConfig>
  getModels(): Promise<ModelConfig[]>

  generateText(
    messages: Message[],
    options?: GenerationOptions
  ): Promise<GeneratedMessage>

  streamText(messages: Message[], options?: GenerationOptions): Promise<string>
  cancelStream(streamId: string): Promise<void>

  downloadModel(modelId: string): Promise<void>
  removeModel(modelId: string): Promise<void>

  prepareModel(modelId: string): Promise<void>
  unloadModel(): Promise<void>

  onChatUpdate: EventEmitter<ChatUpdateEvent>
  onChatComplete: EventEmitter<ChatCompleteEvent>
  onDownloadProgress: EventEmitter<DownloadProgress>
}

export default TurboModuleRegistry.getEnforcing<Spec>('MediaPipeEngine')
