import type { CodegenTypes } from 'react-native'

export type CoreAIPlatform = 'iOS' | 'macOS'

export type CoreAIModelTask =
  | 'language'
  | 'embedding'
  | 'asr'
  | 'diffusion'
  | 'video-diffusion'
  | 'segmentation'
  | 'video-segmentation'
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

// Options of embedding calls, under `providerOptions['core-ai']` with the AI
// SDK
export interface CoreAIEmbeddingOptions {
  // See `CoreAIRawModelOptions`
  computeUnits?: CoreAIRawModelOptions['computeUnits']
  // Values embedded per model call, 16 by default
  batchSize?: number
  // The text function, `encode_text` (or `main`) by default
  textFunction?: string
  // The image function, `encode_image` (or `main`) by default
  imageFunction?: string
  // Per-channel RGB normalization of images, CLIP's by default
  mean?: [number, number, number]
  std?: [number, number, number]
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

// Options of `specializeModel`
export interface CoreAISpecializationOptions {
  // For tasks that take `computeUnits` (raw models, embeddings and the vision
  // tasks): the compute unit they will load the model with. Other tasks
  // specialize with the options their loader uses
  computeUnits?: CoreAIRawModelOptions['computeUnits']
  // `default` lets the system purge the specialized assets when it is low on
  // storage or the model changes. `persistent` keeps them until the next OS
  // update or until they are cleared
  persistence?: 'default' | 'persistent'
}

export interface CoreAIRawFunctionOptions {
  // `float32` (default) converts float16 and bfloat16 outputs to float32.
  // `native` returns them as they are, as the bits of each element
  outputDataType?: 'float32' | 'native'
}

export interface CoreAIRawFunctionResult {
  outputs: Record<string, CoreAITensor>
}

// Options of `CoreAI.runTask` for `super-resolution`, `classification` and
// `depth`, which run the `main` function of an .aimodel on the image
export interface CoreAIVisionTaskOptions {
  // See `CoreAIRawModelOptions`
  computeUnits?: CoreAIRawModelOptions['computeUnits']
  // The function to run, `main` by default
  functionName?: string
  // Per-channel RGB normalization for classification and depth, ImageNet's
  // by default
  mean?: [number, number, number]
  std?: [number, number, number]
  // Super-resolution: the largest tile, 256 px by default
  tileSize?: number
  // Super-resolution: the overlap between tiles, 16 px by default
  tileOverlap?: number
  // Classification: how many classes to return, 5 by default
  topK?: number
  // Classification: class names by logit index. Defaults to a labels.json
  // array next to the model
  labels?: string[]
  // Classification: false when the model returns probabilities already
  applySoftmax?: boolean
}

export interface CoreAISuperResolutionOutput {
  // Base64 PNG
  image: string
  width: number
  height: number
  scale: number
}

export interface CoreAIClassificationOutput {
  classifications: { index: number; label?: string; confidence: number }[]
}

export interface CoreAIDepthOutput {
  // Base64 grayscale PNG at the input image size, nearer is brighter
  image: string
  // Relative depth at the model resolution, smaller is nearer
  depth: CoreAITensor & { dataType: 'float32' }
  width: number
  height: number
  min: number
  max: number
}

// Options of `CoreAI.runTask('video-segmentation', ...)`
export interface CoreAIVideoSegmentationOptions {
  // Stops after this many frames
  maxFrames?: number
  // Also returns each object's mask as a base64 PNG, which is large
  includeMasks?: boolean
  // Also writes a copy of the video with the masks and boxes drawn on
  outputVideo?: boolean
  // Detection score an object needs to be tracked, 0.5 by default
  scoreThreshold?: number
  // Score a new detection needs to start a track, 0.7 by default
  newObjectThreshold?: number
  maxObjects?: number
}

export interface CoreAIVideoSegmentationOutput {
  frames: {
    frameIndex: number
    objects: {
      // Stays the same for an object across frames
      id: number
      prompt: string
      score: number
      box: { x: number; y: number; width: number; height: number }
      // With includeMasks: white where the object is, transparent elsewhere
      mask?: string
      maskWidth?: number
      maskHeight?: number
    }[]
  }[]
  // With outputVideo: file:// URL of the annotated MP4
  video?: string
}

export interface CoreAIVideoGenerationOptions {
  // Multiples of 16. Wan 2.1 defaults to 832x480
  width?: number
  height?: number
  // 4n + 1 frames: 17, 33, 49, 65 or 81 (the default)
  frameCount?: number
  // Seconds, rounded to the nearest 4n + 1 frames when frameCount is not set
  duration?: number
  // 16 by default
  fps?: number
  seed?: number
  negativePrompt?: string
  // Denoising steps, 50 by default
  stepCount?: number
  // 5 by default
  guidanceScale?: number
  // Skips the unconditional pass for this fraction of the last steps
  cfgCutoff?: number
  // Decodes in tiles of this many latent pixels, to lower peak memory
  vaeTileSize?: number
  // Loads each component only while it runs, true by default
  lazyModelLoading?: boolean
}

export interface CoreAIVideoGenerationResult {
  // Base64 MP4
  video: string
  mediaType: 'video/mp4'
  // file:// URL of the MP4 in the app's temporary directory
  uri: string
  width: number
  height: number
  frameCount: number
  fps: number
  seed: number
}

export interface CoreAITaskInput {
  imageUri?: string
  videoUri?: string
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

  isCoreAIVideoSegmentationAvailable: boolean
  isCoreAIVideoDiffusionAvailable: boolean
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
