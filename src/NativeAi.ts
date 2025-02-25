import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';
import type { AiModelSettings } from './index';

export interface Spec extends TurboModule {
  getModel(name: string): Promise<string>; // Returns JSON string of ModelInstance
  getModels(): Promise<AiModelSettings[]>; // Returns array with available models
  doGenerate(instanceId: string, text: string): Promise<string>;
  doStream(instanceId: string, text: string): Promise<string>;
  prepareModel(instanceId: string): Promise<string>; // Downloads model weights onto device
}

export default TurboModuleRegistry.getEnforcing<Spec>('Ai');
