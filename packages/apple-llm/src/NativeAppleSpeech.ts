import type { CodegenTypes, TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'

import { addWAVHeader } from './utils'

export interface SpeechOptions {
  language?: string
  voice?: string
  // Multiplies the default speaking rate, so 2 speaks twice as fast
  speed?: number
}

export interface VoiceInfo {
  identifier: string
  name: string
  language: string
  quality: 'default' | 'enhanced' | 'premium'
  isPersonalVoice: boolean
  isNoveltyVoice: boolean
}

export type PersonalVoiceAuthorizationStatus =
  | 'authorized'
  | 'denied'
  | 'notDetermined'
  | 'unsupported'

export interface Spec extends TurboModule {
  getVoices(): Promise<VoiceInfo[]>
  requestPersonalVoiceAuthorization(): Promise<string>
}

const NativeAppleSpeech =
  TurboModuleRegistry.getEnforcing<Spec>('NativeAppleSpeech')

interface AudioResult {
  data: ArrayBufferLike
  sampleRate: number
  channels: number
  bitsPerSample: number
  formatType: number // 0 = integer, 1 = float
}

declare global {
  function __apple__llm__generate_audio__(
    text: string,
    options: CodegenTypes.UnsafeObject
  ): Promise<AudioResult>
}

export default {
  getVoices: NativeAppleSpeech.getVoices,
  /**
   * Asks the user to let the app use their Personal Voice (iOS 17+). Once
   * authorized, getVoices() lists it
   */
  requestPersonalVoiceAuthorization: () =>
    NativeAppleSpeech.requestPersonalVoiceAuthorization() as Promise<PersonalVoiceAuthorizationStatus>,
  generate: async (
    text: string,
    options: SpeechOptions = {}
  ): Promise<ArrayBufferLike> => {
    const result = await globalThis.__apple__llm__generate_audio__(
      text,
      options
    )
    return addWAVHeader(result.data, {
      sampleRate: result.sampleRate,
      channels: result.channels,
      bitsPerSample: result.bitsPerSample,
      formatType: result.formatType,
    })
  },
}
