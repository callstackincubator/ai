import {
  type LanguageModelV1Prompt,
  type LanguageModelV1,
  type LanguageModelV1CallOptions,
} from '@ai-sdk/provider';

import NativeAppleLLM, { type AppleMessage } from './NativeAppleLLM';
import { foundationModels } from '.';

export class AppleLLMChatLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1';
  readonly defaultObjectGenerationMode = 'json';

  readonly provider = 'apple-llm';
  readonly modelId = 'default';

  private convertMessages(messages: LanguageModelV1Prompt): AppleMessage[] {
    return messages.map((message): AppleMessage => {
      const content = Array.isArray(message.content)
        ? message.content.reduce((acc, part) => {
            if (part.type === 'text') {
              return acc + part.text;
            }
            console.warn('Unsupported message content type:', part);
            return acc;
          }, '')
        : message.content;

      return {
        role: message.role,
        content,
      };
    });
  }

  async doGenerate(options: LanguageModelV1CallOptions) {
    const messages = this.convertMessages(options.prompt);

    const text = await NativeAppleLLM.generateText(messages, {
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      topP: options.topP,
      topK: options.topK,
    });

    return {
      text,
      finishReason: 'stop' as const,
      // Apple LLM doesn't provide token counts.
      // We will have to handle this ourselves in the future to avoid errors.
      usage: {
        promptTokens: 0,
        completionTokens: 0,
      },
      rawCall: {
        rawPrompt: options.prompt,
        rawSettings: {},
      },
    };
  }

  async doStream(options: LanguageModelV1CallOptions) {
    const messages = this.convertMessages(options.prompt);

    const stream = foundationModels.generateStream(messages, {
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      topP: options.topP,
      topK: options.topK,
    });

    return {
      stream,
      rawCall: {
        rawPrompt: options.prompt,
        rawSettings: {},
      },
    };
  }
}
