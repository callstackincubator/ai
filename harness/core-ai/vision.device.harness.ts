import { CoreAI } from '@react-native-ai/core-ai'
import { beforeAll, describe, expect, it } from 'react-native-harness'

import { setupVisionModel, writeCatsImage } from './helpers'

const detector = setupVisionModel('yolos-tiny.aimodel')
const segmenter = setupVisionModel('efficient-sam')

type Rect = { x: number; y: number; width: number; height: number }
type Detection = { label: string; confidence: number; box: Rect }
type Segment = {
  score: number
  maskWidth: number
  maskHeight: number
  // Base64 PNG
  mask: string
}

// The 320x240 fixture has a cat on each half and a remote next to each
const leftCat: Rect = { x: 5, y: 27, width: 152, height: 208 }

let imageUri: string

beforeAll(async () => {
  imageUri = await writeCatsImage()
})

const detect = async () =>
  (
    (await CoreAI.runTask(
      'object-detection',
      detector,
      { imageUri },
      { threshold: 0.7 }
    )) as { output: { detections: Detection[] } }
  ).output.detections

const runSegmentation = async (data: object) =>
  (await CoreAI.runTask('segmentation', segmenter, { imageUri, data }, {})) as {
    output: { segments: Segment[] }
    metadata: { imageWidth: number; imageHeight: number }
  }

describe('core-ai object detection', () => {
  it('finds both cats', async () => {
    const cats = (await detect()).filter(({ label }) => label === 'cat')

    expect(cats).toHaveLength(2)
    // One on each half of the image
    const centers = cats
      .map(({ box }) => box.x + box.width / 2)
      .sort((a, b) => a - b)
    expect(centers[0]).toBeLessThan(160)
    expect(centers[1]).toBeGreaterThan(160)
  })

  it('returns boxes in image pixels', async () => {
    for (const { box } of await detect()) {
      expect(box.x).toBeGreaterThanOrEqual(-1)
      expect(box.y).toBeGreaterThanOrEqual(-1)
      expect(box.x + box.width).toBeLessThanOrEqual(321)
      expect(box.y + box.height).toBeLessThanOrEqual(241)
    }
  })
})

describe('core-ai segmentation', () => {
  it('segments the object in a box', async () => {
    const result = await runSegmentation({ box: leftCat })
    const [segment] = result.output.segments

    expect(segment.score).toBeGreaterThan(0.7)
    expect(result.metadata).toEqual({ imageWidth: 320, imageHeight: 240 })
  })

  it('returns the mask as a png at image resolution', async () => {
    const [segment] = (await runSegmentation({ box: leftCat })).output.segments

    expect(segment.maskWidth).toBe(320)
    expect(segment.maskHeight).toBe(240)
    // PNG signature
    expect(atob(segment.mask).slice(1, 4)).toBe('PNG')
  })

  it('segments the object under a point', async () => {
    const [segment] = (
      await runSegmentation({ points: [{ x: 235, y: 100, label: 1 }] })
    ).output.segments

    expect(segment.score).toBeGreaterThan(0.5)
  })
})
