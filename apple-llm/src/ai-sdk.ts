import {
  type LanguageModelV1Prompt,
  type LanguageModelV1,
  type LanguageModelV1CallOptions,
  type LanguageModelV1StreamPart,
} from '@ai-sdk/provider';
import { ReadableStream } from 'web-streams-polyfill';

import NativeAppleLLM, { type AppleMessage } from './NativeAppleLLM';

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
      // Apple LLM doesn't provide token counts. We will have to handle this ourselves in the future
      // to avoid errors.
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

    let streamId: string | null = null;
    let listeners: Array<{ remove(): void }> = [];

    const cleanup = () => {
      listeners.forEach((listener) => listener.remove());
      listeners = [];
    };

    const stream = new ReadableStream<LanguageModelV1StreamPart>({
      async start(controller) {
        try {
          streamId = NativeAppleLLM.generateStream(messages, {
            maxTokens: options.maxTokens,
            temperature: options.temperature,
            topP: options.topP,
            topK: options.topK,
          });

          const updateListener = NativeAppleLLM.onStreamUpdate((data) => {
            if (data.streamId === streamId) {
              controller.enqueue({
                type: 'text-delta',
                textDelta: data.content,
              });
            }
          });

          const completeListener = NativeAppleLLM.onStreamComplete((data) => {
            if (data.streamId === streamId) {
              controller.enqueue({
                type: 'finish',
                finishReason: 'stop',
                usage: {
                  promptTokens: 0,
                  completionTokens: 0,
                },
              });
              cleanup();
              controller.close();
            }
          });

          const errorListener = NativeAppleLLM.onStreamError((data) => {
            if (data.streamId === streamId) {
              controller.enqueue({
                type: 'error',
                error: data.error,
              });
              cleanup();
              controller.close();
            }
          });

          listeners = [updateListener, completeListener, errorListener];
        } catch (error) {
          cleanup();
          controller.error(new Error(`Apple LLM stream failed: ${error}`));
        }
      },
      cancel() {
        cleanup();
        if (streamId) {
          NativeAppleLLM.cancelStream(streamId);
        }
      },
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
