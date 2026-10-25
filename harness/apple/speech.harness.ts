import { apple, AppleSpeech } from '@react-native-ai/apple'
import { experimental_generateSpeech as generateSpeech } from 'ai'
import { describe, expect, it } from 'react-native-harness'

function readWav(wav: Uint8Array) {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  return {
    riff: String.fromCharCode(...wav.subarray(0, 4)),
    wave: String.fromCharCode(...wav.subarray(8, 12)),
    channels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    dataSize: view.getUint32(40, true),
  }
}

describe('apple speech', () => {
  it('lists voices with their quality', async () => {
    const voices = await AppleSpeech.getVoices()

    expect(voices.length).toBeGreaterThan(0)
    for (const voice of voices) {
      expect(['default', 'enhanced', 'premium']).toContain(voice.quality)
      expect(voice.language).toMatch(/^[a-z]{2,3}-/)
    }
  })

  it('synthesizes speech as wav', async () => {
    const { audio } = await generateSpeech({
      model: apple.speechModel({ language: 'en-US' }),
      text: 'Hello world.',
    })
    const wav = readWav(audio.uint8Array)

    expect(wav).toMatchObject({ riff: 'RIFF', wave: 'WAVE', channels: 1 })
    expect(wav.sampleRate).toBeGreaterThan(0)
    expect(wav.dataSize).toBeGreaterThan(0)
  })

  it('speaks with a chosen voice', async () => {
    const voices = await AppleSpeech.getVoices()
    const voice = voices.find((v) => v.language === 'en-US') ?? voices[0]

    const { audio } = await generateSpeech({
      model: apple.speechModel({ language: voice.language }),
      text: 'Hello world.',
      voice: voice.identifier,
    })

    expect(readWav(audio.uint8Array).dataSize).toBeGreaterThan(0)
  })

  it('settles for whitespace-only text', async () => {
    const audio = await AppleSpeech.generate('   ', { language: 'en-US' })

    expect(readWav(new Uint8Array(audio)).riff).toBe('RIFF')
  })
})
