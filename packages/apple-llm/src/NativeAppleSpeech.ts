import type { TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'

export interface Spec extends TurboModule {
  isAvailable(language: string): boolean
  prepare(language: string): Promise<void>
  transcribe(audio: string, language: string): Promise<string>
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeAppleSpeech')
