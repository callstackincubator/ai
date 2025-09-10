import type { EventSubscription, TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'
import type { EventEmitter } from 'react-native/Libraries/Types/CodegenTypes'

export interface Model {
  modelId: string
  modelLib: string
}

export interface AiModelSettings {
  model_id?: string
}

export interface Message {
  role: 'assistant' | 'system' | 'tool' | 'user'
  content: string
}

export interface DownloadProgress {
  percentage: number
}

export interface ChatUpdateEvent {
  content: string
}

export interface ChatCompleteEvent {}

export interface Spec extends TurboModule {
  getModel(name: string): Promise<Model>
  getModels(): Promise<AiModelSettings[]>
  generateText(modelId: string, messages: Message[]): Promise<string>
  streamText(modelId: string, messages: Message[]): Promise<string>
  downloadModel(modelId: string): Promise<string>
  prepareModel(modelId: string): Promise<string>
  cleanDownloadedModel(modelId: string): Promise<string>
  unloadModel(): Promise<string>

  onChatUpdate: EventEmitter<ChatUpdateEvent>
  onChatComplete: EventEmitter<ChatCompleteEvent>
  onDownloadProgress: EventEmitter<DownloadProgress>
}

const NativeMLCEngine = TurboModuleRegistry.getEnforcing<Spec>('MLCEngine')

export async function downloadModel(
  modelId: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  const listeners: EventSubscription[] = [
    NativeMLCEngine.onDownloadProgress((event) => {
      onProgress?.(event)
    }),
  ]
  try {
    await NativeMLCEngine.downloadModel(modelId)
  } finally {
    listeners.forEach((listener) => listener.remove())
  }
}

export default NativeMLCEngine
