import NativeAppleLLM, {
  type AppleGenerationOptions,
  type AppleMessage,
  type Spec,
} from './NativeAppleLLM'

const tokenCountingUnavailableMessage =
  'Apple Foundation Models token counting is unavailable. It requires iOS 26.4 or newer and a native build with countTokens support.'

const nativeAppleLLM = NativeAppleLLM as Spec & {
  countTokens?: (text: string) => Promise<number>
  getModelInfo?: (locale?: string, model?: string) => Promise<object>
  generateImages?: (options: object) => Promise<string[]>
}

const AppleFoundationModels: Spec = {
  isAvailable: () => NativeAppleLLM.isAvailable(),
  getModelInfo: (locale?: string, model?: string) => {
    if (typeof nativeAppleLLM.getModelInfo !== 'function') {
      return Promise.reject(
        new Error(
          'Apple Foundation Models model info is unavailable. Rebuild the native module with getModelInfo support.'
        )
      )
    }

    return nativeAppleLLM.getModelInfo(locale, model)
  },
  countTokens: (text) => {
    if (typeof nativeAppleLLM.countTokens !== 'function') {
      return Promise.reject(new Error(tokenCountingUnavailableMessage))
    }

    return nativeAppleLLM.countTokens(text)
  },
  generateImages: (options) => {
    if (typeof nativeAppleLLM.generateImages !== 'function') {
      return Promise.reject(
        new Error(
          'Apple Image Playground generation is unavailable. Rebuild the native module with generateImages support.'
        )
      )
    }

    return nativeAppleLLM.generateImages(options)
  },
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
