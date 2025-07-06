import {
  type LanguageModelV1,
  type LanguageModelV1CallOptions,
  type LanguageModelV1CallWarning,
  type LanguageModelV1FinishReason,
  type LanguageModelV1FunctionToolCall,
  type LanguageModelV1StreamPart,
} from '@ai-sdk/provider';
import { ReadableStream } from 'web-streams-polyfill';

import NativeAppleLLM, { type Message } from './NativeAppleLLM';

export class AppleLLMChatLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1';
  readonly defaultObjectGenerationMode = 'json';

  readonly provider = 'apple-llm';
  readonly modelId = 'default';
  
  private convertMessages(messages: LanguageModelV1CallOptions['prompt']): Message[] {
    return messages.map((message): Message => {
      let content = '';

      if (Array.isArray(message.content)) {
        content = message.content
          .map((part) => {
            if (part.type === 'text') {
              return part.text;
            }
            // Handle other content types if needed
            return '';
          })
          .join('');
      } else {
        content = message.content || '';
      }

      return {
        role: message.role as Message['role'],
        content,
      };
    });
  }

  private validateAndWarnOptions(options: AppleLLMChatOptions): AppleLLMChatOptions {
    const validatedOptions = { ...options };

    // Warning and fallback logic for sampling
    if (options.topP !== undefined && options.topK !== undefined) {
      console.warn('Apple LLM: Both topP and topK provided. Using greedy sampling instead.');
      validatedOptions.topP = undefined;
      validatedOptions.topK = undefined;
    }

    return validatedOptions;
  }

  async doGenerate(options: LanguageModelV1CallOptions): Promise<{
    text?: string;
    toolCalls?: Array<LanguageModelV1FunctionToolCall>;
    finishReason: LanguageModelV1FinishReason;
    usage: {
      promptTokens: number;
      completionTokens: number;
    };
    rawCall: {
      rawPrompt: unknown;
      rawSettings: Record<string, unknown>;
    };
    rawResponse?: {
      headers?: Record<string, string>;
    };
    warnings?: LanguageModelV1CallWarning[];
  }> {
    const messages = this.convertMessages(options.prompt);
    const validatedOptions = this.validateAndWarnOptions(this.options);

    try {
      const text = await NativeAppleLLM.generateText(messages, validatedOptions);

      return {
        text,
        finishReason: 'stop',
        usage: {
          promptTokens: 0, // Apple LLM doesn't provide token counts
          completionTokens: 0,
        },
        rawCall: {
          rawPrompt: options.prompt,
          rawSettings: validatedOptions,
        },
      };
    } catch (error) {
      throw new Error(`Apple LLM generation failed: ${error}`);
    }
  }

  async doStream(options: LanguageModelV1CallOptions): Promise<{
    stream: ReadableStream<LanguageModelV1StreamPart>;
    rawCall: {
      rawPrompt: unknown;
      rawSettings: Record<string, unknown>;
    };
    rawResponse?: {
      headers?: Record<string, string>;
    };
    warnings?: LanguageModelV1CallWarning[];
  }> {
    const messages = this.convertMessages(options.prompt);
    const validatedOptions = this.validateAndWarnOptions(this.options);

    let streamId: string | null = null;
  let listeners: Array<{ remove(): void }> = [];

  const cleanup = () => {
    listeners.forEach(listener => listener.remove());
    listeners = [];
  };

  const stream = new ReadableStream<LanguageModelV1StreamPart>({
    async start(controller) {
      try {
        streamId = await NativeAppleLLM.startStream(messages, options);

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
        rawSettings: validatedOptions,
      },
    };
  }
}
