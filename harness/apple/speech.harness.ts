import { apple, AppleSpeech } from '@react-native-ai/apple'
import { experimental_generateSpeech as generateSpeech } from 'ai'
import { describe, expect, it } from 'react-native-harness'

import { warnedFeatures } from './helpers'

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

  it('speaks in the language of the call', async () => {
    const speak = async (modelLanguage: string, language?: string) => {
      const { audio } = await generateSpeech({
        model: apple.speechModel({ language: modelLanguage }),
        text: 'Bonjour tout le monde.',
        language,
      })
      return readWav(audio.uint8Array).dataSize
    }

    const english = await speak('en-US')
    const french = await speak('fr-FR')

    expect(french).not.toBe(english)
    expect(await speak('en-US', 'fr-FR')).toBe(french)
  })

  it('warns that it cannot detect the language', async () => {
    const { warnings } = await generateSpeech({
      model: apple.speechModel({ language: 'en-US' }),
      text: 'Hello world.',
      language: 'auto',
    })

    expect(warnings).toEqual([
      {
        type: 'unsupported',
        feature: 'language',
        details:
          'Speech synthesis cannot detect the language, so en-US was used.',
      },
    ])
  })

  it('speaks faster with a higher speed', async () => {
    const speak = async (speed?: number) => {
      const { audio, warnings } = await generateSpeech({
        model: apple.speechModel({ language: 'en-US' }),
        text: 'The quick brown fox jumps over the lazy dog.',
        speed,
      })
      expect(warnings).toEqual([])
      return readWav(audio.uint8Array).dataSize
    }

    const normal = await speak()

    expect(await speak(2)).toBeLessThan(normal)
    expect(await speak(0.5)).toBeGreaterThan(normal)
  })

  it('speaks at the default rate when the speed is not a number', async () => {
    const normal = await AppleSpeech.generate('Hello world.', {
      language: 'en-US',
    })
    const notANumber = await AppleSpeech.generate('Hello world.', {
      language: 'en-US',
      speed: NaN,
    })

    expect(notANumber.byteLength).toBe(normal.byteLength)
  })

  it('does not warn about the language when a voice is set', async () => {
    const voices = await AppleSpeech.getVoices()
    const voice = voices.find((v) => v.language === 'en-US') ?? voices[0]

    const { warnings } = await generateSpeech({
      model: apple.speechModel({ language: 'en-US' }),
      text: 'Hello world.',
      language: 'auto',
      voice: voice.identifier,
    })

    expect(warnings).toEqual([])
  })

  it('settles for whitespace-only text', async () => {
    const audio = await AppleSpeech.generate('   ', { language: 'en-US' })

    expect(readWav(new Uint8Array(audio)).riff).toBe('RIFF')
  })

  it('warns about settings speech synthesis has no equivalent for', async () => {
    const { warnings } = await generateSpeech({
      model: apple.speechModel({ language: 'en-US' }),
      text: 'Hello world.',
      outputFormat: 'mp3',
      instructions: 'Speak cheerfully.',
    })

    expect(warnedFeatures(warnings)).toEqual(['outputFormat', 'instructions'])
  })
})
