import type { LanguageModelV3 } from '@ai-sdk/provider'
import { mlc } from '@react-native-ai/mlc'
import { File, Paths } from 'expo-file-system'
import { Platform } from 'react-native'

import type { Availability, SetupAdapter } from '../../config/providers.common'

export const createMLCLanguageSetupAdapter = (
  modelId: string
): SetupAdapter<LanguageModelV3> => {
  const model = mlc.languageModel(modelId)

  return {
    model,
    modelId: model.modelId,
    display: {
      label: model.modelId,
      accentColor: '#eb3c25',
      icon: 'cpu',
    },
    builtIn: false,
    isAvailable(): Availability {
      return new File(
        Paths.document,
        ...(Platform.select({
          ios: ['bundle'],
        }) ?? []),
        model.modelId,
        'tensor-cache.json'
      ).exists
        ? 'yes'
        : 'availableForDownload'
    },
    async download(onProgress) {
      await model.download(async (event) => {
        if (Number.isNaN(event.percentage)) {
          // handle broken partly-downloaded file
          onProgress(0)
          await model.remove()
          return
        }

        onProgress(event.percentage)
      })
    },
    async delete() {
      await model.unload()
      await model.remove()
    },
    async unload() {
      await model.unload()
    },
    async prepare() {
      await model.prepare()
    },
  }
}
