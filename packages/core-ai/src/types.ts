import type { CodegenTypes } from 'react-native'

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
  // -1 marks a dynamic dimension
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
  metadata?: CodegenTypes.UnsafeObject
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
  attachments?: CodegenTypes.UnsafeObject[]
  // Structured assistant and tool content replayed as transcript entries
  parts?: CodegenTypes.UnsafeObject[]
}

export interface CoreAIGenerationOptions {
  temperature?: number
  maxTokens?: number
  // JSON schema of the structured output
  schema?: CodegenTypes.UnsafeObject
  providerOptions?: { reasoningLevel?: CoreAIReasoningLevel }
}

// Foundation Models reasoning level. Core AI maps it to the chat template's
// thinking effort, and `none` turns thinking off
export type CoreAIReasoningLevel = 'none' | 'light' | 'moderate' | 'deep'

// Options under `providerOptions['core-ai']` of AI SDK calls
export interface CoreAIProviderOptions {
  reasoningLevel?: CoreAIReasoningLevel
}

export type CoreAIGenerationPart =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; id: string; text: string; signature?: string }
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

export interface CoreAIUsage {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningTokens: number
}

export interface CoreAIGenerationResult {
  content: CoreAIGenerationPart[]
  usage: CoreAIUsage
}

export interface CoreAIStreamUpdateEvent {
  streamId: string
  // Full response text so far
  content: string
  // Reasoning entries generated so far, sent when they change
  entries?: CodegenTypes.UnsafeObject[]
}

export interface CoreAIStreamCompleteEvent {
  streamId: string
  // CoreAIUsage of the response
  usage?: CodegenTypes.UnsafeObject
}

export interface CoreAIStreamErrorEvent {
  streamId: string
  code?: string
  error: string
}

export interface CoreAIEmbeddingResult {
  embeddings: number[][]
  metadata?: CodegenTypes.UnsafeObject
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
  metadata?: CodegenTypes.UnsafeObject
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
  metadata?: {
    count: number
    imageFormat: 'image/png'
    width: number
    height: number
  }
}

export type CoreAITensorDataType =
  | 'float32'
  | 'float16'
  | 'bfloat16'
  | 'float64'
  | 'int8'
  | 'int16'
  | 'int32'
  | 'int64'
  | 'uint8'
  | 'uint16'
  | 'uint32'
  | 'uint64'
  | 'bool'

// A tensor passed to or returned by `CoreAI.runRawFunction`. `data` holds the
// little-endian elements in row-major order as base64, which `createTensor`
// and `readTensor` convert from and to typed arrays
export interface CoreAITensor {
  dataType: CoreAITensorDataType
  shape: number[]
  data: string
}

// Options of `CoreAI.loadModel` for a model with the `raw` task
export interface CoreAIRawModelOptions {
  // The compute unit Core AI specializes the model for. `default` lets Core AI
  // pick, which is usually the Neural Engine
  computeUnits?: 'default' | 'cpu' | 'gpu' | 'neural-engine'
}

export interface CoreAIRawFunctionOptions {
  // `float32` (default) converts float16 and bfloat16 outputs to float32.
  // `native` returns them as they are, as the bits of each element
  outputDataType?: 'float32' | 'native'
}

export interface CoreAIRawFunctionResult {
  outputs: Record<string, CoreAITensor>
}

export interface CoreAITaskInput {
  imageUri?: string
  audioUri?: string
  text?: string
  values?: string[]
  data?: CodegenTypes.UnsafeObject
}

export interface CoreAITaskResult {
  task: CoreAIModelTask
  output: CodegenTypes.UnsafeObject
  metadata?: CodegenTypes.UnsafeObject
}

export interface CoreAICapabilities {
  isCoreAIRuntimeAvailable: boolean
  isCoreAILMAvailable: boolean
  isCoreAIDiffusionAvailable: boolean
  isCoreAISegmentationAvailable: boolean
  isCoreAIObjectDetectionAvailable: boolean
  isCoreAISpeechAvailable: boolean
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
