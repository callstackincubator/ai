import type { LanguageModelV4, SpeechModelV4 } from '@ai-sdk/provider'

import {
  createAdkCloudSetupAdapter,
  createAdkNanoSetupAdapter,
} from '../components/adapters/adkSetupAdapter'
import { createMLCLanguageSetupAdapter } from '../components/adapters/mlcModelSetupAdapter'
import { toolDefinitions } from '../tools'
import {
  commonLanguageAdapters,
  commonSpeechAdapters,
  type SetupAdapter,
} from './providers.common'

// MLC is Android-only for now, see react-native.config.js
const mlcLanguageAdapters: SetupAdapter<LanguageModelV4>[] = [
  createMLCLanguageSetupAdapter('Llama-3.2-1B-Instruct'),
  createMLCLanguageSetupAdapter('Llama-3.2-3B-Instruct'),
  createMLCLanguageSetupAdapter('Phi-3.5-mini-instruct'),
  createMLCLanguageSetupAdapter('Qwen2-1.5B-Instruct'),
]

const adkLanguageAdapters: SetupAdapter<LanguageModelV4>[] = [
  createAdkNanoSetupAdapter(toolDefinitions),
  createAdkCloudSetupAdapter(toolDefinitions),
]

// Available language model adapters for text generation.
export const languageAdapters: SetupAdapter<LanguageModelV4>[] = [
  ...commonLanguageAdapters,
  ...mlcLanguageAdapters,
  ...adkLanguageAdapters,
]

// Available speech model adapters for text-to-speech.
export const speechAdapters: SetupAdapter<SpeechModelV4>[] =
  commonSpeechAdapters
