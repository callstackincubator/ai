import type { SpeechModelV3 } from '@ai-sdk/provider'
import {
  downloadModel,
  getModelPath,
  isModelDownloaded,
  llama,
  removeModel,
} from '@react-native-ai/llama'

import type { Availability, SetupAdapter } from '../../config/providers'

interface LlamaSpeechSetupOptions {
  modelId: string
  vocoderId: string
}

export const createLlamaSpeechSetupAdapter = ({
  modelId,
  vocoderId,
}: LlamaSpeechSetupOptions): SetupAdapter<SpeechModelV3> => {
  const modelPath = getModelPath(modelId)
  const vocoderPath = getModelPath(vocoderId)
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
        isModelDownloaded(modelId),
        isModelDownloaded(vocoderId),
      ])
      return modelReady && vocoderReady ? 'yes' : 'availableForDownload'
    },
    async download(onProgress) {
      const [modelReady, vocoderReady] = await Promise.all([
        isModelDownloaded(modelId),
        isModelDownloaded(vocoderId),
      ])
      if (!modelReady || !vocoderReady) {
        await downloadModel(modelId, (progress) => {
          onProgress(Math.round(progress.percentage * 0.5))
        })
        await downloadModel(vocoderId, (progress) => {
          onProgress(Math.round(50 + progress.percentage * 0.5))
        })
      }
    },
    async delete() {
      await removeModel(modelId)
      await removeModel(vocoderId)
    },
    async unload() {
      await model.unload()
    },
    async prepare() {
      await model.prepare()
    },
  }
}
