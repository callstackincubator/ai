import type { LanguageModelV3, SpeechModelV3 } from '@ai-sdk/provider'
import { apple, createAppleProvider } from '@react-native-ai/apple'

import type { SetupAdapter } from '../../config/providers'
import {
  checkCalendarEvents,
  createCalendarEvent,
  getCurrentTime,
} from '../../tools'

export const availableTools = {
  getCurrentTime,
  createCalendarEvent,
  checkCalendarEvents,
} as const

export const createAppleLanguageSetupWithToolsAdapter =
  (): SetupAdapter<LanguageModelV3> => {
    const apple = createAppleProvider({
      availableTools,
    })
    const model = apple.languageModel()
    return {
      model,
      tools: availableTools,
      label: 'Apple (with tool calling)',
      async isAvailable() {
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

export const createAppleLanguageSetupAdapter =
  (): SetupAdapter<LanguageModelV3> => {
    const model = apple.languageModel()
    return {
      model,
      label: 'Apple',
      async isAvailable() {
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
      label: 'Apple Speech Model',
      async isAvailable() {
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
