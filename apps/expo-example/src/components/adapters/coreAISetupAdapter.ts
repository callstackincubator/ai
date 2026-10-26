import type { LanguageModelV4 } from '@ai-sdk/provider'
import {
  coreAI,
  downloadModel,
  getModelSource,
  isModelDownloaded,
} from '@react-native-ai/core-ai'

import type { SetupAdapter } from '../../config/providers.common'

export const createCoreAILanguageSetupAdapter = ({
  id,
  repo,
  folder,
}: {
  id: string
  // Hugging Face repo and the folder in it that holds metadata.json
  repo: string
  folder: string
}): SetupAdapter<LanguageModelV4> => {
  const model = coreAI.languageModel({
    id,
    source: getModelSource(id),
    variant: 'iOS',
  })
  return {
    model,
    modelId: model.modelId,
    display: {
      label: `Core AI ${id}`,
      accentColor: '#7C3AED',
      icon: 'memory',
    },
    builtIn: false,
    isAvailable() {
      return isModelDownloaded(id) ? 'yes' : 'availableForDownload'
    },
    async download(onProgress) {
      await downloadModel({
        id,
        repo,
        folder,
        onProgress: ({ percentage }) => onProgress(percentage),
      })
      // Specializing now keeps the first load from doing it
      await model.specialize()
    },
    async delete() {
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
