import {
  CoreAI,
  type CoreAIVideoSegmentationOutput,
} from '@react-native-ai/core-ai'
import { beforeAll, describe, expect, it } from 'react-native-harness'

import { setupVideoSegmentationModel, writeCatsVideo } from './helpers'

const segmenter = setupVideoSegmentationModel()

let videoUri: string

beforeAll(async () => {
  videoUri = await writeCatsVideo()
})

const segment = async (options: object = {}) =>
  (await CoreAI.runTask(
    'video-segmentation',
    segmenter,
    { videoUri, data: { prompts: ['cat'] } },
    options
  )) as {
    output: CoreAIVideoSegmentationOutput
    metadata: { frameCount: number }
  }

describe('core-ai video segmentation', () => {
  it('tracks the cats through every frame', async () => {
    const { output, metadata } = await segment()

    // 2 s at 8 fps
    expect(metadata.frameCount).toBe(16)
    expect(output.frames.map(({ frameIndex }) => frameIndex)).toEqual(
      Array.from({ length: 16 }, (_, index) => index)
    )
    const [first] = output.frames
    expect(first.objects.length).toBeGreaterThan(0)
    expect(first.objects.every(({ prompt }) => prompt === 'cat')).toBe(true)
  })

  it('keeps the ids of the objects it tracks', async () => {
    const { output } = await segment()
    const ids = (frame: number) =>
      output.frames[frame].objects.map(({ id }) => id).sort()

    expect(ids(15)).toEqual(ids(0))
  })

  it('stops after maxFrames, with masks', async () => {
    const { output } = await segment({ maxFrames: 2, includeMasks: true })

    expect(output.frames).toHaveLength(2)
    const [object] = output.frames[0].objects
    expect(object.maskWidth).toBe(240)
    // PNG signature
    expect(atob(object.mask!).slice(1, 4)).toBe('PNG')
  })

  it('writes an annotated video', async () => {
    const { output } = await segment({ maxFrames: 4, outputVideo: true })

    expect(output.video).toMatch(/^file:\/\/.*\.mp4$/)
    expect(output.frames).toHaveLength(4)
  })
})
