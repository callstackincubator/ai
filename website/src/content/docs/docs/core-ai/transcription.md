---
title: "Transcription"
---

`coreAI.transcriptionModel(config)` runs `coreai-models` speech bundles (Parakeet TDT and Whisper) with the AI SDK. The [hosted Parakeet TDT 0.6B v3 export](/docs/core-ai/models#hosted-exports) transcribes 25 European languages.

## Files

```typescript
import { coreAI } from '@react-native-ai/core-ai'
import { transcribe } from 'ai'

const model = coreAI.transcriptionModel({
  id: 'parakeet-tdt-0.6b-v3',
  source: parakeetDirectory,
})

const { text, segments, durationInSeconds } = await transcribe({
  model,
  audio: recording, // Uint8Array, base64 or a URL
})

// segments: [{ text, startSecond, endSecond }]
```

- Audio can be any format AVFoundation decodes (WAV, MP3, M4A, FLAC, CAF, AIFF), picked by the media type, and is resampled to the model's rate.
- Parakeet bundles exported with `--streaming` (like the hosted one) transcribe audio of any length, and split the transcript into segments at pauses. Other bundles transcribe in one segment: bundles exported with `--dynamic` take the whole file, and static ones as much audio as their traced window holds (`--audio-seconds`, 5 by default).
- Parakeet does not detect the language, so `language` is not set.

## Live Audio

`experimental_streamTranscribe` takes a stream of 16-bit little-endian mono PCM at any rate, for example from a microphone, and streams the transcript as it grows:

```typescript
import { experimental_streamTranscribe as streamTranscribe } from 'ai'

const result = streamTranscribe({
  model,
  inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
  audio: microphoneChunks, // ReadableStream<Uint8Array>
})

for await (const part of result.fullStream) {
  if (part.type === 'transcript-delta') {
    process(part.delta)
  }
  if (part.type === 'transcript-final') {
    console.log(part.text, part.startSecond, part.endSecond)
  }
}

console.log(await result.text)
```

- Each segment's text only grows until the segment closes at a pause, so deltas append to what came before, and each closed segment arrives as a `transcript-final` part.
- Chunks can end in the middle of a sample. The provider reassembles samples across chunks, and resamples the audio to the model's rate on the device.
- The abort signal, or cancelling the stream, stops the session. A model runs one live session at a time.

Without the AI SDK, `CoreAI.startTranscriptionStream`, `CoreAI.appendTranscriptionAudio` and `CoreAI.finishTranscriptionStream`, with the `CoreAI.onTranscriptionUpdate` event, run the same session.

The model stays loaded after the first call, until another speech model is used.
