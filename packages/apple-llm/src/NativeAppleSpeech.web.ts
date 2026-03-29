import type { TurboModule } from 'react-native'
import type { UnsafeObject } from 'react-native/Libraries/Types/CodegenTypes'

import { unsupportedAsync } from './unsupportedPlatform'

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

interface AudioResult {
  data: ArrayBufferLike
  sampleRate: number
  channels: number
  bitsPerSample: number
  formatType: number
}

declare global {
  function __apple__llm__generate_audio__(
    text: string,
    options: UnsafeObject
  ): Promise<AudioResult>
}

export default {
  getVoices: () => unsupportedAsync('Apple speech synthesis'),
  generate: () => unsupportedAsync('Apple speech synthesis'),
} satisfies {
  getVoices(): Promise<VoiceInfo[]>
  generate(text: string, options?: SpeechOptions): Promise<ArrayBufferLike>
}
