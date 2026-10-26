import type { CodegenTypes, TurboModule } from 'react-native'
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

export interface AppleTranscriptionModelInfo {
  // Whether the device can transcribe at all
  isAvailable: boolean
  // Whether the language resolves to a locale the transcriber supports
  supportsLocale: boolean
  // The supported locale the language resolves to, e.g. en-US for en
  locale?: string
  // Whether the locale's assets are on the device. prepare() installs them
  assets?: 'installed' | 'downloading' | 'supported' | 'unsupported'
  supportedLocales: string[]
}

export interface Spec extends TurboModule {
  isAvailable(language: string): boolean
  getModelInfo(language: string): Promise<CodegenTypes.UnsafeObject>
  prepare(language: string): Promise<void>
}

declare global {
  function __apple__llm__transcribe__(
    data: ArrayBufferLike,
    language: string
  ): Promise<TranscriptionResult>
}

const NativeAppleTranscription = TurboModuleRegistry.getEnforcing<Spec>(
  'NativeAppleTranscription'
)

export default {
  transcribe: (data: ArrayBufferLike, language: string) =>
    globalThis.__apple__llm__transcribe__(data, language),
  prepare: NativeAppleTranscription.prepare,
  // Whether the device can transcribe. getModelInfo reports locale support
  isAvailable: NativeAppleTranscription.isAvailable,
  getModelInfo: (language: string) =>
    NativeAppleTranscription.getModelInfo(
      language
    ) as Promise<AppleTranscriptionModelInfo>,
}
