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
come with streamed audio, so `segments` is empty.

## Streaming

Stream live audio, such as microphone chunks, to
`experimental_streamTranscribe` as 16 kHz mono 16-bit PCM:

```typescript
import { experimental_streamTranscribe as streamTranscribe } from 'ai'

const result = streamTranscribe({
  model,
  inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
  audio: microphoneChunks, // ReadableStream<Uint8Array>
})

for await (const part of result.fullStream) {
  if (part.type === 'transcript-delta') {
    setTranscript((transcript) => transcript + part.delta)
  }
  if (part.type === 'transcript-final') {
    console.log(part.text, part.startSecond, part.endSecond)
  }
}
```

- Deltas append to the current segment. When the speaker pauses, the segment
  closes and arrives as a `transcript-final` part.
- ML Kit times when each word starts, so a segment's `endSecond` is when its
  last word starts.
- Other sample rates are rejected: resample to 16 kHz first.
- Abort the call, or cancel the stream, to stop.

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

Transcribing prepares the model on its own when you don't, and logs a warning.
