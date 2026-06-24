import type { LanguageModelV3, SpeechModelV3 } from '@ai-sdk/provider'

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

const adkLanguageAdapters: SetupAdapter<LanguageModelV3>[] = [
  createAdkNanoSetupAdapter(toolDefinitions),
  createAdkCloudSetupAdapter(toolDefinitions),
]

// Available language model adapters for text generation.
export const languageAdapters: SetupAdapter<LanguageModelV3>[] = [
  ...commonLanguageAdapters,
  ...adkLanguageAdapters,
]

// Available speech model adapters for text-to-speech.
export const speechAdapters: SetupAdapter<SpeechModelV3>[] =
  commonSpeechAdapters
