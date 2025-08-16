# Speech

Convert text to speech using Apple's on-device speech synthesis capabilities.

## Overview

This provider uses Apple's [`AVSpeechSynthesizer`](https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer) to perform text-to-speech entirely on-device. Audio is synthesized locally and returned to your app as a WAV byte stream.

## Requirements

- **iOS 13+** – Required for programmatic audio rendering with `AVSpeechSynthesizer.write(...)`.
- **iOS 17+** – Required to use Personal Voice if available on device.

## Usage

### Basic Speech

```tsx
import { apple } from '@react-native-ai/apple'
import { experimental_generateSpeech as speech } from 'ai'

const response = await speech({
  model: apple.speechModel(),
  text: 'Hello from Apple on-device speech!',
})

// Access the buffer in a preferred way
console.log(response.audio.uint8Array)
console.log(response.audio.base64)
```

> [!NOTE]
> Sample rate and bit depth are determined by the system voice (commonly 44.1 kHz, 16‑bit PCM; some devices may return 32‑bit float which is encoded accordingly in the WAV header).

### Language and Voice Selection

You can control the output language or select a specific voice by identifier. To see what voices are available on the device:

```tsx
import { AppleSpeech } from '@react-native-ai/apple'

const voices = await AppleSpeech.getVoices()
```

Use a specific voice by passing its `identifier`:

```tsx
await speech({
  model: apple.speechModel(),
  text: 'Custom voice synthesis',
  voice: 'com.apple.voice.super-compact.en-US.Samantha',
})
```

Or specify only `language` to use the system’s default voice for that locale:

```tsx
await speech({
  model: apple.speechModel(),
  text: 'Bonjour tout le monde!',
  language: 'en-US',
})
```

> [!NOTE]
> If both `voice` and `language` are provided, `voice` takes priority.

> [!NOTE]
> If only `language` is provided, the default system voice for that locale is used.

## Voices and Asset Management

The system provides a catalog of built‑in voices, including enhanced and premium variants, which may require a one‑time system download. If you have created a Personal Voice on device (iOS 17+), it appears in the list and is flagged accordingly.

> [!NOTE]
> Voice assets are managed by the operating system. To add or manage voices, use iOS Settings → Accessibility → Read & Speak → Voices. This provider does not bundle or manage voice downloads.

## Direct API Access

For advanced use cases, you can access the speech API directly:

### AppleSpeech

```tsx
import { AppleSpeech } from '@react-native-ai/apple'

// List available voices (identifier, name, language, quality, traits)
const voices = await AppleSpeech.getVoices()

// Generate audio as an ArrayBuffer-like WAV payload
const buffer = await AppleSpeech.generate('Hello world', {
  language: 'en-US',
})

// Convert to Uint8Array if needed
```

Returned voice objects include:

- `identifier`: string
- `name`: string
- `language`: BCP‑47 code, e.g. `en-US`
- `quality`: `default` | `enhanced` | `premium`
- `isPersonalVoice`: boolean (iOS 17+)
- `isNoveltyVoice`: boolean (iOS 17+)

> [!NOTE]
> On iOS 17+, the provider requests Personal Voice authorization before listing voices so your Personal Voice can be surfaced if available.
