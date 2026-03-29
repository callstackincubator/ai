import type { TurboModule } from 'react-native'

import { unsupportedAsync } from './unsupportedPlatform'

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

export default {
  transcribe: () => unsupportedAsync('Apple transcription'),
  prepare: () => unsupportedAsync('Apple transcription'),
  isAvailable: () => false,
} satisfies {
  transcribe(
    data: ArrayBufferLike,
    language: string
  ): Promise<TranscriptionResult>
  prepare(language: string): Promise<void>
  isAvailable(language: string): boolean
}
