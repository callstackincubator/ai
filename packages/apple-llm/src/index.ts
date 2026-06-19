export type {
  AppleBuiltInTool,
  AppleContextOptions,
  AppleImageModelOptions,
  AppleImagePersonalization,
  AppleImageStyle,
  AppleLanguageModel,
  AppleLanguageModelId,
  AppleLanguageModelOptions,
  AppleModelInfo,
  AppleProviderOptions,
  AppleSummarizeHistoryOptions,
  AppleToolDefinitionSet,
} from './ai-sdk'
export {
  apple,
  createAppleProvider,
  trimAppleMessagesForContext,
} from './ai-sdk'
export { default as AppleFoundationModels } from './AppleFoundationModels'
export type { AppleLLMError, AppleLLMErrorCode } from './errors'
export { AppleLLMErrorCodes } from './errors'
export { default as AppleEmbeddings } from './NativeAppleEmbeddings'
export { default as AppleSpeech, VoiceInfo } from './NativeAppleSpeech'
export { default as AppleTranscription } from './NativeAppleTranscription'
export { default as AppleUtils } from './NativeAppleUtils'
export { addWAVHeader, AudioFormatType } from './utils'
