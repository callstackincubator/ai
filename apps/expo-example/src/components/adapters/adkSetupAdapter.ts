import type { LanguageModelV4 } from '@ai-sdk/provider'
import type { Tool } from '@ai-sdk/provider-utils'
import {
  type AdkLanguageModelId,
  createAdkProvider,
} from '@react-native-ai/adk'

import { getGoogleApiKey } from '../../config/adk'
import type { Availability, SetupAdapter } from '../../config/providers.common'

type AdkAdapterOptions = {
  model: AdkLanguageModelId
  label: string
  accentColor: string
  icon: string
  builtIn: boolean
  apiKey?: string
}

export const createAdkLanguageSetupAdapter = (
  options: AdkAdapterOptions,
  tools: Record<string, Tool>
): SetupAdapter<LanguageModelV4> => {
  const provider = createAdkProvider({
    model: options.model,
    apiKey: options.apiKey,
    instruction:
      'You are a helpful assistant in the Callstack React Native AI demo app.',
    availableTools: tools,
  })
  const model = provider()

  return {
    model,
    modelId: `adk-${options.model}`,
    display: {
      label: options.label,
      accentColor: options.accentColor,
      icon: options.icon,
    },
    builtIn: options.builtIn,
    imageInput: true,
    isAvailable(): Availability {
      if (options.model !== 'gemini-nano' && !options.apiKey) {
        return 'no'
      }
      return 'yes'
    },
    async download(onProgress) {
      let bytesToDownload: number | undefined
      await model.prepare({
        onProgress: (progress) => {
          bytesToDownload = progress.bytesToDownload ?? bytesToDownload
          if (progress.phase === 'completed') {
            onProgress(100)
          } else if (bytesToDownload && progress.bytesDownloaded) {
            onProgress(
              Math.round((progress.bytesDownloaded / bytesToDownload) * 100)
            )
          }
        },
      })
    },
    async delete() {},
    async unload() {},
    async prepare() {
      await model.prepare()
    },
  }
}

export const createAdkCloudSetupAdapter = (tools: Record<string, Tool>) =>
  createAdkLanguageSetupAdapter(
    {
      model: 'gemini-3.8-flash',
      label: 'ADK Gemini Flash',
      accentColor: '#4285F4',
      icon: 'psychology',
      builtIn: true,
      apiKey: getGoogleApiKey(),
    },
    tools
  )

export const createAdkNanoSetupAdapter = (tools: Record<string, Tool>) =>
  createAdkLanguageSetupAdapter(
    {
      model: 'gemini-nano',
      label: 'ADK Gemini Nano',
      accentColor: '#34A853',
      icon: 'memory',
      builtIn: true,
    },
    tools
  )
