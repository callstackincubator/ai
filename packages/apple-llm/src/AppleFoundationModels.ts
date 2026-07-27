import NativeAppleLLM, {
  type AppleGenerationOptions,
  type AppleMessage,
  type Spec,
} from './NativeAppleLLM'

const tokenCountingUnavailableMessage =
  'Apple Foundation Models token counting is unavailable. It requires iOS 26.4 or newer and a native build with countTokens support.'

const nativeAppleLLM = NativeAppleLLM as Spec & {
  countTokens?: (text: string) => Promise<number>
}

const AppleFoundationModels: Spec = {
  isAvailable: () => NativeAppleLLM.isAvailable(),
  getAvailability: () => NativeAppleLLM.getAvailability(),
  countTokens: (text) => {
    if (typeof nativeAppleLLM.countTokens !== 'function') {
      return Promise.reject(new Error(tokenCountingUnavailableMessage))
    }

    return nativeAppleLLM.countTokens(text)
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
