import type { LanguageModelV4, SpeechModelV4 } from '@ai-sdk/provider'
import { TurboModuleRegistry } from 'react-native'

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

// Core AI is only linked in CORE_AI=1 builds, and importing the package
// without its native module throws, so it is required lazily
function coreAILanguageAdapters(): SetupAdapter<LanguageModelV4>[] {
  if (!TurboModuleRegistry.get('NativeCoreAI')) {
    return []
  }

  const { createCoreAILanguageSetupAdapter } =
    require('../components/adapters/coreAISetupAdapter') as typeof import('../components/adapters/coreAISetupAdapter')
  return [
    // iOS export of Apple's coreai-models recipe for Qwen3 0.6B (~460 MB)
    createCoreAILanguageSetupAdapter({
      id: 'qwen3-0.6b',
      repo: 'grabbou/qwen3-0.6b-CoreAI',
      folder: 'ios',
    }),
  ]
}

// Available language model adapters for text generation.
export const languageAdapters: SetupAdapter<LanguageModelV4>[] = [
  createAppleLanguageSetupAdapter(toolDefinitions),
  ...coreAILanguageAdapters(),
  ...commonLanguageAdapters,
]

// Available speech model adapters for text-to-speech.
export const speechAdapters: SetupAdapter<SpeechModelV4>[] = [
  createAppleSpeechSetupAdapter(),
  ...commonSpeechAdapters,
]
