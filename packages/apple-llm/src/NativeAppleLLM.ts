import type { TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'
import type {
  EventEmitter,
  UnsafeObject,
} from 'react-native/Libraries/Types/CodegenTypesNamespace'

export interface AppleMessage {
  role: 'assistant' | 'system' | 'tool' | 'user'
  content: string
  attachments?: UnsafeObject[]
}

export interface AppleGenerationOptions {
  temperature?: number
  maxTokens?: number
  topP?: number
  topK?: number
  schema?: UnsafeObject
  tools?: UnsafeObject
  providerOptions?: UnsafeObject
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
  getModelInfo(locale?: string, model?: string): Promise<UnsafeObject>
  countTokens(text: string): Promise<number>
  generateImages(options: UnsafeObject): Promise<string[]>
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
