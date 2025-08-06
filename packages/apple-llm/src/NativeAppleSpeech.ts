import type { TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'

export interface SpeechOptions {
  language?: string
  voice?: string
}

export interface Spec extends TurboModule {
  isAvailable(): boolean
  generate(text: string, options?: SpeechOptions): Promise<void>
}

const NativeAppleSpeech =
  TurboModuleRegistry.getEnforcing<Spec>('NativeAppleSpeech')

export default {
  generate: (text: string, options?: SpeechOptions) =>
    NativeAppleSpeech.generate(text, options),
  isAvailable: NativeAppleSpeech.isAvailable,
}
