import type { LanguageModelV3 } from '@ai-sdk/provider'
import { llama, LlamaEngine } from '@react-native-ai/llama'
import { ToolSet } from 'ai'

import type { Availability, SetupAdapter } from '../../config/providers'

export const createLlamaLanguageSetupAdapter = (
  modelId: string,
  tools: ToolSet = {}
): SetupAdapter<LanguageModelV3> => {
  const modelPath = LlamaEngine.storage.getModelPath(modelId)
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
      const downloaded = await LlamaEngine.storage.isModelDownloaded(modelId)
      return downloaded ? 'yes' : 'availableForDownload'
    },
    async download(onProgress) {
      await LlamaEngine.storage.downloadModel(modelId, (progress) => {
        onProgress(progress.percentage)
      })
    },
    async delete() {
      await LlamaEngine.storage.removeModel(modelId)
    },
    async unload() {
      await model.unload()
    },
    async prepare() {
      await model.prepare()
    },
  }
}
