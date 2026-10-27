import {
  CoreAI,
  type CoreAILoadedModel,
  type CoreAIModelInfo,
  type CoreAIRawFunctionResult,
  createTensor,
  readTensor,
} from '@react-native-ai/core-ai'
import { afterAll, beforeAll, describe, expect, it } from 'react-native-harness'

import { setupVisionModel } from './helpers'

// EDSR x2 takes [batch, 3, height, width] float16 RGB in 0...1, with dynamic
// height and width, and returns the image at twice the size
const upscaler = setupVisionModel('edsr-x2.aimodel')

let loaded: CoreAILoadedModel

beforeAll(async () => {
  loaded = (await CoreAI.loadModel(
    { ...upscaler, task: 'raw' },
    {}
  )) as CoreAILoadedModel
})

afterAll(async () => {
  await CoreAI.unloadModel(loaded.modelHandle)
})

// A gray image, which upscales to the same gray
const gray = (height: number, width: number) =>
  createTensor(
    'float32',
    [1, 3, height, width],
    new Float32Array(3 * height * width).fill(0.5)
  )

const upscale = async (inputs: object, options: object = {}) =>
  (await CoreAI.runRawFunction(
    loaded.modelHandle,
    'main',
    inputs,
    options
  )) as CoreAIRawFunctionResult

describe('core-ai raw functions', () => {
  it('describes the functions of a loaded model', () => {
    expect(loaded.info.functions).toEqual([
      {
        name: 'main',
        inputs: [{ name: 'x', dataType: 'float16', shape: [-1, 3, -1, -1] }],
        outputs: [expect.objectContaining({ dataType: 'float16' })],
      },
    ])
  })

  it('describes the functions of a model on disk', async () => {
    const info = (await CoreAI.inspectModel(upscaler)) as CoreAIModelInfo

    expect(info.functions.map(({ name }) => name)).toEqual(['main'])
  })

  it('runs a function with dynamic shapes', async () => {
    const { outputs } = await upscale({ x: gray(12, 20) })
    const [output] = Object.values(outputs)

    expect(output.dataType).toBe('float32')
    expect(output.shape).toEqual([1, 3, 24, 40])
    const elements = readTensor(
      output as typeof output & { dataType: 'float32' }
    )
    expect(elements).toHaveLength(3 * 24 * 40)
    for (const value of elements) {
      expect(value).toBeCloseTo(0.5, 1)
    }
  })

  it('returns half-precision outputs as they are', async () => {
    const { outputs } = await upscale(
      { x: gray(8, 8) },
      { outputDataType: 'native' }
    )
    const [output] = Object.values(outputs)

    expect(output.dataType).toBe('float16')
    // Two bytes for each element
    expect(atob(output.data).length).toBe(2 * 3 * 16 * 16)
  })

  it('specializes the model for a compute unit', async () => {
    const gpu = (await CoreAI.loadModel(
      { ...upscaler, task: 'raw' },
      { computeUnits: 'gpu' }
    )) as CoreAILoadedModel
    const { outputs } = (await CoreAI.runRawFunction(
      gpu.modelHandle,
      'main',
      { x: gray(8, 8) },
      {}
    )) as CoreAIRawFunctionResult
    await CoreAI.unloadModel(gpu.modelHandle)

    expect(Object.values(outputs)[0].shape).toEqual([1, 3, 16, 16])
    await expect(
      CoreAI.loadModel({ ...upscaler, task: 'raw' }, { computeUnits: 'tpu' })
    ).rejects.toThrow('computeUnits must be')
  })

  it('rejects inputs that do not match the function', async () => {
    await expect(upscale({ image: gray(8, 8) })).rejects.toThrow(
      'Missing input "x"'
    )
    await expect(
      upscale({
        x: createTensor('float32', [1, 1, 8, 8], new Float32Array(64)),
      })
    ).rejects.toThrow('has shape [1, 1, 8, 8]')
    await expect(
      upscale({ x: createTensor('int32', [1, 3, 8, 8], new Int32Array(192)) })
    ).rejects.toThrow('is float16, not int32')
  })
})
