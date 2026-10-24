import type { TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'
import type {
  EventEmitter,
  UnsafeObject,
} from 'react-native/Libraries/Types/CodegenTypes'

export interface NativeCoreAIModelConfig {
  id: string
  sourceType: string
  sourceUri?: string
  bundleName?: string
  bundleExtension?: string
  bundleSubdirectory?: string
  task?: string
  family?: string
  variant?: string
}

export interface CoreAIModelInfo {
  id?: string
  family?: string
  task: string
  platforms: string[]
  functions: UnsafeObject[]
  maxContextLength?: number
  modelSizeBytes?: number
  metadata?: UnsafeObject
}

export interface CoreAILoadedModel {
  modelHandle: string
  info: CoreAIModelInfo
}

export interface CoreAIMessage {
  role: 'assistant' | 'system' | 'tool' | 'user'
  content: string
}

export type CoreAIStreamUpdateEvent = {
  streamId: string
  content: string
}

export type CoreAIStreamCompleteEvent = {
  streamId: string
}

export type CoreAIStreamErrorEvent = {
  streamId: string
  code?: string
  error: string
}

export interface Spec extends TurboModule {
  getCapabilities(): Promise<UnsafeObject>

  inspectModel(config: NativeCoreAIModelConfig): Promise<CoreAIModelInfo>
  loadModel(
    config: NativeCoreAIModelConfig,
    options?: UnsafeObject
  ): Promise<CoreAILoadedModel>
  unloadModel(modelHandle: string): Promise<void>
  removeModel(config: NativeCoreAIModelConfig): Promise<void>
  specializeModel(
    config: NativeCoreAIModelConfig,
    options?: UnsafeObject
  ): Promise<CoreAIModelInfo>

  createLanguageSession(
    modelHandle: string,
    options?: UnsafeObject
  ): Promise<string>
  releaseLanguageSession(sessionHandle: string): Promise<void>
  respondToLanguageSession(
    sessionHandle: string,
    prompt: string,
    options?: UnsafeObject
  ): Promise<UnsafeObject[]>
  streamLanguageSession(
    streamId: string,
    sessionHandle: string,
    prompt: string,
    options?: UnsafeObject
  ): void

  generateText(
    config: NativeCoreAIModelConfig,
    messages: CoreAIMessage[],
    options?: UnsafeObject
  ): Promise<UnsafeObject[]>
  streamText(
    streamId: string,
    config: NativeCoreAIModelConfig,
    messages: CoreAIMessage[],
    options?: UnsafeObject
  ): void
  cancelStream(streamId: string): void

  embed(
    config: NativeCoreAIModelConfig,
    values: string[],
    options?: UnsafeObject
  ): Promise<UnsafeObject>
  transcribe(
    config: NativeCoreAIModelConfig,
    audioBase64: string,
    mediaType: string,
    options?: UnsafeObject
  ): Promise<UnsafeObject>
  generateImage(
    config: NativeCoreAIModelConfig,
    prompt: string,
    options?: UnsafeObject
  ): Promise<UnsafeObject>

  runTask(
    task: string,
    config: NativeCoreAIModelConfig,
    input: UnsafeObject,
    options?: UnsafeObject
  ): Promise<UnsafeObject>
  runRawFunction(
    modelHandle: string,
    functionName: string,
    inputs: UnsafeObject,
    options?: UnsafeObject
  ): Promise<UnsafeObject>

  onStreamUpdate: EventEmitter<CoreAIStreamUpdateEvent>
  onStreamComplete: EventEmitter<CoreAIStreamCompleteEvent>
  onStreamError: EventEmitter<CoreAIStreamErrorEvent>
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeCoreAI')
