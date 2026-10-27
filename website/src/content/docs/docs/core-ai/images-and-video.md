---
title: "Images and Video"
---

Generate images and short videos from a text prompt, entirely on the device. Both use the AI SDK's own calls, so the code reads the same as it would with a cloud model.

## Image Generation

Turn a prompt into an image with the AI SDK's `generateImage`. Create the model with `coreAI.imageModel(config)`, pointing at a FLUX.2 or Sana Sprint diffusion bundle exported with `coreai-models`. The [hosted FLUX.2 klein 4B export](/docs/core-ai/models#hosted-exports) makes a 512x512 image in about 13 seconds on an iPhone 17 Pro, with 2 steps:

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

- Exports generate the size they were traced for. A `size` or `aspectRatio` that doesn't match returns a warning, and `providerMetadata['core-ai']` reports the size generated.
- The same `seed` generates the same image.
- `providerOptions['core-ai']` takes `stepCount`, `guidanceScale`, `negativePrompt`, `schedulerType`, `decodeResolution` (`auto`, `full`, `half` or `tiled`), `strength` and `lazyModelLoading`.
- With `lazyModelLoading` (the default), the pipeline loads one component at a time, which keeps a 4 GB pipeline within the memory an iPhone app gets.

## Video Generation

Turn a prompt into a short MP4 clip with the AI SDK's `experimental_generateVideo`. Create the model with `coreAI.videoModel(config)`, pointing at a Wan 2.1 video diffusion bundle. Video is much heavier than images: the hosted export runs on macOS for now, not on iPhone (see below).

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

- Exports with fixed shapes generate one size and length. The [hosted Wan 2.1 export](/docs/core-ai/models#hosted-exports) makes 832x480 videos of 81 frames (5 seconds at 16 fps), and rejects any other size or length with an error. It runs on macOS. On an iPhone 17 Pro the text encoder and denoising fit within the 6 GB an app gets with the increased memory limit entitlement (3.4 GB without it), but the pipeline loads the VAE decoder on the GPU, which reserves about 9 GB, so the app is killed while decoding ([#306](https://github.com/callstackincubator/ai/issues/306)).
- Exports with dynamic shapes take other sizes: `resolution` sets the size (multiples of 16), or `aspectRatio` picks one of Wan's (`16:9` is 832x480, `9:16` 480x832, `1:1` 480x480). `duration` is rounded to 4n + 1 frames at `fps` (16), up to 81 frames, and `providerOptions['core-ai'].frameCount` sets the frames directly.
- `providerOptions['core-ai']` also takes `stepCount` and `guidanceScale` (the bundle's defaults otherwise, 50 and 5 unless its config sets others), `negativePrompt`, `cfgCutoff` (the fraction of final steps that skip the unconditional pass), `vaeTileSize` and `lazyModelLoading`. Decoders exported for tiles decode in tiles on their own.
- Generation takes minutes. The abort signal stops it after the current denoising step.
- Wan generates from text: image, frame and reference inputs and audio return a warning.
