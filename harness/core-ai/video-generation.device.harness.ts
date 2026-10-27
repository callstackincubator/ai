import { experimental_generateVideo as generateVideo } from 'ai'
import { describe, expect, it } from 'react-native-harness'

import { setupVideoModel } from './helpers'

const model = setupVideoModel()

// The iOS export is traced for 832x480 and 81 frames. Two steps without the
// unconditional pass keep the test to a few minutes
const generate = (options: object = {}, abortSignal?: AbortSignal) =>
  generateVideo({
    model,
    prompt: 'a red ball rolling across a wooden table',
    seed: 1,
    providerOptions: {
      'core-ai': { stepCount: 2, cfgCutoff: 1, ...options },
    },
    abortSignal,
  })

describe('core-ai video generation', () => {
  it('generates an mp4 at the size the model was exported for', async () => {
    const { video, providerMetadata } = await generate()

    expect(video.mediaType).toBe('video/mp4')
    // MP4 files start with an ftyp box
    expect(String.fromCharCode(...video.uint8Array.slice(4, 8))).toBe('ftyp')
    expect(providerMetadata['core-ai']).toMatchObject({
      width: 832,
      height: 480,
      frameCount: 81,
      fps: 16,
      seed: 1,
    })
  })

  it('rejects a size the model was not exported for', async () => {
    await expect(generate({ width: 320, height: 192 })).rejects.toThrow(
      'exported for 832x480 only'
    )
    await expect(generate({ frameCount: 17 })).rejects.toThrow(
      'exported for 81 frames only'
    )
  })

  it('stops when aborted', async () => {
    const controller = new AbortController()
    const result = generate({}, controller.signal)
    setTimeout(() => controller.abort(), 1000)

    await expect(result).rejects.toThrow()
  })
})
