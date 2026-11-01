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

## Image Editing

Pass an image with the prompt to edit it. FLUX.2 starts from noise and attends to the image's tokens, so the result keeps its layout and follows the prompt:

```typescript
const { image } = await generateImage({
  model,
  prompt: { images: [photo], text: 'make the apple green' },
  seed: 1,
  providerOptions: { 'core-ai': { stepCount: 4 } },
})
```

- `photo` is a `Uint8Array`, base64 string, `file://` URL or `https://` URL, which is downloaded first. Images are decoded with their EXIF orientation and resized to the model's size.
- The export needs a VAE encoder and an image-to-image transformer: `vae_encoder_half` and `transformer_512_img2img_half` in the iOS recipe. Without them the image is left out with a warning, and the result comes from the prompt alone.
- `providerOptions['core-ai'].referenceGrid` (`full`, `half` or `quarter`) sets how many of the image's tokens the model attends to: more follows the image more closely and runs slower. It defaults to the finest grid the export has. `strength` has no effect on FLUX.2.
- One image is edited per call, and there's no inpainting: extra images and a `mask` are left out with a warning.
- `coreAI.imageModel(config).generate(prompt, { imageUri })` (or `imageBase64`) edits outside the AI SDK.

## Progress

Generation takes seconds per image and minutes per video. Pass `onProgress` in `providerOptions['core-ai']` to follow it. The callback gets `{ phase, step, totalSteps }`:

```typescript
import type { CoreAIGenerationProgress } from '@react-native-ai/core-ai'

const onProgress = ({ phase, step, totalSteps }: CoreAIGenerationProgress) =>
  setStatus(`${phase} ${step}/${totalSteps}`)

const { video } = await generateVideo({
  model: coreAI.videoModel({ id: 'wan2.1-t2v-1.3b', source: wanDirectory }),
  prompt: 'a red ball rolling across a wooden table',
  providerOptions: {
    // providerOptions is typed as JSON, so a callback needs a cast
    'core-ai': { onProgress: onProgress as any },
  },
})
```

- Images report `denoising` after each step, from step 1.
- Videos report `encoding` as the prompt is encoded, `denoising` as each step starts (from step 0), then `decoding` and `assembling` the frames.
- The `generate(prompt, { onProgress })` methods of `coreAI.imageModel(...)` and `coreAI.videoModel(...)` take the callback without a cast.
- An `abortSignal` stops image and video generation after the current step.

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
