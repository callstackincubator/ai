import { apple } from '@react-native-ai/apple'
import { generateImage } from 'ai'
import { Platform } from 'react-native'
import { describe, expect, it } from 'react-native-harness'

import { warnedFeatures } from './helpers'

const pngSignature = [0x89, 0x50, 0x4e, 0x47]

// Apple discontinued ImageCreator in iOS 27
const hasImageCreator = parseInt(String(Platform.Version), 10) < 27

describe('apple image generation on iOS 27', () => {
  if (hasImageCreator) {
    return
  }

  it('rejects as unsupported', async () => {
    await expect(
      apple.imageModel().doGenerate({
        prompt: 'A friendly robot watering balcony herbs',
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        files: undefined,
        mask: undefined,
        providerOptions: {},
      })
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_OS' })
  })
})

// Image Playground does not run on simulators, which only run iOS 27 here
describe('apple image generation', () => {
  if (!hasImageCreator) {
    return
  }

  it('generates a png', async () => {
    const { images } = await generateImage({
      model: apple.imageModel({ style: 'illustration' }),
      prompt: 'A friendly robot watering balcony herbs',
      n: 1,
    })

    expect(images).toHaveLength(1)
    expect([...images[0].uint8Array.subarray(0, 4)]).toEqual(pngSignature)
  })

  it('applies a style from provider options', async () => {
    const { images } = await generateImage({
      model: apple.imageModel(),
      prompt: 'A hand-drawn icon for a notes app',
      n: 1,
      providerOptions: { apple: { style: 'sketch' } },
    })

    expect(images).toHaveLength(1)
  })

  it('warns about settings Image Playground has no equivalent for', async () => {
    const { warnings } = await generateImage({
      model: apple.imageModel(),
      prompt: 'A friendly robot watering balcony herbs',
      n: 1,
      size: '512x512',
      seed: 42,
    })

    expect(warnedFeatures(warnings)).toEqual(['size', 'seed'])
  })
})
