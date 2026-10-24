import type { CodegenTypes, TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'

export interface AppleMessage {
  role: 'assistant' | 'system' | 'tool' | 'user'
  content: string
  attachments?: CodegenTypes.UnsafeObject[]
}

export interface AppleGenerationOptions {
  temperature?: number
  maxTokens?: number
  topP?: number
  topK?: number
  schema?: CodegenTypes.UnsafeObject
  tools?: CodegenTypes.UnsafeObject
  providerOptions?: CodegenTypes.UnsafeObject
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
  getModelInfo(
    locale?: string,
    model?: string
  ): Promise<CodegenTypes.UnsafeObject>
  countTokens(text: string): Promise<number>
  generateImages(options: CodegenTypes.UnsafeObject): Promise<string[]>
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

  onStreamUpdate: CodegenTypes.EventEmitter<StreamUpdateEvent>
  onStreamComplete: CodegenTypes.EventEmitter<StreamCompleteEvent>
  onStreamError: CodegenTypes.EventEmitter<StreamErrorEvent>
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeAppleLLM')
