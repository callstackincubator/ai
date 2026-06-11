import type { TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'
import type {
  EventEmitter,
  UnsafeObject,
} from 'react-native/Libraries/Types/CodegenTypes'

export interface AppleMessage {
  role: 'assistant' | 'system' | 'tool' | 'user'
  content: string
}

export type AppleLanguageModelId = 'system-default' | 'private-cloud-compute'

export type AppleReasoningLevel = 'deep' | 'light' | 'moderate'

export interface AppleGenerationOptions {
  model?: AppleLanguageModelId
  temperature?: number
  maxTokens?: number
  topP?: number
  topK?: number
  reasoningLevel?: AppleReasoningLevel
  schema?: UnsafeObject
  tools?: UnsafeObject
}

export type StreamUpdateEvent = {
  streamId: string
  content: string
}

export type StreamCompleteEvent = {
  streamId: string
}

export type StreamErrorEvent = {
  streamId: string
  code?: string
  error: string
}

export interface Spec extends TurboModule {
  isAvailable(): boolean
  countTokens(text: string): Promise<number>
  generateText(
    messages: AppleMessage[],
    options: AppleGenerationOptions
  ): Promise<
    (
      | { type: 'text'; text: string }
      | {
          type: 'tool-call'
          toolName: string
          input: string
        }
      | {
          type: 'tool-result'
          toolName: string
          output: string
        }
    )[]
  >
  generateStream(
    streamId: string,
    messages: AppleMessage[],
    options: AppleGenerationOptions
  ): void
  cancelStream(streamId: string): void

  onStreamUpdate: EventEmitter<StreamUpdateEvent>
  onStreamComplete: EventEmitter<StreamCompleteEvent>
  onStreamError: EventEmitter<StreamErrorEvent>
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeAppleLLM')
