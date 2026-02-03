import type { LanguageModelV3 } from '@ai-sdk/provider'
import { AISDKStorage } from '@react-native-ai/common'
import { llama } from '@react-native-ai/llama'
import { ToolSet } from 'ai'

import type { Availability, SetupAdapter } from '../../config/providers'

const llamaStorage = new AISDKStorage('llama', 'gguf')

export const createLlamaLanguageSetupAdapter = (
  modelId: string,
  tools: ToolSet = {}
): SetupAdapter<LanguageModelV3> => {
  const modelPath = llamaStorage.getModelPath(modelId)
  const model = llama.languageModel(modelPath, {
    contextParams: {
      n_ctx: 2048,
      n_gpu_layers: 99,
    },
  })
  return {
    model,
    tools,
    label: `Llama (${modelId})`,
    async isAvailable(): Promise<Availability> {
      const downloaded = await llamaStorage.isModelDownloaded(modelId)
      return downloaded ? 'yes' : 'availableForDownload'
    },
    async download(onProgress) {
      await llamaStorage.downloadModel(modelId, (progress) => {
        onProgress(progress.percentage)
      })
    },
    async delete() {
      await llamaStorage.removeModel(modelId)
    },
    async unload() {
      await model.unload()
    },
    async prepare() {
      await model.prepare()
    },
  }
}
