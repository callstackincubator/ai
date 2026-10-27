---
title: "Speech"
---

Generate speech on device with a text-to-speech GGUF model and a
[codec.cpp](https://github.com/mybigday/codec.cpp) vocoder, which turns the
model's audio tokens into sound. Download both:

```typescript
import { downloadModel, llama } from '@react-native-ai/llama'
import { generateSpeech } from 'ai'

const modelPath = await downloadModel(
  'OuteAI/OuteTTS-0.3-500M-GGUF/OuteTTS-0.3-500M-Q4_K_M.gguf'
)
const vocoderPath = await downloadModel(
  'BricksDisplay/codec.cpp-gguf/wavtokenizer-large-speech-75tokens.gguf'
)

const model = llama.speechModel(modelPath, { vocoderPath })
await model.prepare()

const { audio } = await generateSpeech({
  model,
  text: 'Hello from on-device speech!',
})

console.log(audio.uint8Array)
```

The audio is 16-bit mono WAV at the vocoder's sample rate. Only `text` is used:
`voice`, `speed`, and `language` are ignored. See the
[API reference](/docs/llama/model-management#llamaspeechmodelmodelpath-options) for the
model options.
