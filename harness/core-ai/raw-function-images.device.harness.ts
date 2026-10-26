import {
  CoreAI,
  type CoreAILoadedModel,
  type CoreAIRawFunctionResult,
  createTensor,
  readTensor,
} from '@react-native-ai/core-ai'
import RNBlobUtil from 'react-native-blob-util'
import { afterAll, beforeAll, describe, expect, it } from 'react-native-harness'

import { channelMeanModel, redSquare } from '../fixtures'

let loaded: CoreAILoadedModel
let redSquareUri: string

beforeAll(async () => {
  const modelPath = `${RNBlobUtil.fs.dirs.CacheDir}/channel-mean.aimodel`
  if (!(await RNBlobUtil.fs.exists(modelPath))) {
    await RNBlobUtil.fs.mkdir(modelPath)
  }
  for (const [file, base64] of Object.entries(channelMeanModel)) {
    await RNBlobUtil.fs.writeFile(`${modelPath}/${file}`, base64, 'base64')
  }
  redSquareUri = `${RNBlobUtil.fs.dirs.CacheDir}/harness-red-square.png`
  await RNBlobUtil.fs.writeFile(redSquareUri, redSquare, 'base64')

  loaded = (await CoreAI.loadModel(
    {
      id: 'channel-mean.aimodel',
      sourceType: 'file',
      sourceUri: modelPath,
      task: 'raw',
    },
    {}
  )) as CoreAILoadedModel
})

afterAll(async () => {
  await CoreAI.unloadModel(loaded.modelHandle)
})

const scale = (value: number) =>
  createTensor('float32', [1], new Float32Array([value]))

const channelMeans = async (inputs: object) => {
  const { outputs } = (await CoreAI.runRawFunction(
    loaded.modelHandle,
    'main',
    inputs,
    {}
  )) as CoreAIRawFunctionResult
  return Array.from(
    readTensor(outputs.mean as typeof outputs.mean & { dataType: 'float32' })
  )
}

describe('core-ai raw functions with image inputs', () => {
  it('describes image inputs with their size and pixel format', () => {
    const [main] = loaded.info.functions
    expect(main.inputs).toEqual(
      expect.arrayContaining([
        {
          name: 'image',
          dataType: 'image',
          width: 64,
          height: 48,
          pixelFormat: '32BGRA',
        },
        { name: 'scale', dataType: 'float32', shape: [1] },
      ])
    )
  })

  it('runs a function on an image file next to a tensor', async () => {
    // The 32x32 red square, stretched to 64x48 BGRA, times 2
    const [blue, green, red, alpha] = await channelMeans({
      image: { imageUri: redSquareUri },
      scale: scale(2),
    })

    expect(blue).toBeCloseTo(0, 0)
    expect(green).toBeCloseTo(0, 0)
    expect(red).toBeCloseTo(510, 0)
    expect(alpha).toBeCloseTo(510, 0)
  })

  it('takes file:// URLs', async () => {
    const [, , red] = await channelMeans({
      image: { imageUri: `file://${redSquareUri}` },
      scale: scale(1),
    })

    expect(red).toBeCloseTo(255, 0)
  })

  it('rejects image inputs without an image file', async () => {
    await expect(
      channelMeans({ image: scale(1), scale: scale(1) })
    ).rejects.toThrow('needs { imageUri }')
    await expect(
      channelMeans({
        image: { imageUri: `${RNBlobUtil.fs.dirs.CacheDir}/missing.png` },
        scale: scale(1),
      })
    ).rejects.toThrow('Could not load image')
  })
})
