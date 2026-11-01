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
    async isAvailable() {
      if (Platform.OS !== 'ios') return 'no'
      try {
        const { availability } = await apple.getModelInfo()
        return availability === 'available' ? 'yes' : 'no'
      } catch {
        return 'no'
      }
    },
    async download() {},
    async delete() {},
    async prepare() {
      await model.prepare()
    },
    // The system manages Apple's model
    async unload() {},
  }
}
