---
title: "Transcription"
---

Transcribe recordings, or speech as it happens, with a model you ship. The
[hosted Parakeet TDT 0.6B v3 model](/docs/core-ai/models#hosted-exports) covers
25 European languages, and Whisper exports work too. To use the transcriber
built into iOS instead, see [Apple transcription](/docs/apple/transcription).

## Recordings

Pass the audio to `transcribe`:

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

- Any format AVFoundation decodes works: WAV, MP3, M4A, FLAC, CAF or AIFF.
- The hosted model takes audio of any length and splits the transcript into
  segments at pauses. Bundles you export yourself without `--streaming` take
  one fixed window of audio.
- Parakeet doesn't detect the language, so the result has no `language`.

## Live Audio

To show text while the user speaks, stream microphone audio to
`experimental_streamTranscribe` as 16-bit mono PCM, at any sample rate:

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

- Deltas append to the current segment. When the speaker pauses, the segment
  closes and arrives as a `transcript-final` part.
- Abort the call, or cancel the stream, to stop. A model runs one live session
  at a time.
- Without the AI SDK, `CoreAI.startTranscriptionStream`,
  `appendTranscriptionAudio`, `finishTranscriptionStream` and the
  `onTranscriptionUpdate` event run the same session.

The model stays loaded after the first call, until you use another speech
model.
