import {
  clearSpecializationCache,
  CoreAI,
  type CoreAILoadedModel,
  type CoreAIModelConfig,
  type CoreAIModelInfo,
  downloadModel,
  getModelSource,
  isModelDownloaded,
  removeModel,
  specializeModel,
} from '@react-native-ai/core-ai'
import RNBlobUtil from 'react-native-blob-util'
import { afterAll, describe, expect, it } from 'react-native-harness'

import { setupLanguageModel } from './helpers'

// EDSR x2 is small, so the tests download it under an id of their own
const EDSR = {
  id: 'harness-storage-edsr-x2.aimodel',
  repo: 'grabbou/edsr-x2-CoreAI',
  folder: 'edsr-x2.aimodel',
}
// Depth Anything 3 small is a single 100 MB file, so a download stops midway
const DEPTH = {
  id: 'harness-storage-da3-small.aimodel',
  repo: 'grabbou/depth-anything-3-small-CoreAI',
  folder: 'da3-small.aimodel',
}
const edsrSource = getModelSource(EDSR.id)
const config: CoreAIModelConfig = {
  id: EDSR.id,
  source: edsrSource,
  task: 'super-resolution',
}

const assetsOf = (info: CoreAIModelInfo) =>
  (info.metadata as { assets: { cached: boolean; computeUnits: string }[] })
    .assets

afterAll(async () => {
  await removeModel(config)
})

describe('core-ai model storage', () => {
  it('downloads a model with progress', async () => {
    await removeModel(config)
    expect(isModelDownloaded(EDSR.id)).toBe(false)

    const progress: number[] = []
    const source = await downloadModel({
      ...EDSR,
      onProgress: ({ percentage }) => progress.push(percentage),
    })

    expect(source).toEqual(edsrSource)
    expect(progress.at(-1)).toBe(100)
    expect(isModelDownloaded(EDSR.id)).toBe(true)
    const info = (await CoreAI.inspectModel({
      id: EDSR.id,
      sourceType: 'file',
      sourceUri: source.uri,
    })) as CoreAIModelInfo
    expect(info.functions.map(({ name }) => name)).toEqual(['main'])
  })

  it('resumes a download that stopped midway', async () => {
    const source = getModelSource(DEPTH.id)
    const weights = `${source.uri}.partial/main.mlirb`
    await removeModel({ id: DEPTH.id, source })
    await RNBlobUtil.fs.unlink(`${source.uri}.partial`).catch(() => {})

    const controller = new AbortController()
    await expect(
      downloadModel({
        ...DEPTH,
        signal: controller.signal,
        onProgress: ({ percentage }) => {
          if (percentage >= 30) {
            controller.abort()
          }
        },
      })
    ).rejects.toThrow()
    expect(isModelDownloaded(DEPTH.id)).toBe(false)
    const partialBytes = Number((await RNBlobUtil.fs.stat(weights)).size)
    expect(partialBytes).toBeGreaterThan(0)

    // The weights continue from the bytes on disk instead of starting over
    const written: number[] = []
    await downloadModel({
      ...DEPTH,
      onProgress: ({ bytesWritten }) => written.push(bytesWritten),
    })
    expect(written.find((bytes) => bytes > 1000)).toBeGreaterThanOrEqual(
      partialBytes
    )
    expect(isModelDownloaded(DEPTH.id)).toBe(true)
    expect(await RNBlobUtil.fs.exists(`${source.uri}.partial`)).toBe(false)

    await removeModel({ id: DEPTH.id, source })
  })

  it('returns a downloaded model without downloading it again', async () => {
    const progress: number[] = []
    await downloadModel({
      ...EDSR,
      onProgress: ({ percentage }) => progress.push(percentage),
    })

    expect(progress).toEqual([])
  })

  it('specializes ahead of time into the cache that loads use', async () => {
    await clearSpecializationCache(config)

    const first = await specializeModel(config, { computeUnits: 'gpu' })
    expect(assetsOf(first)).toEqual([
      expect.objectContaining({ cached: false, computeUnits: 'gpu' }),
    ])

    const second = await specializeModel(config, { computeUnits: 'gpu' })
    expect(assetsOf(second)).toEqual([
      expect.objectContaining({ cached: true, computeUnits: 'gpu' }),
    ])

    // Other compute units are entries of their own
    const cpu = await specializeModel(config, { computeUnits: 'cpu' })
    expect(assetsOf(cpu)).toEqual([
      expect.objectContaining({ cached: false, computeUnits: 'cpu' }),
    ])
  })

  it('clears the specialized assets of a model', async () => {
    await specializeModel(config)
    await clearSpecializationCache(config)

    const info = await specializeModel(config)
    expect(assetsOf(info)).toEqual([expect.objectContaining({ cached: false })])
  })

  it('specializes for the options raw loads use', async () => {
    await clearSpecializationCache(config)
    const loaded = (await CoreAI.loadModel(
      {
        id: EDSR.id,
        sourceType: 'file',
        sourceUri: edsrSource.uri,
        task: 'raw',
      },
      { computeUnits: 'neural-engine' }
    )) as CoreAILoadedModel
    await CoreAI.unloadModel(loaded.modelHandle)

    const info = await specializeModel(
      { ...config, task: 'raw' },
      { computeUnits: 'neural-engine' }
    )
    expect(assetsOf(info)).toEqual([
      expect.objectContaining({ cached: true, computeUnits: 'neural-engine' }),
    ])
  })

  it('removes a model with its specialized assets', async () => {
    await specializeModel(config)
    await removeModel(config)

    expect(isModelDownloaded(EDSR.id)).toBe(false)
    expect(await RNBlobUtil.fs.exists(edsrSource.uri)).toBe(false)
  })
})

describe('core-ai language model specialization', () => {
  const getModel = setupLanguageModel()

  // The language model loaded with the pipeline's own options, so finding its
  // assets in the cache shows specializeModel uses the same ones
  it('matches the options the language pipeline loads with', async () => {
    const info = await getModel().specialize()

    expect(assetsOf(info).length).toBeGreaterThan(0)
    expect(assetsOf(info)).toEqual(
      assetsOf(info).map(() => expect.objectContaining({ cached: true }))
    )
  })
})
