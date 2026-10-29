---
title: "Transcription"
---

Convert speech to text on device with ML Kit's
[speech recognition](https://developers.google.com/ml-kit/genai/speech-recognition/android).

```typescript
import { android } from '@react-native-ai/android'
import { experimental_transcribe as transcribe } from 'ai'

const model = android.transcriptionModel({ language: 'en-US' })

const { text } = await transcribe({
  model,
  audio, // Uint8Array or base64 of an MP3, WAV, FLAC, M4A or OGG file
})
```

ML Kit decodes the file on the device. It returns the text only: word timings
come with streamed audio, which this model doesn't take yet, so `segments` is
empty.

## Options

- `language`: BCP 47 locale, such as `en-US`. Defaults to the device locale.
- `mode`: `basic` uses the traditional on-device recognizer (Android 12 or
  newer, about 15 locales). `advanced` uses Gemini Nano, with more locales and
  better quality, on newer devices such as the Pixel 10. ML Kit picks one when
  you don't set it.

## Availability and Download

```typescript
const info = await model.getModelInfo()
// { availability: 'available' | 'downloadable' | 'downloading' | 'unavailable' }

await model.prepare({ onProgress: (progress) => console.log(progress) })
```

Transcribing prepares the model on its own when you don't.
