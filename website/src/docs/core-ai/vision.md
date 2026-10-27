# Vision

Vision tasks run through `CoreAI.runTask(task, config, input, options)`, since the AI SDK has no API for them. Images are file URIs, and are decoded with their EXIF orientation applied, so coordinates match the image as it is displayed. Super-resolution, classification, depth and video segmentation keep the model last used loaded, while object detection and segmentation load theirs on each call.

These calls take the flat native config, `{ id, sourceType: 'file', sourceUri }`. To reuse a provider config (`{ id, source: { type: 'file', uri } }`), convert it with `toNativeModelConfig(config)`.

```typescript
import { CoreAI } from '@react-native-ai/core-ai'

const model = { id: 'yolos-tiny', sourceType: 'file', sourceUri: yolosModel }

const { output, metadata } = await CoreAI.runTask(
  'object-detection',
  model,
  { imageUri },
  { threshold: 0.7 }
)
```

## Object Detection

Runs DETR-style detectors (the [hosted YOLOS-tiny export](./models#hosted-exports), COCO classes):

- **Output**: `output.detections`, each with `label`, `labelIndex`, `confidence` and `box` (`x`, `y`, `width`, `height` in image pixels)
- **Options**: `threshold`, `maxDetections`, `inputWidth`, `inputHeight`

## Segmentation

Runs `coreai-models` segmenters (the [hosted EfficientSAM-Ti export](./models#hosted-exports), or the [SAM 3 community export](./models#community-exports) for text prompts). Describe what to segment with a box, points or text:

```typescript
const efficientSAM = {
  id: 'efficient-sam',
  sourceType: 'file',
  sourceUri: efficientSAMModel,
}

await CoreAI.runTask('segmentation', efficientSAM, {
  imageUri,
  data: { box: { x: 5, y: 27, width: 152, height: 208 } },
})

await CoreAI.runTask('segmentation', efficientSAM, {
  imageUri,
  data: { points: [{ x: 235, y: 100, label: 1 }] },
})

const sam3 = { id: 'sam3', sourceType: 'file', sourceUri: sam3Model }

await CoreAI.runTask('segmentation', sam3, { imageUri, text: 'cat' })
```

- **Output**: `output.segments`, each with `score`, `box`, and `mask`, a base64 PNG at image resolution that is white where the object is and transparent elsewhere, to tint and draw over the image
- **Points**: `label: 1` marks the object and `label: 0` the background. `data.queries` takes several point groups at once
- **Options**: `maskThreshold`, `maxSegments`, and `tokenizerContextLength` for text prompts

## Video Segmentation

Finds the objects that text prompts describe in a video, and tracks them from frame to frame (the [hosted SAM 3 video export](./models#hosted-exports)):

```typescript
const { output } = await CoreAI.runTask(
  'video-segmentation',
  { id: 'sam3-video', sourceType: 'file', sourceUri: sam3VideoBundle },
  { videoUri, data: { prompts: ['cat', 'person'] } },
  { maxFrames: 120, outputVideo: true }
)

// output.frames[i].objects: [{ id, prompt, score, box }]
// output.video: file:// URL of a copy with the masks and boxes drawn on
```

- Object ids stay the same across frames. One prompt can also go in `input.text`
- `includeMasks: true` adds each object's mask as a base64 PNG at the video size, which adds up for long videos
- `scoreThreshold` (0.5), `newObjectThreshold` (0.7) and `maxObjects` tune tracking

## Super-resolution

Upscales an image with an EDSR-style model that takes `[batch, 3, height, width]` RGB in 0...1 (the [hosted EDSR x2 export](./models#hosted-exports)):

```typescript
const { output } = await CoreAI.runTask('super-resolution', edsr, { imageUri })
// output: { image, width, height, scale }, image is a base64 PNG
```

Images larger than `tileSize` (256 px) are upscaled in tiles that overlap by `tileOverlap` (16 px), so any image size works.

## Classification

Classifies an image with a model that takes `[1, 3, height, width]` normalized RGB and returns logits (the [hosted PVT v2 b0 export](./models#hosted-exports), ImageNet-1k):

```typescript
const { output } = await CoreAI.runTask(
  'classification',
  { id: 'pvt-v2-b0', sourceType: 'file', sourceUri: pvtFolder },
  { imageUri },
  { topK: 3 }
)
// output.classifications: [{ index: 281, label: 'tabby, tabby cat', confidence: 0.36 }, ...]
```

- Class names come from `options.labels`, or a `labels.json` array next to the model. Set `sourceUri` to the folder that contains both the model and `labels.json`
- `applySoftmax: false` keeps the scores of models that already return probabilities

## Depth Estimation

Estimates relative depth with a Depth Anything-style model (the [hosted Depth Anything 3 small export](./models#hosted-exports)):

```typescript
const { output } = await CoreAI.runTask('depth', depthAnything, { imageUri })
// output.image: a grayscale PNG at the image size, nearer is brighter
// output.depth: the float32 depth map at model resolution, smaller is nearer
```

`readTensor(output.depth)` returns the map as a `Float32Array`, with `output.min` and `output.max`. Models that take several views get the image as each view.

The task reads the model's output as depth, where smaller is nearer, like Depth Anything 3. Models that return inverse depth (disparity), such as Depth Anything V2, have larger values for nearer points, so their map comes back reversed: use `output.depth` and flip it, or run them as [raw function calls](./raw-functions).

## Common Options

- Classification and depth normalize RGB with the ImageNet mean and std, and `mean` and `std` override them
- `computeUnits` (`'default' | 'cpu' | 'gpu' | 'neural-engine'`) picks the compute unit Core AI specializes super-resolution, classification and depth models for
- `functionName` runs a function other than `main`
