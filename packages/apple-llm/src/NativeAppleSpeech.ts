import type { TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'
import type { UnsafeObject } from 'react-native/Libraries/Types/CodegenTypes'

import { addWAVHeader, AudioFormatType } from './utils'

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
    options: UnsafeObject
  ): Promise<AudioResult>
}

export default {
  getVoices: NativeAppleSpeech.getVoices,
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
