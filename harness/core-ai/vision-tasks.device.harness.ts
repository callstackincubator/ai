import {
  CoreAI,
  type CoreAIClassificationOutput,
  type CoreAIDepthOutput,
  type CoreAISuperResolutionOutput,
  readTensor,
} from '@react-native-ai/core-ai'
import { beforeAll, describe, expect, it } from 'react-native-harness'

import { setupVisionModel, writeCatsImage } from './helpers'

const upscaler = setupVisionModel('edsr-x2.aimodel')
const classifier = setupVisionModel('pvt-v2-b0')
const depthModel = setupVisionModel('da3-small.aimodel')

let imageUri: string

beforeAll(async () => {
  imageUri = await writeCatsImage()
})

const run = async <Output>(
  task: string,
  model: ReturnType<typeof setupVisionModel>,
  options: object = {}
) =>
  (
    (await CoreAI.runTask(task, model, { imageUri }, options)) as {
      output: Output
    }
  ).output

// Width and height from the IHDR chunk, which follows the 8-byte signature
function pngSize(base64: string) {
  const bytes = Uint8Array.from(atob(base64).slice(0, 24), (char) =>
    char.charCodeAt(0)
  )
  const view = new DataView(bytes.buffer)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

describe('core-ai super-resolution', () => {
  it('upscales the image twice', async () => {
    const output = await run<CoreAISuperResolutionOutput>(
      'super-resolution',
      upscaler
    )

    expect(output).toMatchObject({ width: 640, height: 480, scale: 2 })
    expect(pngSize(output.image)).toEqual({ width: 640, height: 480 })
  })

  it('upscales in tiles', async () => {
    // 320x240 in tiles of 100 px with 16 px overlap is 4 × 3 tiles
    const output = await run<CoreAISuperResolutionOutput>(
      'super-resolution',
      upscaler,
      { tileSize: 100 }
    )

    expect(pngSize(output.image)).toEqual({ width: 640, height: 480 })
  })

  it('rejects a tile size of zero', async () => {
    await expect(
      run('super-resolution', upscaler, { tileSize: 0 })
    ).rejects.toThrow('tileSize must be positive')
  })
})

describe('core-ai classification', () => {
  it('finds a cat', async () => {
    const { classifications } = await run<CoreAIClassificationOutput>(
      'classification',
      classifier
    )

    expect(classifications).toHaveLength(5)
    // ImageNet indices 281-285 are the domestic cats
    expect(classifications[0].index).toBeGreaterThanOrEqual(281)
    expect(classifications[0].index).toBeLessThanOrEqual(285)
    expect(classifications[0].label).toContain('cat')
  })

  it('sorts the top classes by confidence', async () => {
    const { classifications } = await run<CoreAIClassificationOutput>(
      'classification',
      classifier,
      { topK: 3 }
    )

    expect(classifications).toHaveLength(3)
    const confidences = classifications.map(({ confidence }) => confidence)
    expect(confidences).toEqual([...confidences].sort((a, b) => b - a))
    expect(confidences.reduce((sum, value) => sum + value, 0)).toBeLessThan(
      1.001
    )
  })

  it('returns at least one class', async () => {
    const { classifications } = await run<CoreAIClassificationOutput>(
      'classification',
      classifier,
      { topK: 0 }
    )

    expect(classifications).toHaveLength(1)
  })

  it('rejects a mean without one value per channel', async () => {
    await expect(
      run('classification', classifier, { mean: [0.5] })
    ).rejects.toThrow('one non-zero value per RGB channel')
  })
})

describe('core-ai depth estimation', () => {
  it('returns the depth map and an image at input size', async () => {
    const output = await run<CoreAIDepthOutput>('depth', depthModel)

    expect(output).toMatchObject({ width: 224, height: 224 })
    expect(output.depth.shape).toEqual([224, 224])
    expect(output.max).toBeGreaterThan(output.min)
    expect(pngSize(output.image)).toEqual({ width: 320, height: 240 })
  })

  it('puts the cat nearer than the wall behind it', async () => {
    const { depth } = await run<CoreAIDepthOutput>('depth', depthModel)
    const map = readTensor(depth)
    const at = (row: number, column: number) => map[row * 224 + column]

    // The left cat, and the wall above the cats
    expect(at(112, 50)).toBeLessThan(at(5, 112))
  })
})
