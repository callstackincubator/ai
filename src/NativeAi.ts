import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';
import type { AiModelSettings, Message } from './index';

export interface Spec extends TurboModule {
  getModel(name: string): Promise<string>; // Returns JSON string of ModelInstance
  getModels(): Promise<AiModelSettings[]>; // Returns array with available models
  doGenerate(instanceId: string, messages: Message[]): Promise<string>;
  doStream(instanceId: string, text: string): Promise<string>;
  downloadModel(instanceId: string): Promise<string>; // Ensures the model is on the device
  prepareModel(instanceId: string): Promise<string>; // Prepares the model for use, if model is not downloaded it will call downloadModel
}

export default TurboModuleRegistry.getEnforcing<Spec>('Ai');
