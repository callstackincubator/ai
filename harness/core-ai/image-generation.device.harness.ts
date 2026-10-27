import { generateImage } from 'ai'
import { describe, expect, it } from 'react-native-harness'

import { setupImageModel } from './helpers'

const model = setupImageModel()

const prompt = 'a red apple on a wooden table'

const generate = (seed: number, stepCount = 2) =>
  generateImage({
    model,
    prompt,
    size: '512x512',
    seed,
    providerOptions: { 'core-ai': { stepCount } },
  })

// Width and height from the IHDR chunk, which follows the 8-byte signature
function pngSize(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

describe('core-ai image generation', () => {
  it('generates a png of the requested size', async () => {
    const { image, warnings } = await generate(1)

    expect(image.mediaType).toBe('image/png')
    expect(String.fromCharCode(...image.uint8Array.slice(1, 4))).toBe('PNG')
    expect(pngSize(image.uint8Array)).toEqual({ width: 512, height: 512 })
    expect(warnings).toEqual([])
  })

  it('generates the same image for the same seed', async () => {
    const first = await generate(7)
    const second = await generate(7)
    const other = await generate(8)

    expect(second.image.base64).toBe(first.image.base64)
    expect(other.image.base64).not.toBe(first.image.base64)
  })

  it('takes seeds past 32 bits and picks a random one without a seed', async () => {
    // 2^40 wraps to seed 0
    const large = await generate(2 ** 40, 1)
    const zero = await generate(0, 1)
    // One at a time, since each call loads the 4 GB pipeline
    const unseeded = () =>
      generateImage({
        model,
        prompt,
        providerOptions: { 'core-ai': { stepCount: 1 } },
      })
    const first = await unseeded()
    const second = await unseeded()

    expect(pngSize(large.image.uint8Array)).toEqual({ width: 512, height: 512 })
    expect(large.image.base64).toBe(zero.image.base64)
    expect(second.image.base64).not.toBe(first.image.base64)
  })

  it('runs the requested number of steps', async () => {
    const twoSteps = await generate(7)
    const oneStep = await generate(7, 1)

    expect(oneStep.image.base64).not.toBe(twoSteps.image.base64)
  })

  it('warns about a size the model does not generate', async () => {
    const { image, warnings } = await generateImage({
      model,
      prompt,
      size: '256x256',
      providerOptions: { 'core-ai': { stepCount: 1 } },
    })

    expect(pngSize(image.uint8Array)).toEqual({ width: 512, height: 512 })
    expect(warnings).toEqual([
      expect.objectContaining({ type: 'unsupported', feature: 'size' }),
    ])
  })
})
