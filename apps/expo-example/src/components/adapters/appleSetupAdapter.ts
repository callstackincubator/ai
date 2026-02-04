import type { LanguageModelV3, SpeechModelV3 } from '@ai-sdk/provider'
import { apple, createAppleProvider } from '@react-native-ai/apple'
import { ToolSet } from 'ai'

import type { SetupAdapter } from '../../config/providers'

export const createAppleLanguageSetupAdapter = (
  tools: ToolSet = {}
): SetupAdapter<LanguageModelV3> => {
  const apple = createAppleProvider({
    availableTools: tools,
  })
  const model = apple.languageModel()
  return {
    model,
    modelId: model.modelId,
    display: {
      label: 'Apple Intelligence',
      accentColor: '#2563EB',
      icon: 'auto-awesome',
    },
    builtIn: true,
    isAvailable() {
      return apple.isAvailable() ? 'yes' : 'no'
    },
    async download() {},
    async delete() {},
    async unload() {},
    async prepare() {
      await model.prepare()
    },
  }
}

export const createAppleSpeechSetupAdapter =
  (): SetupAdapter<SpeechModelV3> => {
    const model = apple.speechModel()
    return {
      model,
      modelId: model.modelId,
      display: {
        label: 'Apple Speech',
        accentColor: '#2563EB',
        icon: 'auto-awesome',
      },
      builtIn: true,
      isAvailable() {
        return apple.isAvailable() ? 'yes' : 'no'
      },
      async download() {},
      async delete() {},
      async unload() {},
      async prepare() {
        await model.prepare()
      },
    }
  }
