# Speech

Convert text to speech on device with Apple's
[`AVSpeechSynthesizer`](https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer).
The audio is returned as WAV. Personal Voice needs iOS 17.

## Usage

```tsx
import { apple } from '@react-native-ai/apple'
import { generateSpeech } from 'ai'

const { audio } = await generateSpeech({
  model: apple.speechModel(),
  text: 'Hello from Apple on-device speech!',
})

console.log(audio.uint8Array)
console.log(audio.base64)
```

The sample rate and bit depth depend on the voice, commonly 44.1 kHz 16-bit
PCM. Some voices return 32-bit float, which the WAV header reflects.

## Voice and Language

Pass `language` to use the system's default voice for that locale:

```tsx
await generateSpeech({
  model: apple.speechModel(),
  text: 'Bonjour tout le monde!',
  language: 'fr-FR',
})
```

Or pick a specific voice by its `identifier`, which takes priority over
`language`:

```tsx
import { AppleSpeech } from '@react-native-ai/apple'

const voices = await AppleSpeech.getVoices()

await generateSpeech({
  model: apple.speechModel(),
  text: 'Custom voice synthesis',
  voice: 'com.apple.voice.super-compact.en-US.Samantha',
})
```

Each voice has:

- `identifier` and `name`
- `language`, a BCP 47 code such as `en-US`
- `quality`: `default`, `enhanced`, or `premium`
- `isPersonalVoice` and `isNoveltyVoice` (iOS 17+)

The system manages voices. Enhanced and premium voices may need a one-time
download, which users start in Settings → Accessibility → Read & Speak →
Voices.

## Speed

`speed` multiplies the voice's default rate, so `2` speaks twice as fast and
`0.5` half as fast. Apple caps the rate, so extreme values are clamped:

```tsx
await generateSpeech({
  model: apple.speechModel(),
  text: 'Speaking a little faster.',
  speed: 1.25,
})
```

## Personal Voice

On iOS 17+, a Personal Voice the user created is only listed once they let your
app use it. Ask when your app needs it, for example when it opens a voice
picker. iOS shows the prompt once, and later calls return the saved answer:

```tsx
const status = await AppleSpeech.requestPersonalVoiceAuthorization()
// 'authorized' | 'denied' | 'notDetermined' | 'unsupported'

if (status === 'authorized') {
  const personalVoices = (await AppleSpeech.getVoices()).filter(
    (voice) => voice.isPersonalVoice
  )
}
```

Right after the user allows access, iOS can take a moment to add the Personal
Voice to the list. If it is missing, call `getVoices()` again shortly after,
for example when your voice picker next appears.

## Direct API Access

`AppleSpeech` is the native module behind the model:

```tsx
import { AppleSpeech } from '@react-native-ai/apple'

const voices = await AppleSpeech.getVoices()

// WAV bytes as an ArrayBuffer
const buffer = await AppleSpeech.generate('Hello world', {
  language: 'en-US',
})
```
