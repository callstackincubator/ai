import type { CodegenTypes, TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'

export interface AppleMessage {
  role: 'assistant' | 'system' | 'tool' | 'user'
  content: string
  attachments?: CodegenTypes.UnsafeObject[]
  // Structured assistant and tool content replayed as transcript entries
  parts?: CodegenTypes.UnsafeObject[]
}

export interface AppleGenerationOptions {
  temperature?: number
  maxTokens?: number
  topP?: number
  topK?: number
  schema?: CodegenTypes.UnsafeObject
  tools?: CodegenTypes.UnsafeObject
  toolCallingMode?: string
  providerOptions?: CodegenTypes.UnsafeObject
}

export type StreamUpdateEvent = {
  streamId: string
  content: string
  // Reasoning and tool parts generated so far (iOS 27), sent when they change
  entries?: CodegenTypes.UnsafeObject[]
}

// Token usage reported from iOS 27
export type AppleUsage = {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningTokens: number
}

export type StreamCompleteEvent = {
  streamId: string
  usage?: AppleUsage
}

export type StreamErrorEvent = {
  streamId: string
  code?: string
  error: string
}

export interface Spec extends TurboModule {
  isAvailable(): boolean
  getModelInfo(
    locale?: string,
    model?: string
  ): Promise<CodegenTypes.UnsafeObject>
  countTokens(text: string): Promise<number>
  generateImages(options: CodegenTypes.UnsafeObject): Promise<string[]>
  generateText(
    messages: AppleMessage[],
    options: AppleGenerationOptions
  ): Promise<{
    content: (
      | { type: 'text'; text: string }
      | {
          type: 'reasoning'
          id: string
          text: string
          signature?: string
        }
      | {
          type: 'tool-call'
          toolCallId: string
          toolName: string
          input: string
        }
      | {
          type: 'tool-result'
          toolCallId: string
          toolName: string
          output: string
        }
    )[]
    usage?: AppleUsage
  }>
  generateStream(
    streamId: string,
    messages: AppleMessage[],
    options: AppleGenerationOptions
  ): void
  cancelStream(streamId: string): void

  onStreamUpdate: CodegenTypes.EventEmitter<StreamUpdateEvent>
  onStreamComplete: CodegenTypes.EventEmitter<StreamCompleteEvent>
  onStreamError: CodegenTypes.EventEmitter<StreamErrorEvent>
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeAppleLLM')
