import type { LanguageModelV4 } from '@ai-sdk/provider'
import type { Tool } from '@ai-sdk/provider-utils'
import { type AdkModelType, createAdkProvider } from '@react-native-ai/adk'

import { getGoogleApiKey } from '../../config/adk'
import type { Availability, SetupAdapter } from '../../config/providers.common'

type AdkAdapterOptions = {
  modelType: AdkModelType
  modelName: string
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
    modelType: options.modelType,
    modelName: options.modelName,
    apiKey: options.apiKey,
    instruction:
      'You are a helpful assistant in the Callstack React Native AI demo app.',
    availableTools: tools,
  })
  const model = provider()

  return {
    model,
    modelId: `adk-${options.modelName}`,
    display: {
      label: options.label,
      accentColor: options.accentColor,
      icon: options.icon,
    },
    builtIn: options.builtIn,
    imageInput: true,
    isAvailable(): Availability {
      if (options.modelType === 'gemini' && !options.apiKey) {
        return 'no'
      }
      return 'yes'
    },
    async download(onProgress) {
      let bytesToDownload: number | undefined
      await provider.prepareNano({
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
      modelType: 'gemini',
      modelName: 'gemini-2.5-flash',
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
      modelType: 'genai-nano',
      modelName: 'gemini-nano',
      label: 'ADK Gemini Nano',
      accentColor: '#34A853',
      icon: 'memory',
      builtIn: true,
    },
    tools
  )
