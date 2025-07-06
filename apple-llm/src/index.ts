import { AppleLLMChatLanguageModel } from './ai-sdk';

import NativeAppleLLM from './NativeAppleLLM';

export function apple(): AppleLLMChatLanguageModel {
  return new AppleLLMChatLanguageModel();
}

export { NativeAppleLLM };
