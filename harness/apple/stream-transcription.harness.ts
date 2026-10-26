import { apple } from '@react-native-ai/apple'
import { describe, expect, it } from 'react-native-harness'

// The audio format is checked before the transcriber runs, so these also run
// on simulators

const silence = () => new ReadableStream<Uint8Array>()

describe('apple stream transcription format', () => {
  it('rejects audio that is not raw pcm', async () => {
    await expect(
      apple.transcriptionModel().doStream({
        audio: silence(),
        inputAudioFormat: { type: 'audio/wav', rate: 16000 },
      })
    ).rejects.toThrow(/audio\/pcm with a rate/)
  })

  it('rejects pcm without a sample rate', async () => {
    await expect(
      apple.transcriptionModel().doStream({
        audio: silence(),
        inputAudioFormat: { type: 'audio/pcm' },
      })
    ).rejects.toThrow(/audio\/pcm with a rate/)
  })

  it('rejects an encoding it does not read', async () => {
    await expect(
      apple.transcriptionModel().doStream({
        audio: silence(),
        inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
        providerOptions: { apple: { encoding: 'int24' } },
      })
    ).rejects.toThrow(/int16 or float32/)
  })
})
