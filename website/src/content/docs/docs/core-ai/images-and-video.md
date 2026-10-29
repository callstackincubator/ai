---
title: "Images and Video"
---

Generate images and short videos from a text prompt, on the device, with the same AI SDK calls you'd use for a cloud model.

## Image Generation

Pass `coreAI.imageModel(config)` to `generateImage`. With the [hosted FLUX.2 klein 4B](/docs/core-ai/models#hosted-exports), a 512x512 image takes about 13 seconds on an iPhone 17 Pro:

```typescript
import { coreAI } from '@react-native-ai/core-ai'
import { generateImage } from 'ai'

const model = coreAI.imageModel({
  id: 'flux2-klein-4b',
  source: fluxDirectory,
})

const { image } = await generateImage({
  model,
  prompt: 'a red apple on a wooden table',
  size: '512x512',
  seed: 1,
  providerOptions: { 'core-ai': { stepCount: 2 } },
})

// image.base64, image.uint8Array: a PNG
```

- A model generates one size, the one it was exported for. Another `size` returns a warning, and `providerMetadata['core-ai']` reports the size generated.
- The same `seed` generates the same image.
- `providerOptions['core-ai']` tunes the pipeline: `stepCount`, `guidanceScale`, `negativePrompt`, `schedulerType`, `decodeResolution` (`auto`, `full`, `half` or `tiled`) and `strength`.
- The pipeline loads one part at a time, so a 4 GB model fits in an iPhone app's memory. `lazyModelLoading: false` loads it all at once.

## Video Generation

Pass `coreAI.videoModel(config)` to `experimental_generateVideo` to get a short MP4 clip.

:::caution[macOS only for now]
The [hosted Wan 2.1](/docs/core-ai/models#hosted-exports) doesn't fit in iPhone memory yet: iOS stops the app while it decodes the video ([#306](https://github.com/callstackincubator/ai/issues/306)).
:::

```typescript
import { experimental_generateVideo as generateVideo } from 'ai'

const { video, providerMetadata } = await generateVideo({
  model: coreAI.videoModel({
    id: 'wan2.1-t2v-1.3b',
    source: wanDirectory,
  }),
  prompt: 'a red ball rolling across a wooden table',
  seed: 1,
  providerOptions: { 'core-ai': { stepCount: 12 } },
})

// video.uint8Array: the MP4. providerMetadata['core-ai'].uri: the same file in the temporary directory
```

- The hosted model makes 832x480 clips of 5 seconds (81 frames at 16 fps), and rejects other sizes and lengths.
- Models you export with dynamic shapes take other sizes and lengths: `resolution` (multiples of 16) or `aspectRatio` (`16:9`, `9:16` or `1:1`), and `duration` in seconds, up to about 5 (81 frames at 16 fps). `providerOptions['core-ai'].frameCount` sets the number of frames directly.
- `providerOptions['core-ai']` tunes the pipeline: `stepCount` (50 by default), `guidanceScale`, `negativePrompt`, `cfgCutoff` and `vaeTileSize`.
- Generation takes minutes. Aborting stops it after the current step.
- Wan generates from text only: image, frame and audio inputs are ignored with a warning.
