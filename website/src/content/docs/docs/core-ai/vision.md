---
title: "Vision"
---

Find objects in photos, cut them out, track them through a video, upscale, label, or estimate depth, all on the device. The AI SDK has no API for these tasks, so each one runs through `CoreAI.runTask`, with the same model config as the providers:

```typescript
import { CoreAI } from '@react-native-ai/core-ai'

const model = { id: 'yolos-tiny', source: yolosModel }

const { output, metadata } = await CoreAI.runTask(
  'object-detection',
  model,
  { imageUri },
  { threshold: 0.7 }
)
```

## Object Detection

Find the objects in a photo, each with a label and a box, as in the example above. The [hosted YOLOS-tiny](/docs/core-ai/models#hosted-exports) knows the 80 COCO classes, such as person, car and dog.

- **Output**: `output.detections`, each with `label`, `labelIndex`, `confidence` and `box` (`x`, `y`, `width`, `height` in image pixels)
- **Options**: `threshold`, `maxDetections`, `inputWidth`, `inputHeight`

## Segmentation

Cut an object out of a photo as a mask. Point at it with a box or points using the [hosted EfficientSAM-Ti](/docs/core-ai/models#hosted-exports), or describe it in words with [SAM 3](/docs/core-ai/models#community-exports):

```typescript
const efficientSAM = {
  id: 'efficient-sam',
  source: efficientSAMModel,
}

await CoreAI.runTask('segmentation', efficientSAM, {
  imageUri,
  data: { box: { x: 5, y: 27, width: 152, height: 208 } },
})

await CoreAI.runTask('segmentation', efficientSAM, {
  imageUri,
  data: { points: [{ x: 235, y: 100, label: 1 }] },
})

const sam3 = { id: 'sam3', source: sam3Model }

await CoreAI.runTask('segmentation', sam3, { imageUri, text: 'cat' })
```

- **Output**: `output.segments`, each with `score`, `box` and `mask`: a PNG the size of the image, white where the object is and transparent elsewhere, ready to tint and draw over it
- **Points**: `label: 1` marks the object and `label: 0` the background. `data.queries` takes several point groups at once
- **Options**: `maskThreshold`, `maxSegments`, and `tokenizerContextLength` for text prompts

## Video Segmentation

Find the objects you describe in a video and follow them from frame to frame, with the [hosted SAM 3 video](/docs/core-ai/models#hosted-exports):

```typescript
const { output } = await CoreAI.runTask(
  'video-segmentation',
  { id: 'sam3-video', source: sam3VideoBundle },
  { videoUri, data: { prompts: ['cat', 'person'] } },
  { maxFrames: 120, outputVideo: true }
)

// output.frames[i].objects: [{ id, prompt, score, box }]
// output.video: file:// URL of a copy with the masks and boxes drawn on
```

- Object ids stay the same across frames. One prompt can also go in `input.text`
- `includeMasks: true` adds each object's mask as a PNG, which adds up for long videos
- `scoreThreshold` (0.5), `newObjectThreshold` (0.7) and `maxObjects` tune tracking

## Super-resolution

Make a photo larger and sharper. The [hosted EDSR x2](/docs/core-ai/models#hosted-exports) doubles its size:

```typescript
const { output } = await CoreAI.runTask('super-resolution', edsr, { imageUri })
// output: { image, width, height, scale }, image is a base64 PNG
```

Large images are upscaled in overlapping tiles, so any size works. `tileSize` (256 px) and `tileOverlap` (16 px) set them.

## Classification

Say what a photo shows. The [hosted PVT v2 b0](/docs/core-ai/models#hosted-exports) picks from the 1,000 ImageNet classes:

```typescript
const { output } = await CoreAI.runTask(
  'classification',
  { id: 'pvt-v2-b0', source: pvtFolder },
  { imageUri },
  { topK: 3 }
)
// output.classifications: [{ index: 281, label: 'tabby, tabby cat', confidence: 0.36 }, ...]
```

- Class names come from the `labels.json` next to the model, so point `source` at the folder. `options.labels` overrides them
- `applySoftmax: false` keeps the scores of models that already return probabilities

## Depth Estimation

Tell which parts of a photo are near and which are far, with the [hosted Depth Anything 3 small](/docs/core-ai/models#hosted-exports):

```typescript
const { output } = await CoreAI.runTask('depth', depthAnything, { imageUri })
// output.image: a grayscale PNG at the image size, nearer is brighter
// output.depth: the float32 depth map at model resolution, smaller is nearer
```

`readTensor(output.depth)` returns the map as a `Float32Array`, with `output.min` and `output.max`.

Models that return inverse depth instead, such as Depth Anything V2, come back reversed: flip `output.depth`, or run them as [raw function calls](/docs/core-ai/raw-functions).

## Common Options

- Images are file URIs. Their EXIF orientation is applied, so coordinates match the image as displayed.
- `computeUnits` (`'default' | 'cpu' | 'gpu' | 'neural-engine'`) picks where super-resolution, classification and depth run.
- `mean` and `std` override the ImageNet normalization of classification and depth.
- `functionName` runs a function other than `main`, for your own exports.
