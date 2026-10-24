import type { AppleLanguageModelId } from './ai-sdk'
import NativeAppleLLM, {
  type AppleGenerationOptions,
  type AppleMessage,
  type Spec,
} from './NativeAppleLLM'

type AppleFoundationModelsSpec = Omit<Spec, 'getModelInfo'> & {
  getModelInfo(
    locale?: string,
    model?: AppleLanguageModelId
  ): ReturnType<Spec['getModelInfo']>
}

const AppleFoundationModels: AppleFoundationModelsSpec = {
  isAvailable: () => NativeAppleLLM.isAvailable(),
  getModelInfo: (locale?: string, model?: AppleLanguageModelId) =>
    NativeAppleLLM.getModelInfo(locale, model),
  countTokens: (text) => NativeAppleLLM.countTokens(text),
  generateImages: (options) => NativeAppleLLM.generateImages(options),
  generateText: (messages: AppleMessage[], options: AppleGenerationOptions) =>
    NativeAppleLLM.generateText(messages, options),
  generateStream: (
    streamId,
    messages: AppleMessage[],
    options: AppleGenerationOptions
  ) => NativeAppleLLM.generateStream(streamId, messages, options),
  cancelStream: (streamId) => NativeAppleLLM.cancelStream(streamId),
  onStreamUpdate: NativeAppleLLM.onStreamUpdate,
  onStreamComplete: NativeAppleLLM.onStreamComplete,
  onStreamError: NativeAppleLLM.onStreamError,
}

export default AppleFoundationModels
