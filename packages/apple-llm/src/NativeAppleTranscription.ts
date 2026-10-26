import type { TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'

// A type rather than an interface, so it fits JSON provider metadata
export type TranscriptionSegment = {
  text: string
  startSecond: number
  endSecond: number
}

export interface TranscriptionResult {
  segments: TranscriptionSegment[]
  // Each word with its own timing
  words: TranscriptionSegment[]
  duration: number
}

export interface Spec extends TurboModule {
  isAvailable(language: string): boolean
  prepare(language: string): Promise<void>
}

declare global {
  function __apple__llm__transcribe__(
    data: ArrayBufferLike,
    language: string,
    contextualStrings?: string[]
  ): Promise<TranscriptionResult>
}

const NativeAppleTranscription = TurboModuleRegistry.getEnforcing<Spec>(
  'NativeAppleTranscription'
)

export default {
  transcribe: (
    data: ArrayBufferLike,
    language: string,
    contextualStrings?: string[]
  ) => globalThis.__apple__llm__transcribe__(data, language, contextualStrings),
  prepare: NativeAppleTranscription.prepare,
  isAvailable: NativeAppleTranscription.isAvailable,
}
