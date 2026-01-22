# Transcription

Convert speech to text using Apple's on-device `SpeechAnalyzer` and `SpeechTranscriber`.

## Overview

This provider uses Apple's [`SpeechAnalyzer`](https://developer.apple.com/documentation/speech/speechanalyzer) and [`SpeechTranscriber`](https://developer.apple.com/documentation/speech/speechtranscriber) to perform speech-to-text transcription entirely on-device. This is Apple's new advanced speech recognition model and is available in iOS 26 and onwards.

## Requirements

- **iOS 26+** - SpeechAnalyzer requires iOS 26

## Usage

### Basic Transcription

```tsx
const file = await fetch(
  'https://www.voiptroubleshooter.com/open_speech/american/OSR_us_000_0010_8k.wav'
)
const audio = await file.arrayBuffer()

const response = await experimental_transcribe({
  model: apple.transcriptionModel(),
  audio,
})

console.log(response.text)
console.log(response.segments)
console.log(response.durationInSeconds)
```

The `audio` parameter accepts either an `ArrayBuffer` or a base64-encoded string.

> [!NOTE]
> The API currently does not support streaming or live transcription. It is relatively easy to include, please let us know on Github if you need support for this.

## Language Support

The transcription model supports multiple languages with automatic language detection. You can configure a custom language when creating the model:

```tsx
const model = apple.transcriptionModel({ language: 'fr' })

await experimental_transcribe({
  model,
  audio: audioArrayBuffer,
})
```

> [!NOTE]
> By default, the transcription model will use device language.

## Preparing the Model

Apple's SpeechAnalyzer requires downloading language-specific assets to the device. While the provider automatically prepares assets when needed, you can call `prepare()` ahead of time for better performance:

```tsx
const model = apple.transcriptionModel({ language: 'en' })

// Call prepare() ahead of time to optimize first inference latency
await model.prepare()

// Now transcription will be faster on first use
const response = await experimental_transcribe({ model, audio })
```

> [!TIP]
> Calling `prepare()` ahead of time is recommended to avoid delays on first use. If not called, the model will auto-prepare when first used, but a warning will be logged.

When you call `prepare()`, the system first checks if the required assets are already present on the device. If they are, the method resolves immediately without any network activity.

> [!NOTE]
> All language models and assets are stored in Apple's system-wide assets catalog, separate from your app bundle. This means zero impact on your app's size. Assets may already be available if the user has previously used other apps, or if system features have requested them.

## Direct API Access

For advanced use cases, you can access the speech transcription API directly:

### AppleTranscription

```tsx
import { AppleTranscription } from '@react-native-ai/apple'

// Check availability for a language
const isAvailable: boolean = await AppleTranscription.isAvailable(language: string)

// Prepare language assets
await AppleTranscription.prepare(language: string)

// Transcribe audio with timing information
const { segments, duration } = await AppleTranscription.transcribe(
  arrayBuffer,
  language: string
)
```

## Benchmarks

Performance comparison showing transcription speed for a 34-minute audio file ([source](https://www.macrumors.com/2025/06/18/apple-transcription-api-faster-than-whisper/)):

| System                    | Processing Time     | Performance |
| ------------------------- | ------------------- | ----------- |
| Apple SpeechAnalyzer      | 45 seconds          | Baseline    |
| MacWhisper Large V3 Turbo | 1 minute 41 seconds | 2.2× slower |
