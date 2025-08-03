import type { TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'

export interface Spec extends TurboModule {
  isAvailable(language: string): boolean
  prepare(language: string): Promise<void>
}

declare global {
  function __apple__llm__transcribe__(
    data: ArrayBufferLike,
    language: string
  ): Promise<string>
}

const NativeAppleSpeech =
  TurboModuleRegistry.getEnforcing<Spec>('NativeAppleSpeech')

export default {
  transcribe: (data: ArrayBufferLike, language: string) =>
    globalThis.__apple__llm__transcribe__(data, language),
  prepare: NativeAppleSpeech.prepare,
  isAvailable: NativeAppleSpeech.isAvailable,
}
