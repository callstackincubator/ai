import type { SpeechModelV3 } from '@ai-sdk/provider'
import { llama, LlamaEngine } from '@react-native-ai/llama'

import type { Availability, SetupAdapter } from '../../config/providers'

interface LlamaSpeechSetupOptions {
  modelId: string
  vocoderId: string
}

export const createLlamaSpeechSetupAdapter = ({
  modelId,
  vocoderId,
}: LlamaSpeechSetupOptions): SetupAdapter<SpeechModelV3> => {
  const modelPath = LlamaEngine.storage.getModelPath(modelId)
  const vocoderPath = LlamaEngine.storage.getModelPath(vocoderId)
  const model = llama.speechModel(modelPath, {
    vocoderPath,
    vocoderBatchSize: 4096,
    contextParams: {
      n_ctx: 2048,
      n_gpu_layers: 99,
    },
  })
  return {
    model,
    label: modelId,
    async isAvailable(): Promise<Availability> {
      const [modelReady, vocoderReady] = await Promise.all([
        LlamaEngine.storage.isModelDownloaded(modelId),
        LlamaEngine.storage.isModelDownloaded(vocoderId),
      ])
      return modelReady && vocoderReady ? 'yes' : 'availableForDownload'
    },
    async download(onProgress) {
      const [modelReady, vocoderReady] = await Promise.all([
        LlamaEngine.storage.isModelDownloaded(modelId),
        LlamaEngine.storage.isModelDownloaded(vocoderId),
      ])
      if (!modelReady || !vocoderReady) {
        await LlamaEngine.storage.downloadModel(modelId, (progress) => {
          onProgress(Math.round(progress.percentage * 0.5))
        })
        await LlamaEngine.storage.downloadModel(vocoderId, (progress) => {
          onProgress(Math.round(50 + progress.percentage * 0.5))
        })
      }
    },
    async delete() {
      await LlamaEngine.storage.removeModel(modelId)
      await LlamaEngine.storage.removeModel(vocoderId)
    },
    async unload() {
      await model.unload()
    },
    async prepare() {
      await model.prepare()
    },
  }
}
