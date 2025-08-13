import type { TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'
import type { UnsafeObject } from 'react-native/Libraries/Types/CodegenTypes'

export interface SpeechOptions {
  language?: string
  voice?: string
}

export interface VoiceInfo {
  identifier: string
  name: string
  language: string
  quality: 'default' | 'enhanced' | 'premium'
  isPersonalVoice: boolean
  isNoveltyVoice: boolean
}

export interface Spec extends TurboModule {
  getVoices(): Promise<VoiceInfo[]>
}

const NativeAppleSpeech =
  TurboModuleRegistry.getEnforcing<Spec>('NativeAppleSpeech')

declare global {
  function __apple__llm__generate_audio__(
    text: string,
    options: UnsafeObject
  ): Promise<ArrayBufferLike>
}

export default {
  getVoices: NativeAppleSpeech.getVoices,
  generate: (text: string, options: SpeechOptions = {}) => {
    return globalThis.__apple__llm__generate_audio__(text, options)
  },
}
