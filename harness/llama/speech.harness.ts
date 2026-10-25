import { downloadModel, llama } from '@react-native-ai/llama'
import { experimental_generateSpeech as generateSpeech } from 'ai'
import { describe, expect, it } from 'react-native-harness'

const SPEECH_MODEL_ID =
  'OuteAI/OuteTTS-0.3-500M-GGUF/OuteTTS-0.3-500M-Q4_K_M.gguf'
const VOCODER_ID =
  'BricksDisplay/codec.cpp-gguf/wavtokenizer-large-speech-75tokens.gguf'

describe('llama speech model', () => {
  it('returns speech as 16-bit mono wav', async () => {
    const [modelPath, vocoderPath] = await Promise.all([
      downloadModel(SPEECH_MODEL_ID),
      downloadModel(VOCODER_ID),
    ])
    const speechModel = llama.speechModel(modelPath, { vocoderPath })

    const { audio } = await generateSpeech({
      model: speechModel,
      text: 'Hello world.',
    })
    const wav = audio.uint8Array
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)

    expect(audio.mediaType).toBe('audio/wav')
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF')
    expect(view.getUint16(20, true)).toBe(1)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBeGreaterThan(0)

    await speechModel.unload()
  })
})
