import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';
import type { EventEmitter } from 'react-native/Libraries/Types/CodegenTypes';

export interface AppleMessage {
  role: 'assistant' | 'system' | 'tool' | 'user';
  content: string;
}

export interface AppleGenerationOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
}

export type StreamUpdateEvent = {
  streamId: string;
  content: string;
};

export type StreamCompleteEvent = {
  streamId: string;
};

export type StreamErrorEvent = {
  streamId: string;
  error: string;
};

export interface Spec extends TurboModule {
  isAvailable(): Promise<boolean>;
  generateText(
    messages: AppleMessage[],
    options?: AppleGenerationOptions
  ): Promise<string>;
  startStream(
    messages: AppleMessage[],
    options?: AppleGenerationOptions
  ): Promise<string>;
  cancelStream(streamId: string): Promise<void>;
  isModelAvailable(modelId: string): Promise<boolean>;

  onStreamUpdate: EventEmitter<StreamUpdateEvent>;
  onStreamComplete: EventEmitter<StreamCompleteEvent>;
  onStreamError: EventEmitter<StreamErrorEvent>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeAppleLLM');
