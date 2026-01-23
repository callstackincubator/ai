import type { LanguageModelV3 } from '@ai-sdk/provider'
import { llama } from '@react-native-ai/llama'

import {
  downloadModel,
  getModelPath,
  isModelDownloaded,
  removeModel,
} from '../../../../../packages/llama/src/storage'
import type { Availability, SetupAdapter } from '../../config/providers'

export const createLlamaLanguageSetupAdapter = (
  modelId: string
): SetupAdapter<LanguageModelV3> => {
  const modelPath = getModelPath(modelId)
  const model = llama.languageModel(modelPath, {
    contextParams: {
      n_ctx: 2048,
      n_gpu_layers: 99,
    },
  })
  return {
    model,
    label: modelId,
    async isAvailable(): Promise<Availability> {
      const downloaded = await isModelDownloaded(modelId)
      return downloaded ? 'yes' : 'availableForDownload'
    },
    async download(onProgress) {
      await downloadModel(modelId, (progress) => {
        onProgress(progress.percentage)
      })
    },
    async delete() {
      await removeModel(modelId)
    },
    async unload() {
      await model.unload()
    },
    async prepare() {
      await model.prepare()
    },
  }
}
