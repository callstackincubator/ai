import type { TurboModule } from 'react-native'

import {
  getOptionalTurboModule,
  unsupportedAsync,
} from './unsupportedPlatform'

export interface TranscriptionSegment {
  text: string
  startSecond: number
  endSecond: number
}

export interface TranscriptionResult {
  segments: TranscriptionSegment[]
  duration: number
}

export interface Spec extends TurboModule {
  isAvailable(language: string): boolean
  prepare(language: string): Promise<void>
}

declare global {
  function __apple__llm__transcribe__(
    data: ArrayBufferLike,
    language: string
  ): Promise<TranscriptionResult>
}

const NativeAppleTranscription =
  getOptionalTurboModule<Spec>('NativeAppleTranscription') ?? {
    isAvailable: () => false,
    prepare: () => unsupportedAsync('Apple transcription'),
  }

export default {
  transcribe: (data: ArrayBufferLike, language: string) => {
    if (typeof globalThis.__apple__llm__transcribe__ !== 'function') {
      return unsupportedAsync('Apple transcription')
    }

    return globalThis.__apple__llm__transcribe__(data, language)
  },
  prepare: NativeAppleTranscription.prepare,
  isAvailable: NativeAppleTranscription.isAvailable,
}
