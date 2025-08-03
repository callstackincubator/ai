import type { TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'

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

const NativeAppleSpeech =
  TurboModuleRegistry.getEnforcing<Spec>('NativeAppleSpeech')

export default {
  transcribe: (data: ArrayBufferLike, language: string) =>
    globalThis.__apple__llm__transcribe__(data, language),
  prepare: NativeAppleSpeech.prepare,
  isAvailable: NativeAppleSpeech.isAvailable,
}
