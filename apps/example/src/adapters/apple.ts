import type { LanguageModelV4 } from '@ai-sdk/provider'
import { apple } from '@react-native-ai/apple'
import { Platform } from 'react-native'

import type { SetupAdapter } from './types'

export function createAppleLanguageSetupAdapter(): SetupAdapter<LanguageModelV4> {
  const model = apple.languageModel()
  return {
    model,
    modelId: model.modelId,
    label: 'Apple Intelligence',
    description: 'Fast and private, built into iOS',
    runtime: 'apple',
    capabilities: ['tools'],
    builtIn: true,
    // Image prompts need iOS 27
    imageInput:
      Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 27,
    isAvailable() {
      return Platform.OS === 'ios' && apple.isAvailable() ? 'yes' : 'no'
    },
    async download() {},
    async delete() {},
    async prepare() {
      await model.prepare()
    },
  }
}
