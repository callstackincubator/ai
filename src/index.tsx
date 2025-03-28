import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
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

export interface DownloadProgress {
  percentage: number;
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

  stream = null;
  controller = null;
  streamId = null;

  public doStream = async (
    options: LanguageModelV1CallOptions
  ): Promise<{
    stream: ReadableStream<LanguageModelV1StreamPart>;
    rawCall: { rawPrompt: unknown; rawSettings: Record<string, unknown> };
    rawResponse?: { headers?: Record<string, string> };
    warnings?: LanguageModelV1CallWarning[];
  }> => {
    console.debug('stream options:', options);

    // const model = await this.getModel();
    // const message =
    //   options.prompt[options.prompt.length - 1]!.content[0]!.text!;

    const eventEmitter = new NativeEventEmitter(NativeModules.Ai);
    eventEmitter.addListener('onChatUpdate', (data) => {
      console.log({ data });
    });

    eventEmitter.addListener('onChatComplete', () => {
      console.log('onChatComplete');
    });

    // const stream = new ReadableStream({
    //   start: async (controller) => {
    //     this.controller = controller;

    //     try {
    //       this.streamId =
    //         await StreamingChatModule.streamChatCompletion(message);

    //       this.updateListener = eventEmitter.addListener(
    //         'chatUpdate',
    //         this.handleChatUpdate
    //       );
    //       this.completeListener = eventEmitter.addListener(
    //         'chatComplete',
    //         this.handleChatComplete
    //       );
    //       this.errorListener = eventEmitter.addListener(
    //         'chatError',
    //         this.handleChatError
    //       );
    //     } catch (error) {
    //       controller.error(error);
    //     }
    //   },
    //   cancel: () => {
    //     this.cleanup();
    //   },
    // });

    // Ai.doStream(model.modelId, message);

    // const stream = new ReadableStream({
    //   start: (controller) => {
    //     this.controller = controller;

    //     this.chatCompleteListener = eventEmitter.addListener(
    //       'chatComplete',
    //       (data) => {
    //         console.log(data);
    //       }
    //     );
    //     this.chatErrorListener = eventEmitter.addListener(
    //       'chatError',
    //       (data) => {
    //         console.log(data);
    //       }
    //     );

    //     Ai.doStream(model, message); // this should be called via model.doStream()
    //   },
    //   cancel: () => {
    //     console.log('cancel');
    //     console.log('cleanup?');
    //     this.chatUpdateListener.remove();
    //     this.chatCompleteListener.remove();
    //     this.chatErrorListener.remove();
    //   },
    // });

    // const promptStream = session.promptStreaming(message);
    // const transformStream = new StreamAI(options.abortSignal);
    // const stream = promptStream.pipeThrough(transformStream);

    // TODO: how to convert event emitter to stream

    return {
      stream: new ReadableStream({
        start: () => {},
      }),
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

export async function downloadModel(
  modelId: string,
  callbacks?: {
    onStart?: () => void;
    onProgress?: (progress: DownloadProgress) => void;
    onComplete?: () => void;
    onError?: (error: Error) => void;
  }
): Promise<void> {
  const eventEmitter = new NativeEventEmitter(NativeModules.Ai);

  const downloadStartListener = eventEmitter.addListener(
    'onDownloadStart',
    () => {
      console.log('🔵 [Download] Started downloading model:', modelId);
      callbacks?.onStart?.();
    }
  );

  const downloadProgressListener = eventEmitter.addListener(
    'onDownloadProgress',
    (progress: DownloadProgress) => {
      console.log(
        '🟢 [Download] Progress:',
        progress.percentage.toFixed(2) + '%'
      );
      callbacks?.onProgress?.(progress);
    }
  );

  const downloadCompleteListener = eventEmitter.addListener(
    'onDownloadComplete',
    () => {
      console.log('✅ [Download] Completed downloading model:', modelId);
      callbacks?.onComplete?.();
      // Cleanup listeners
      downloadStartListener.remove();
      downloadProgressListener.remove();
      downloadCompleteListener.remove();
      downloadErrorListener.remove();
    }
  );

  const downloadErrorListener = eventEmitter.addListener(
    'onDownloadError',
    (error) => {
      console.error('🔴 [Download] Error downloading model:', error);
      callbacks?.onError?.(
        new Error(error.message || 'Unknown download error')
      );
      // Cleanup listeners
      downloadStartListener.remove();
      downloadProgressListener.remove();
      downloadCompleteListener.remove();
      downloadErrorListener.remove();
    }
  );

  try {
    await Ai.downloadModel(modelId);
  } catch (error) {
    // Cleanup listeners in case of error
    downloadStartListener.remove();
    downloadProgressListener.remove();
    downloadCompleteListener.remove();
    downloadErrorListener.remove();
    throw error;
  }
}

export async function prepareModel(modelId: string) {
  return Ai.prepareModel(modelId);
}

const { doGenerate, doStream } = Ai;

export { doGenerate, doStream };
