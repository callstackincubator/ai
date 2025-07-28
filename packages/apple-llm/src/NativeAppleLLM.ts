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

export interface AppleGenerationOptions {
  temperature?: number
  maxTokens?: number
  topP?: number
  topK?: number
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
  error: string
}

export interface Spec extends TurboModule {
  isAvailable(): boolean
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
    messages: AppleMessage[],
    options: AppleGenerationOptions
  ): string
  cancelStream(streamId: string): void

  onStreamUpdate: EventEmitter<StreamUpdateEvent>
  onStreamComplete: EventEmitter<StreamCompleteEvent>
  onStreamError: EventEmitter<StreamErrorEvent>

}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeAppleLLM')
