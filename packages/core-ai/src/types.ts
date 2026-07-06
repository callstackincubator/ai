import type { UnsafeObject } from 'react-native/Libraries/Types/CodegenTypes'

export type CoreAIPlatform = 'iOS' | 'macOS'

export type CoreAIModelTask =
  | 'language'
  | 'embedding'
  | 'asr'
  | 'diffusion'
  | 'segmentation'
  | 'object-detection'
  | 'depth'
  | 'super-resolution'
  | 'classification'
  | 'encoding'
  | 'raw'
  | 'unknown'

export type CoreAIModelSource =
  | {
      type: 'file'
      uri: string
    }
  | {
      type: 'bundle'
      name: string
      extension?: string
      subdirectory?: string
    }

export interface CoreAIModelConfig {
  id: string
  source: CoreAIModelSource
  task?: CoreAIModelTask
  family?: string
  variant?: CoreAIPlatform
}

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

export interface CoreAITensorDescriptor {
  name?: string
  dataType?: string
  shape?: number[]
}

export interface CoreAIModelInfo {
  id?: string
  family?: string
  task: CoreAIModelTask
  platforms: CoreAIPlatform[]
  functions: {
    name: string
    inputs: CoreAITensorDescriptor[]
    outputs: CoreAITensorDescriptor[]
  }[]
  maxContextLength?: number
  modelSizeBytes?: number
  metadata?: UnsafeObject
}

export interface CoreAILoadedModel {
  modelHandle: string
  info: CoreAIModelInfo
}

export interface CoreAILanguageSession {
  sessionHandle: string
}

export interface CoreAIMessage {
  role: 'assistant' | 'system' | 'tool' | 'user'
  content: string
}

export interface CoreAIGenerationOptions {
  temperature?: number
  maxTokens?: number
  topP?: number
  topK?: number
  schema?: UnsafeObject
  tools?: UnsafeObject
}

export type CoreAIGenerationPart =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool-call'; toolName: string; input: string }
  | { type: 'tool-result'; toolName: string; output: string }

export interface CoreAIStreamUpdateEvent {
  streamId: string
  content: string
}

export interface CoreAIStreamCompleteEvent {
  streamId: string
}

export interface CoreAIStreamErrorEvent {
  streamId: string
  code?: string
  error: string
}

export interface CoreAIEmbeddingResult {
  embeddings: number[][]
  metadata?: UnsafeObject
}

export interface CoreAITranscriptionSegment {
  text: string
  startSecond: number
  endSecond: number
}

export interface CoreAITranscriptionResult {
  text: string
  segments: CoreAITranscriptionSegment[]
  language?: string
  durationInSeconds?: number
  metadata?: UnsafeObject
}

export interface CoreAIImageGenerationOptions {
  n?: number
  size?: `${number}x${number}`
  aspectRatio?: `${number}:${number}`
  negativePrompt?: string
  seed?: number
  stepCount?: number
  guidanceScale?: number
  schedulerType?: string
  decodeResolution?: 'auto' | 'full' | 'half' | 'tiled'
  strength?: number
  lazyModelLoading?: boolean
}

export interface CoreAIImageGenerationResult {
  images: string[]
  metadata?: UnsafeObject
}

export interface CoreAITaskInput {
  imageUri?: string
  audioUri?: string
  text?: string
  values?: string[]
  data?: UnsafeObject
}

export interface CoreAITaskResult {
  task: CoreAIModelTask
  output: UnsafeObject
  metadata?: UnsafeObject
}

export interface CoreAICapabilities {
  isCoreAIRuntimeAvailable: boolean
  isCoreAILMAvailable: boolean
  isCoreAIDiffusionAvailable: boolean
  isCoreAISegmentationAvailable: boolean
  isCoreAIObjectDetectionAvailable: boolean
  supportedPlatform: boolean
  missingProducts: string[]
}

export function toNativeModelConfig(
  config: CoreAIModelConfig
): NativeCoreAIModelConfig {
  if (config.source.type === 'file') {
    return {
      id: config.id,
      sourceType: 'file',
      sourceUri: config.source.uri,
      task: config.task,
      family: config.family,
      variant: config.variant,
    }
  }

  return {
    id: config.id,
    sourceType: 'bundle',
    bundleName: config.source.name,
    bundleExtension: config.source.extension,
    bundleSubdirectory: config.source.subdirectory,
    task: config.task,
    family: config.family,
    variant: config.variant,
  }
}
