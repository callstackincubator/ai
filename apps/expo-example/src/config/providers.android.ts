import type { LanguageModelV3, SpeechModelV3 } from '@ai-sdk/provider'

import {
  commonLanguageAdapters,
  commonSpeechAdapters,
  SetupAdapter,
} from './providers.common'

// Available language model adapters for text generation.
export const languageAdapters: SetupAdapter<LanguageModelV3>[] =
  commonLanguageAdapters

// Available speech model adapters for text-to-speech.
export const speechAdapters: SetupAdapter<SpeechModelV3>[] =
  commonSpeechAdapters
