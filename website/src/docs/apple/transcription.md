# Transcription

Convert speech to text on device with Apple's
[`SpeechAnalyzer`](https://developer.apple.com/documentation/speech/speechanalyzer)
and [`SpeechTranscriber`](https://developer.apple.com/documentation/speech/speechtranscriber),
available from iOS 26.

There are three ways to transcribe, depending on where the audio comes from:

| Audio                            | API                                                         | iOS |
| -------------------------------- | ----------------------------------------------------------- | --- |
| A complete recording             | [`transcribe`](#transcribing-a-recording)                   | 26  |
| Chunks from your own recorder    | [`experimental_streamTranscribe`](#streaming-transcription) | 26  |
| The microphone, recorded for you | [`AppleTranscription.transcribeLive`](#live-transcription)  | 27  |

## Transcribing a Recording

```tsx
import { apple } from '@react-native-ai/apple'
import { transcribe } from 'ai'

const response = await transcribe({
  model: apple.transcriptionModel(),
  audio, // ArrayBuffer or base64 string
})

console.log(response.text)
console.log(response.segments)
console.log(response.durationInSeconds)
```

Each word also comes with its own timing:

```tsx
const words = response.providerMetadata.apple.words
// [{ text: 'The', startSecond: 0.12, endSecond: 0.24 }, ...]
```

## Streaming Transcription

`experimental_streamTranscribe` transcribes audio as it arrives, for example
from a recorder, and reports text while the speech goes on. Pass raw mono PCM
chunks in a `ReadableStream`:

```tsx
import { apple } from '@react-native-ai/apple'
import { experimental_streamTranscribe as streamTranscribe } from 'ai'

const result = streamTranscribe({
  model: apple.transcriptionModel({ language: 'en-US' }),
  // ReadableStream<Uint8Array> of 16-bit samples, e.g. from your recorder
  audio,
  inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
})

for await (const part of result.fullStream) {
  if (part.type === 'transcript-partial') {
    // A quick guess that the next result for the same audio replaces
    console.log('partial', part.text)
  } else if (part.type === 'transcript-final') {
    console.log('final', part.text, part.startSecond, part.endSecond)
  }
}

console.log(await result.text)
```

Samples are 16-bit integers by default. Recorders built on the Web Audio API,
such as `react-native-audio-api`, deliver 32-bit floats. Enqueue their bytes,
`new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength)`, and
set `providerOptions: { apple: { encoding: 'float32' } }`.

Chunks can be any size and any sample rate, and are converted to the format the
transcriber takes. Closing the audio stream finalizes the transcript, and
`abortSignal` stops it early.

:::note
Streaming transcription is experimental in the AI SDK, so its API may change in
a patch release.
:::

## Live Transcription

On iOS 27, `AppleTranscription.transcribeLive` records the microphone itself,
for apps without a recorder of their own:

```tsx
import { AppleTranscription } from '@react-native-ai/apple'

const live = await AppleTranscription.transcribeLive({
  language: 'en-US',
  onResult: ({ text, isFinal }) => {
    // Volatile results (isFinal: false) are quick guesses that the next
    // result for the same audio replaces
    console.log(isFinal ? 'final' : 'volatile', text)
  },
  onError: (error) => console.error(error),
})

// Stops recording and waits for the last results
await live.stop()
```

Add `NSMicrophoneUsageDescription` to your app's Info.plist, since it asks for
microphone access. It does not run in the iOS Simulator, and throws
`UNSUPPORTED_OS` before iOS 27.

### Echo Cancellation

When the app speaks while it listens, for example a voice assistant that lets
the user interrupt it, the microphone also hears the speaker. Set
`echoCancellation` to keep what the device plays out of the transcript:

```tsx
const live = await AppleTranscription.transcribeLive({
  language: 'en-US',
  echoCancellation: true,
  onResult: ({ text }) => console.log(text),
})
```

It records with iOS voice processing, the echo cancellation that calls use,
which removes any audio the device plays from what the microphone hears. That
includes speech played by another library, such as `expo-audio` or
`react-native-audio-api`. Without it, use headphones, or stop listening while
the app speaks.

It changes the app's audio session while recording:

- The category is `playAndRecord` with the `voiceChat` mode, and playback goes
  to the speaker. Recording stops other apps' audio, as with any recording.
- Playback is quieter than usual, since the voice chat mode leaves out some
  output processing.
- On stop, the session gets back its earlier category, mode and options. It
  stays active, so the app's own playback keeps going.

A player that manages the audio session itself has to keep these settings.
`react-native-audio-api` switches it to `playback` by default, which stops the
recording:

```tsx
import { AudioManager } from 'react-native-audio-api'

AudioManager.setAudioSessionOptions({
  iosCategory: 'playAndRecord',
  iosMode: 'voiceChat',
  iosOptions: ['defaultToSpeaker'],
})
```

It is off by default, because of these side effects. Streaming transcription
does not take it, since there the app owns the recorder and its audio session.

## Languages

The model does not detect the language of the audio. It uses the device
language by default, so set it when the audio is in another language. Codes
such as `fr` resolve to a supported locale:

```tsx
const model = apple.transcriptionModel({ language: 'fr' })
```

`isAvailable()` is a quick synchronous check that the device can transcribe at
all. `getModelInfo()` reports whether it supports the language, which locale it
resolves to, and whether its assets are on the device:

```tsx
if (model.isAvailable()) {
  const info = await model.getModelInfo()
  // { isAvailable: true, supportsLocale: true, locale: 'fr-FR',
  //   assets: 'installed' | 'downloading' | 'supported' | 'unsupported',
  //   supportedLocales: [...] }
}
```

`assets` is `supported` when the locale can be used once `prepare()` downloads
it.

## Preparing the Model

Each language's assets are downloaded once by the system, into a catalog shared
by all apps, so they add nothing to your app's size and may already be on the
device. Call `prepare()` ahead of time so the first transcription does not wait
for the download:

```tsx
const model = apple.transcriptionModel({ language: 'en' })
await model.prepare()
```

`prepare()` resolves right away when the assets are already there. Without it,
the first request prepares the model itself and logs a warning.

## Direct API Access

`AppleTranscription` is the native module behind the model:

```tsx
import { AppleTranscription } from '@react-native-ai/apple'

const language = 'fr'

const isAvailable = AppleTranscription.isAvailable(language)
const info = await AppleTranscription.getModelInfo(language)
await AppleTranscription.prepare(language)

// A complete recording, with timing information
const { segments, duration } = await AppleTranscription.transcribe(
  arrayBuffer,
  language
)

// Audio you append as it arrives
const stream = await AppleTranscription.transcribeStream({
  language,
  sampleRate: 16000,
  encoding: 'int16', // or 'float32'
  onResult: ({ text, isFinal }) => console.log(isFinal, text),
})
stream.append(chunk) // ArrayBuffer or typed array
await stream.stop() // waits for the last results
```
