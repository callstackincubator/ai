import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { EmitterSubscription } from 'react-native';
import {
  type LanguageModelV1,
  type LanguageModelV1CallOptions,
  type LanguageModelV1CallWarning,
  type LanguageModelV1FinishReason,
  type LanguageModelV1FunctionToolCall,
  type LanguageModelV1StreamPart,
} from '@ai-sdk/provider';
import './polyfills';
import { ReadableStream } from 'web-streams-polyfill/ponyfill';
import type { ReadableStreamDefaultController } from 'web-streams-polyfill/ponyfill';

const LINKING_ERROR =
  `The package 'react-native-ai' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

// @ts-expect-error
const isTurboModuleEnabled = global.__turboModuleProxy != null;

const AiModule = isTurboModuleEnabled
  ? require('./NativeAi').default
  : NativeModules.Ai;

const Ai = AiModule
  ? AiModule
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      }
    );

export default Ai;

export interface AiModelSettings extends Record<string, unknown> {
  model_id?: string;
}

export interface Model {
  modelId: string;
  modelLib: string;
}

export interface Message {
  role: 'assistant' | 'system' | 'tool' | 'user';
  content: string;
}

class AiModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1';
  readonly defaultObjectGenerationMode = 'json';
  readonly provider = 'gemini-nano';
  public modelId: string;
  private options: AiModelSettings;

  constructor(modelId: string, options: AiModelSettings = {}) {
    this.modelId = modelId;
    this.options = options;

    console.debug('init:', this.modelId);
  }

  private model!: Model;
  async getModel() {
    this.model = await Ai.getModel(this.modelId);

    return this.model;
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
  }> {
    const model = await this.getModel();
    const messages = options.prompt;
    const extractedMessages = messages.map((message): Message => {
      let content = '';

      if (Array.isArray(message.content)) {
        content = message.content
          .map((messageContent) =>
            messageContent.type === 'text'
              ? messageContent.text
              : messageContent
          )
          .join('');
      }

      return {
        role: message.role,
        content: content,
      };
    });

    let text = '';

    if (messages.length > 0) {
      text = await Ai.doGenerate(model.modelId, extractedMessages);
    }

    return {
      text,
      finishReason: 'stop',
      usage: {
        promptTokens: 0,
        completionTokens: 0,
      },
      rawCall: {
        rawPrompt: options,
        rawSettings: {},
      },
    };
  }

  stream: ReadableStream<LanguageModelV1StreamPart> | null = null;
  controller: ReadableStreamDefaultController<LanguageModelV1StreamPart> | null =
    null;
  streamId: string | null = null;
  chatUpdateListener: EmitterSubscription | null = null;
  chatCompleteListener: EmitterSubscription | null = null;
  chatErrorListener: EmitterSubscription | null = null;
  isStreamClosed: boolean = false;

  public doStream = async (
    options: LanguageModelV1CallOptions
  ): Promise<{
    stream: ReadableStream<LanguageModelV1StreamPart>;
    rawCall: { rawPrompt: unknown; rawSettings: Record<string, unknown> };
    rawResponse?: { headers?: Record<string, string> };
    warnings?: LanguageModelV1CallWarning[];
  }> => {
    // Reset stream state
    this.isStreamClosed = false;
    const messages = options.prompt;
    const extractedMessages = messages.map((message): Message => {
      let content = '';

      if (Array.isArray(message.content)) {
        content = message.content
          .map((messageContent) =>
            messageContent.type === 'text'
              ? messageContent.text
              : messageContent
          )
          .join('');
      }

      return {
        role: message.role,
        content: content,
      };
    });

    const model = await this.getModel();

    const stream = new ReadableStream<LanguageModelV1StreamPart>({
      start: (controller) => {
        this.controller = controller;

        const eventEmitter = new NativeEventEmitter(NativeModules.Ai);
        this.chatCompleteListener = eventEmitter.addListener(
          'onChatComplete',
          () => {
            try {
              if (!this.isStreamClosed && this.controller) {
                this.controller.enqueue({
                  type: 'finish',
                  finishReason: 'stop',
                  usage: {
                    promptTokens: 0,
                    completionTokens: 0,
                  },
                });
                this.isStreamClosed = true;
                this.controller.close();
              }
            } catch (error) {
              console.error('🔴 [Stream] Error in complete handler:', error);
            }
          }
        );

        this.chatErrorListener = eventEmitter.addListener(
          'onChatUpdate',
          (data) => {
            console.log(
              '🟢 [Stream] Update data:',
              JSON.stringify(data, null, 2)
            );
            try {
              if (!this.isStreamClosed && this.controller) {
                if (data.error) {
                  this.controller.enqueue({ type: 'error', error: data.error });
                  this.isStreamClosed = true;
                  this.controller.close();
                } else {
                  this.controller.enqueue({
                    type: 'text-delta',
                    textDelta: data.content || '',
                  });
                }
              } else {
                console.log(
                  '🟡 [Stream] Cannot update - stream closed or no controller'
                );
              }
            } catch (error) {
              console.error('🔴 [Stream] Error in update handler:', error);
            }
          }
        );

        if (!model) {
          console.error('🔴 [Stream] Model not initialized');
          throw new Error('Model not initialized');
        }

        console.log(
          '🔵 [Stream] Starting native stream with model:',
          model.modelId
        );
        Ai.doStream(model.modelId, extractedMessages);
      },
      cancel: () => {
        console.log('🟡 [Stream] Stream cancelled, cleaning up');
        this.isStreamClosed = true;
        if (this.chatUpdateListener) {
          console.log('🟡 [Stream] Removing chat update listener');
          this.chatUpdateListener.remove();
        }
        if (this.chatCompleteListener) {
          console.log('🟡 [Stream] Removing chat complete listener');
          this.chatCompleteListener.remove();
        }
        if (this.chatErrorListener) {
          console.log('🟡 [Stream] Removing chat error listener');
          this.chatErrorListener.remove();
        }
      },
      pull: (_controller) => {
        console.log('🔵 [Stream] Pull called');
      },
    });
    let result = '';
    for await (const textPart of stream) {
      result = textPart;
    }

    console.log({ result });

    return {
      stream,
      rawCall: { rawPrompt: options.prompt, rawSettings: this.options },
    };
  };

  // Add other methods here as needed
}

type ModelOptions = {};

export function getModel(modelId: string, options: ModelOptions = {}): AiModel {
  return new AiModel(modelId, options);
}

export async function getModels(): Promise<AiModelSettings[]> {
  return Ai.getModels();
}

export function prepareModel(modelId: string) {
  return Ai.prepareModel(modelId);
}

const { doGenerate, doStream } = Ai;

export { doGenerate, doStream };
