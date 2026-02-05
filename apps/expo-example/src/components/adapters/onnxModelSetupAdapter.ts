import type { LanguageModelV3 } from '@ai-sdk/provider'
import { onnx } from '@react-native-ai/onnx-wrapper'

import type { Availability, SetupAdapter } from '../../config/providers.common'

export const createONNXLanguageSetupAdapter = (
  modelId: string
): SetupAdapter<LanguageModelV3> => {
  const model = onnx.languageModel(modelId)

  return {
    model,
    modelId: model.modelId,
    display: {
      label: model.modelId,
      accentColor: '#ebdb25',
      icon: 'cpu',
    },
    builtIn: false,
    async isAvailable(): Promise<Availability> {
      return (await model.isDownloaded()) ? 'yes' : 'availableForDownload'
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
