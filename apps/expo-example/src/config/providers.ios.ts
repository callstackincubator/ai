import type { LanguageModelV4, SpeechModelV4 } from '@ai-sdk/provider'

import {
  createAppleLanguageSetupAdapter,
  createAppleSpeechSetupAdapter,
} from '../components/adapters/appleSetupAdapter'
import { toolDefinitions } from '../tools'
import {
  commonLanguageAdapters,
  commonSpeechAdapters,
  SetupAdapter,
} from './providers.common'

// Available language model adapters for text generation.
export const languageAdapters: SetupAdapter<LanguageModelV4>[] = [
  createAppleLanguageSetupAdapter(toolDefinitions),
  ...commonLanguageAdapters,
]

// Available speech model adapters for text-to-speech.
export const speechAdapters: SetupAdapter<SpeechModelV4>[] = [
  createAppleSpeechSetupAdapter(),
  ...commonSpeechAdapters,
]
