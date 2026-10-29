---
title: "Transcription"
---

Convert speech to text on the device with ML Kit's
[GenAI Speech Recognition API](https://developers.google.com/ml-kit/genai/speech-recognition/android).
`adk.transcriptionModel()` returns an AI SDK transcription model, and the audio
never leaves the device.

:::caution
ML Kit GenAI speech recognition is in alpha, and Google may change it in ways
that break this provider.
:::

## Requirements

- A physical Android device with a locked bootloader. Emulators aren't supported.
- Android 12 (API 31) or newer for `basic` mode, and a device with Gemini Nano,
  such as a Pixel 10, for `advanced` mode.
- Kotlin 2.4 in your app, which ML Kit's speech recognition is built with. With
  Expo, set it with `expo-build-properties`:

```json
{
  "expo": {
    "plugins": [
      ["expo-build-properties", { "android": { "kotlinVersion": "2.4.0" } }]
    ]
  }
}
```

In a bare React Native app, set `android.kotlinVersion=2.4.0` in
`android/gradle.properties`.

## Usage

```typescript
import { adk } from '@react-native-ai/adk'
import { experimental_transcribe as transcribe } from 'ai'

const { text } = await transcribe({
  model: adk.transcriptionModel({ language: 'en-US' }),
  audio,
})
```

`audio` can be an `ArrayBuffer`, a `Uint8Array` or a base64 string, in a format
ML Kit decodes: WAV, MP3, FLAC, M4A or Ogg.

## Options

```typescript
const model = adk.transcriptionModel({
  language: 'fr-FR',
  mode: 'advanced',
})
```

| Option     | Type                    | Description                                                                              |
| ---------- | ----------------------- | ---------------------------------------------------------------------------------------- |
| `language` | `string`                | BCP 47 locale, such as `en-US` (default: the device locale)                              |
| `mode`     | `'basic' \| 'advanced'` | `basic` (default) uses the traditional on-device model, `advanced` the Gemini Nano model |

See the
[ML Kit documentation](https://developers.google.com/ml-kit/genai/speech-recognition/android#supported-languages)
for the locales each mode supports.

## Availability

Check whether the locale and mode can be used on the device:

```typescript
const model = adk.transcriptionModel({ language: 'en-US' })

const availability = await model.getAvailability()
// 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unknown'

const canTranscribe = await model.isAvailable() // available or downloadable
```

## Preparing

ML Kit may need to download the speech recognition model first. The first
transcription downloads it, or call `prepare()` ahead of time to show progress:

```typescript
await model.prepare({
  onProgress: ({ phase, bytesDownloaded, bytesToDownload }) => {
    // phase is 'started', 'progress' or 'completed'
  },
})
```

## Errors

| `code`              | Meaning                                                   |
| ------------------- | --------------------------------------------------------- |
| `MODEL_UNAVAILABLE` | The locale or mode is not supported on this device        |
| `MODEL_DOWNLOADING` | Android is still downloading the speech recognition model |
| `DOWNLOAD_FAILED`   | Downloading the speech recognition model failed           |
| `RATE_LIMITED`      | AICore is busy, or the app's quota ran out                |

## Limitations

- ML Kit reports no timestamps for whole files, so `segments` is empty and
  `durationInSeconds` is undefined.
- Only whole files are transcribed. Live microphone transcription isn't exposed
  yet.
