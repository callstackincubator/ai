import {
  coreAI,
  type CoreAILanguageModel,
  downloadModel,
  getModelSource,
} from '@react-native-ai/core-ai'
import RNBlobUtil from 'react-native-blob-util'
import { afterAll, beforeAll } from 'react-native-harness'

import { cats, catsVideo } from '../fixtures'

// Downloads a hosted model before the tests of a file, on the first run only
function downloadBeforeAll(id: string, repo: string, folder: string) {
  beforeAll(async () => {
    await downloadModel({ id, repo, folder })
  })
  return getModelSource(id)
}

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
    model = coreAI.languageModel({
      id: LANGUAGE_MODEL.id,
      source: await downloadModel(LANGUAGE_MODEL),
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
  'edsr-x2.aimodel': 'grabbou/edsr-x2-CoreAI',
  // pvt-v2-b0.aimodel and labels.json
  'pvt-v2-b0': 'grabbou/pvt-v2-b0-CoreAI',
  'da3-small.aimodel': 'grabbou/depth-anything-3-small-CoreAI',
}

export function setupVisionModel(name: keyof typeof VISION_MODELS) {
  const source = downloadBeforeAll(name, VISION_MODELS[name], name)

  return {
    id: name,
    sourceType: 'file',
    sourceUri: source.uri,
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
  const source = downloadBeforeAll(
    IMAGE_MODEL.id,
    IMAGE_MODEL.repo,
    IMAGE_MODEL.folder
  )

  return coreAI.imageModel({
    id: IMAGE_MODEL.id,
    source,
  })
}

// Parakeet TDT 0.6B v3 exported for streaming with the coreai-models recipe,
// so it transcribes audio of any length
const SPEECH_MODEL = {
  id: 'parakeet-tdt-0.6b-v3',
  repo: 'grabbou/parakeet-tdt-0.6b-v3-CoreAI',
  folder: 'streaming',
}

export function setupSpeechModel() {
  const source = downloadBeforeAll(
    SPEECH_MODEL.id,
    SPEECH_MODEL.repo,
    SPEECH_MODEL.folder
  )

  return coreAI.transcriptionModel({
    id: SPEECH_MODEL.id,
    source,
  })
}

// CLIP ViT-B/32 with separate text and image encoders, and its tokenizer
const EMBEDDING_MODEL = {
  id: 'clip-vit-base-patch32',
  repo: 'grabbou/clip-vit-base-patch32-CoreAI',
  folder: 'clip-vit-base-patch32',
}

export function setupEmbeddingModel() {
  const source = downloadBeforeAll(
    EMBEDDING_MODEL.id,
    EMBEDDING_MODEL.repo,
    EMBEDDING_MODEL.folder
  )

  return coreAI.embeddingModel({
    id: EMBEDDING_MODEL.id,
    source,
  })
}

// Wan 2.1 T2V 1.3B exported for iOS with the coreai-models recipe, 4-bit:
// the transformer, the UMT5 text encoder and the VAE decoder
const VIDEO_MODEL = {
  id: 'wan2.1-t2v-1.3b',
  repo: 'grabbou/Wan2.1-T2V-1.3B-CoreAI',
  folder: 'ios',
}

export function setupVideoModel() {
  const source = downloadBeforeAll(
    VIDEO_MODEL.id,
    VIDEO_MODEL.repo,
    VIDEO_MODEL.folder
  )

  return coreAI.videoModel({
    id: VIDEO_MODEL.id,
    source,
  })
}

// Native tasks read images from files, so the fixture is written to one
export async function writeCatsImage() {
  const path = `${RNBlobUtil.fs.dirs.CacheDir}/harness-cats.jpg`
  await RNBlobUtil.fs.writeFile(path, cats, 'base64')
  return path
}

export async function writeCatsVideo() {
  const path = `${RNBlobUtil.fs.dirs.CacheDir}/harness-cats.mp4`
  await RNBlobUtil.fs.writeFile(path, catsVideo, 'base64')
  return path
}

// SAM 3 video exported with the coreai-models recipe at 672 px
// (models/sam3_video/export.py --dtype float16 --image-size 672), under the
// SAM License
const VIDEO_SEGMENTATION_MODEL = {
  id: 'sam3-video',
  repo: 'grabbou/sam3-video-CoreAI',
  folder: 'sam3-video',
}

export function setupVideoSegmentationModel() {
  const source = downloadBeforeAll(
    VIDEO_SEGMENTATION_MODEL.id,
    VIDEO_SEGMENTATION_MODEL.repo,
    VIDEO_SEGMENTATION_MODEL.folder
  )

  return {
    id: VIDEO_SEGMENTATION_MODEL.id,
    sourceType: 'file',
    sourceUri: source.uri,
  }
}
