import type { TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'
import type { EventEmitter } from 'react-native/Libraries/Types/CodegenTypes'

export interface ModelConfig {
  model_id?: string
}

export interface Message {
  role: 'assistant' | 'system' | 'tool' | 'user'
  content: string
}

export interface GenerationOptions {
  temperature?: number
  maxTokens?: number
  topP?: number
  topK?: number
}

export interface DownloadProgress {
  status: string
}

export interface ChatUpdateEvent {
  content: string
}

export interface ChatCompleteEvent {}

export interface Spec extends TurboModule {
  getModel(name: string): Promise<ModelConfig>
  getModels(): Promise<ModelConfig[]>

  generateText(
    messages: Message[],
    options?: GenerationOptions
  ): Promise<string>
  streamText(messages: Message[], options?: GenerationOptions): Promise<string>

  downloadModel(modelId: string): Promise<string>
  removeModel(modelId: string): Promise<string>

  prepareModel(modelId: string): Promise<string>
  unloadModel(): Promise<string>

  onChatUpdate: EventEmitter<ChatUpdateEvent>
  onChatComplete: EventEmitter<ChatCompleteEvent>
  onDownloadProgress: EventEmitter<DownloadProgress>
}

export default TurboModuleRegistry.getEnforcing<Spec>('MLCEngine')
