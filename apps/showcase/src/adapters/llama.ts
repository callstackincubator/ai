import type { LanguageModelV4 } from '@ai-sdk/provider'
import {
  downloadModel,
  getModelPath,
  llama,
  removeModel,
} from '@react-native-ai/llama'
import { File } from 'expo-file-system'

import type { Availability, SetupAdapter } from './types'

function isDownloaded(modelId: string): boolean {
  let path = getModelPath(modelId)

  // expo-file-system requires that this URI starts with the file:// protocol
  if (!path.startsWith('file://')) {
    path = `file://${path}`
  }

  return new File(path).exists
}

export function createLlamaLanguageSetupAdapter({
  label,
  description,
  sizeBytes,
  modelId,
  projectorId,
}: {
  label: string
  description: string
  sizeBytes: number
  // HuggingFace ID of the GGUF model
  modelId: string
  // HuggingFace ID of the multimodal projector (mmproj) for image input
  projectorId?: string
}): SetupAdapter<LanguageModelV4> {
  const model = llama.languageModel(getModelPath(modelId), {
    projectorPath: projectorId ? getModelPath(projectorId) : undefined,
    contextParams: {
      // Images take hundreds of tokens each
      n_ctx: projectorId ? 4096 : 2048,
      n_gpu_layers: 99,
    },
  })
  const files = projectorId ? [modelId, projectorId] : [modelId]
  return {
    model,
    modelId: model.modelId,
    label,
    description,
    runtime: 'llama',
    capabilities: projectorId ? ['vision', 'reasoning'] : ['reasoning'],
    sizeBytes,
    builtIn: false,
    imageInput: Boolean(projectorId),
    isAvailable(): Availability {
      return files.every(isDownloaded) ? 'yes' : 'availableForDownload'
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
    async prepare() {
      await model.prepare()
    },
  }
}
