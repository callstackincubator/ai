export type {
  AppleBuiltInTool,
  AppleGuardrails,
  AppleImageModelOptions,
  AppleImagePersonalization,
  AppleImageStyle,
  AppleLanguageModel,
  AppleLanguageModelId,
  AppleLanguageModelOptions,
  AppleModelAvailability,
  AppleModelInfo,
  AppleProviderOptions,
  AppleQuotaInfo,
  AppleReasoningLevel,
  AppleToolDefinitionSet,
  AppleUseCase,
} from './ai-sdk'
export { apple, createAppleProvider } from './ai-sdk'
// Foundation Models helpers shared with @react-native-ai/core-ai, whose language
// models run through the same LanguageModelSession. Not a stable public API
export type { AppleStreamEntry } from './ai-sdk'
export {
  createSnapshotStreamHandler,
  prepareAppleMessages,
  toAppleReasoningLevel,
} from './ai-sdk'
export type { AppleLLMError, AppleLLMErrorCode } from './errors'
export { AppleLLMErrorCodes } from './errors'
export type {
  AppleEmbeddingModelInfo,
  EmbeddingInfo,
} from './NativeAppleEmbeddings'
export { default as AppleEmbeddings } from './NativeAppleEmbeddings'
export { default as AppleFoundationModels } from './NativeAppleLLM'
export type {
  PersonalVoiceAuthorizationStatus,
  VoiceInfo,
} from './NativeAppleSpeech'
export { default as AppleSpeech } from './NativeAppleSpeech'
export type { AppleTranscriptionModelInfo } from './NativeAppleTranscription'
export type {
  LiveTranscription,
  LiveTranscriptionOptions,
  LiveTranscriptionResult,
} from './NativeAppleTranscription'
export { default as AppleTranscription } from './NativeAppleTranscription'
export { default as AppleUtils } from './NativeAppleUtils'
export { addWAVHeader, AudioFormatType } from './utils'
