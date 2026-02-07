import type { LanguageModelV3 } from '@ai-sdk/provider'
import { llama } from '@react-native-ai/llama'
import { ToolSet } from 'ai'

import {
  downloadModel,
  getModelPath,
  removeModel,
} from '../../../../../packages/llama/src/storage'
import type { Availability, SetupAdapter } from '../../config/providers.common'
import { isLlamaModelDownloaded } from '../../utils/llamaStorageUtils'

export const createLlamaLanguageSetupAdapter = (
  hfModelId: string,
  tools: ToolSet = {}
): SetupAdapter<LanguageModelV3> => {
  const modelPath = getModelPath(hfModelId)
  const model = llama.languageModel(modelPath, {
    contextParams: {
      n_ctx: 2048,
      n_gpu_layers: 99,
    },
  })
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
      const downloaded = isLlamaModelDownloaded(hfModelId)
      return downloaded ? 'yes' : 'availableForDownload'
    },
    async download(onProgress) {
      await downloadModel(hfModelId, (progress) => {
        onProgress(progress.percentage)
      })
    },
    async delete() {
      await removeModel(hfModelId)
    },
    async unload() {
      await model.unload()
    },
    async prepare() {
      await model.prepare()
    },
  }
}
