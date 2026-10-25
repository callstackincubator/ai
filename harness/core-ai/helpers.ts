import { coreAI, type CoreAILanguageModel } from '@react-native-ai/core-ai'
import RNBlobUtil from 'react-native-blob-util'
import { afterAll, beforeAll } from 'react-native-harness'

import {
  CORE_AI_STORAGE_PATH,
  downloadHubFolder,
} from '../../apps/expo-example/src/utils/coreAIStorageUtils'
import { cats } from '../fixtures'

// Qwen3 0.6B exported for iOS with the coreai-models recipe, as in the example
// app. The model is downloaded on the first run
const LANGUAGE_MODEL = {
  id: 'qwen3-0.6b',
  repo: 'grabbou/qwen3-0.6b-CoreAI',
  folder: 'ios',
}

// Loads the language model before the tests of a file and unloads it after
export function setupLanguageModel() {
  let model: CoreAILanguageModel | undefined

  beforeAll(async () => {
    const path = `${CORE_AI_STORAGE_PATH}/${LANGUAGE_MODEL.id}`
    if (!(await RNBlobUtil.fs.exists(path))) {
      await downloadHubFolder(LANGUAGE_MODEL.repo, LANGUAGE_MODEL.folder, path)
    }
    model = coreAI.languageModel({
      id: LANGUAGE_MODEL.id,
      source: { type: 'file', uri: path },
      variant: 'iOS',
    })
    await model.prepare()
  })

  afterAll(async () => {
    await model?.unload()
  })

  return () => model!
}

// Vision models exported with the coreai-models recipes. Each repo holds the
// model in a folder of the same name, downloaded on the first run
const VISION_MODELS = {
  'yolos-tiny.aimodel': 'grabbou/yolos-tiny-CoreAI',
  'efficient-sam': 'grabbou/EfficientSAM-Ti-CoreAI',
}

export function setupVisionModel(name: keyof typeof VISION_MODELS) {
  const path = `${CORE_AI_STORAGE_PATH}/${name}`

  beforeAll(async () => {
    if (!(await RNBlobUtil.fs.exists(path))) {
      await downloadHubFolder(VISION_MODELS[name], name, path)
    }
  })

  return {
    id: name,
    sourceType: 'file',
    sourceUri: path,
  }
}

// FLUX.2 klein 4B exported for iOS with the coreai-models recipe: the 512x512
// transformer, text encoder and decoder, 4-bit
const IMAGE_MODEL = {
  id: 'flux2-klein-4b',
  repo: 'grabbou/FLUX.2-klein-4B-CoreAI',
  folder: 'ios',
}

export function setupImageModel() {
  const path = `${CORE_AI_STORAGE_PATH}/${IMAGE_MODEL.id}`

  beforeAll(async () => {
    if (!(await RNBlobUtil.fs.exists(path))) {
      await downloadHubFolder(IMAGE_MODEL.repo, IMAGE_MODEL.folder, path)
    }
  })

  return coreAI.imageModel({
    id: IMAGE_MODEL.id,
    source: { type: 'file', uri: path },
  })
}

// Native tasks read images from files, so the fixture is written to one
export async function writeCatsImage() {
  const path = `${RNBlobUtil.fs.dirs.CacheDir}/harness-cats.jpg`
  await RNBlobUtil.fs.writeFile(path, cats, 'base64')
  return path
}
