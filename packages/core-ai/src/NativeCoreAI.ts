import type { CodegenTypes, TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'

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
  functions: CodegenTypes.UnsafeObject[]
  maxContextLength?: number
  modelSizeBytes?: number
  metadata?: CodegenTypes.UnsafeObject
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
  getCapabilities(): Promise<CodegenTypes.UnsafeObject>

  inspectModel(config: NativeCoreAIModelConfig): Promise<CoreAIModelInfo>
  loadModel(
    config: NativeCoreAIModelConfig,
    options?: CodegenTypes.UnsafeObject
  ): Promise<CoreAILoadedModel>
  unloadModel(modelHandle: string): Promise<void>
  removeModel(config: NativeCoreAIModelConfig): Promise<void>
  specializeModel(
    config: NativeCoreAIModelConfig,
    options?: CodegenTypes.UnsafeObject
  ): Promise<CoreAIModelInfo>

  createLanguageSession(
    modelHandle: string,
    options?: CodegenTypes.UnsafeObject
  ): Promise<string>
  releaseLanguageSession(sessionHandle: string): Promise<void>
  respondToLanguageSession(
    sessionHandle: string,
    prompt: string,
    options?: CodegenTypes.UnsafeObject
  ): Promise<CodegenTypes.UnsafeObject[]>
  streamLanguageSession(
    streamId: string,
    sessionHandle: string,
    prompt: string,
    options?: CodegenTypes.UnsafeObject
  ): void

  generateText(
    config: NativeCoreAIModelConfig,
    messages: CoreAIMessage[],
    options?: CodegenTypes.UnsafeObject
  ): Promise<CodegenTypes.UnsafeObject[]>
  streamText(
    streamId: string,
    config: NativeCoreAIModelConfig,
    messages: CoreAIMessage[],
    options?: CodegenTypes.UnsafeObject
  ): void
  cancelStream(streamId: string): void

  embed(
    config: NativeCoreAIModelConfig,
    values: string[],
    options?: CodegenTypes.UnsafeObject
  ): Promise<CodegenTypes.UnsafeObject>
  transcribe(
    config: NativeCoreAIModelConfig,
    audioBase64: string,
    mediaType: string,
    options?: CodegenTypes.UnsafeObject
  ): Promise<CodegenTypes.UnsafeObject>
  generateImage(
    config: NativeCoreAIModelConfig,
    prompt: string,
    options?: CodegenTypes.UnsafeObject
  ): Promise<CodegenTypes.UnsafeObject>

  runTask(
    task: string,
    config: NativeCoreAIModelConfig,
    input: CodegenTypes.UnsafeObject,
    options?: CodegenTypes.UnsafeObject
  ): Promise<CodegenTypes.UnsafeObject>
  runRawFunction(
    modelHandle: string,
    functionName: string,
    inputs: CodegenTypes.UnsafeObject,
    options?: CodegenTypes.UnsafeObject
  ): Promise<CodegenTypes.UnsafeObject>

  onStreamUpdate: CodegenTypes.EventEmitter<CoreAIStreamUpdateEvent>
  onStreamComplete: CodegenTypes.EventEmitter<CoreAIStreamCompleteEvent>
  onStreamError: CodegenTypes.EventEmitter<CoreAIStreamErrorEvent>
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeCoreAI')
