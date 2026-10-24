import type { LanguageModelV4, SpeechModelV4 } from '@ai-sdk/provider'

import {
  createAdkCloudSetupAdapter,
  createAdkNanoSetupAdapter,
} from '../components/adapters/adkSetupAdapter'
import { toolDefinitions } from '../tools'
import {
  commonLanguageAdapters,
  commonSpeechAdapters,
  type SetupAdapter,
} from './providers.common'

const adkLanguageAdapters: SetupAdapter<LanguageModelV4>[] = [
  createAdkNanoSetupAdapter(toolDefinitions),
  createAdkCloudSetupAdapter(toolDefinitions),
]

// Available language model adapters for text generation.
export const languageAdapters: SetupAdapter<LanguageModelV4>[] = [
  ...commonLanguageAdapters,
  ...adkLanguageAdapters,
]

// Available speech model adapters for text-to-speech.
export const speechAdapters: SetupAdapter<SpeechModelV4>[] =
  commonSpeechAdapters
