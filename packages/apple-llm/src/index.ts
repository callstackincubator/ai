import { AppleLLMChatLanguageModel } from './ai-sdk';
import { generateStream } from './streaming';

import NativeAppleLLMSpec, {
  type AppleMessage,
  type AppleGenerationOptions,
} from './NativeAppleLLM';

export function apple(): AppleLLMChatLanguageModel {
  return new AppleLLMChatLanguageModel();
}

export const foundationModels = {
  isAvailable: NativeAppleLLMSpec.isAvailable,
  generateText(
    messages: AppleMessage[],
    options: AppleGenerationOptions = {}
  ): Promise<string> {
    return NativeAppleLLMSpec.generateText(messages, options);
  },
  generateStream,
};
