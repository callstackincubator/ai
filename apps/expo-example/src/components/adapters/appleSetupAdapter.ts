import type { LanguageModelV4, SpeechModelV4 } from '@ai-sdk/provider'
import type { Tool } from '@ai-sdk/provider-utils'
import { apple, createAppleProvider } from '@react-native-ai/apple'

import type { SetupAdapter } from '../../config/providers.common'

export const createAppleLanguageSetupAdapter = (
  tools: Record<string, Tool>
): SetupAdapter<LanguageModelV4> => {
  const apple = createAppleProvider({ availableTools: tools })
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
    capabilities: {
      // Foundation Models takes image prompts from iOS 27, but the provider
      // declares no supportedUrls, so the AI SDK rejects file:// image URLs
      imageInput: false,
    },
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
  (): SetupAdapter<SpeechModelV4> => {
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
