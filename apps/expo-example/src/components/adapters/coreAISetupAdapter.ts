import type { LanguageModelV4 } from '@ai-sdk/provider'
import { coreAI } from '@react-native-ai/core-ai'
import { Directory } from 'expo-file-system'
import RNBlobUtil from 'react-native-blob-util'

import type { SetupAdapter } from '../../config/providers.common'
import {
  CORE_AI_STORAGE_PATH,
  downloadHubFolder,
} from '../../utils/coreAIStorageUtils'

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
  const modelPath = `${CORE_AI_STORAGE_PATH}/${id}`
  const model = coreAI.languageModel({
    id,
    source: modelPath,
  })
  // expo-file-system requires that this URI starts with the file:// protocol
  const directory = new Directory(`file://${modelPath}`)
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
      return directory.exists ? 'yes' : 'availableForDownload'
    },
    async download(onProgress) {
      await downloadHubFolder(repo, folder, modelPath, onProgress)
    },
    async delete() {
      await model.unload()
      await RNBlobUtil.fs.unlink(modelPath)
    },
    async unload() {
      await model.unload()
    },
    async prepare() {
      await model.prepare()
    },
  }
}
