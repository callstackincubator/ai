import type { LanguageModelV4 } from '@ai-sdk/provider'
import { llama } from '@react-native-ai/llama'

import {
  downloadModel,
  getModelPath,
  removeModel,
} from '../../../../../packages/llama/src/storage'
import type { Availability, SetupAdapter } from '../../config/providers.common'
import { isLlamaModelDownloaded } from '../../utils/llamaStorageUtils'

export const createLlamaLanguageSetupAdapter = (
  hfModelId: string,
  // HuggingFace ID of the multimodal projector (mmproj) for vision/audio input
  projectorId?: string
): SetupAdapter<LanguageModelV4> => {
  const modelPath = getModelPath(hfModelId)
  const model = llama.languageModel(modelPath, {
    projectorPath: projectorId ? getModelPath(projectorId) : undefined,
    contextParams: {
      // Images and audio take hundreds of tokens each
      n_ctx: projectorId ? 4096 : 2048,
      n_gpu_layers: 99,
    },
  })
  const files = projectorId ? [hfModelId, projectorId] : [hfModelId]
  // Extract friendly name from HuggingFace model ID
  const filename = hfModelId.split('/').pop() ?? hfModelId
  const friendlyName = filename.replace(/\.gguf$/, '')
  return {
    model,
    modelId: model.modelId,
    display: {
      label: friendlyName,
      accentColor: '#F97316',
      icon: 'memory',
    },
    builtIn: false,
    isAvailable(): Availability {
      const downloaded = files.every(isLlamaModelDownloaded)
      return downloaded ? 'yes' : 'availableForDownload'
    },
    async download(onProgress) {
      for (const [index, file] of files.entries()) {
        await downloadModel(file, (progress) => {
          onProgress(
            Math.round((index * 100 + progress.percentage) / files.length)
          )
        })
      }
    },
    async delete() {
      await Promise.all(files.map(removeModel))
    },
    async unload() {
      await model.unload()
    },
    async prepare() {
      await model.prepare()
    },
  }
}
