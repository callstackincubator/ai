---
title: "Summarize, Proofread, Rewrite and Describe"
---

ML Kit's [task APIs](https://developers.google.com/ml-kit/genai) run Gemini
Nano with an adapter trained for one job. They're beta APIs with no AI SDK
model type, so each is a model of its own on the provider:

```typescript
import { android } from '@react-native-ai/android'

const summarizer = android.summarizer({ outputType: 'threeBullets' })
await summarizer.prepare()

const summary = await summarizer.summarize(article)
```

- `android.summarizer(options)` summarizes an article, or a conversation of `<name>: <message>` lines, into one to three bullets. Options: `inputType` (`article` or `conversation`), `outputType` (`oneBullet`, `twoBullets` or `threeBullets`), `language` (`en`, `ja` or `ko`) and `autoTruncate`, which cuts input past about 4000 tokens instead of failing.
- `android.proofreader(options).proofread(text)` fixes grammar and spelling. `inputType: 'voice'` is for text transcribed from speech.
- `android.rewriter({ style }).rewrite(text)` rewrites in a `style`: `elaborate`, `emojify`, `shorten`, `friendly`, `professional` or `rephrase` (the default).
- `proofread` and `rewrite` take up to about 256 tokens, and return an array of suggestions, best first. Both take `language`: `en`, `ja`, `de`, `fr`, `it`, `es` or `ko`.
- `android.imageDescriber().describe(image)` describes an image in a short English sentence. The image is a `Uint8Array`, base64, or a `file://` or `content://` URI.

## Streaming and Aborting

Every call takes `onText`, called with the text as it is generated, and an
`abortSignal`:

```typescript
await summarizer.summarize(article, {
  onText: (text) => setSummary((summary) => summary + text),
  abortSignal: controller.signal,
})
```

## Availability and Download

```typescript
const { availability } = await summarizer.getModelInfo()

await summarizer.prepare({ onProgress: (progress) => console.log(progress) })
```

Each task downloads its adapter on first use, which is quick once Gemini Nano
is on the device. A call prepares the task on its own when you don't, and logs
a warning.
