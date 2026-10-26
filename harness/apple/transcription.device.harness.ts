import { apple, AppleSpeech, AppleTranscription } from '@react-native-ai/apple'
import { experimental_transcribe as transcribe } from 'ai'
import { beforeAll, describe, expect, it } from 'react-native-harness'

// Simulators do not have the speech transcriber

let speech: Uint8Array

beforeAll(async () => {
  speech = new Uint8Array(
    await AppleSpeech.generate('The quick brown fox jumps over the lazy dog.', {
      language: 'en-US',
    })
  )
})

describe('apple transcription', () => {
  it('is available for english', () => {
    expect(apple.transcriptionModel({ language: 'en-US' }).isAvailable()).toBe(
      true
    )
  })

  it('describes the locale a language resolves to', async () => {
    const model = apple.transcriptionModel({ language: 'en' })
    await model.prepare()

    expect(await model.getModelInfo()).toMatchObject({
      isAvailable: true,
      supportsLocale: true,
      locale: expect.stringMatching(/^en-/),
      assets: 'installed',
    })
  })

  it('reports a language it does not support', async () => {
    const info = await apple
      .transcriptionModel({ language: 'tlh' })
      .getModelInfo()

    expect(info.supportsLocale).toBe(false)
    expect(info.locale).toBeUndefined()
    expect(info.supportedLocales).toContain('en-US')
  })

  it('rejects transcription in a language it does not support', async () => {
    await expect(
      AppleTranscription.transcribe(speech.slice().buffer, 'tlh')
    ).rejects.toMatch(/Locale not supported/)
  })

  it('transcribes with a language code without a region', async () => {
    const model = apple.transcriptionModel({ language: 'en' })
    await model.prepare()

    const result = await transcribe({ model, audio: speech })

    expect(result.text).toMatch(/quick brown fox/i)
  })

  it('transcribes speech with timed segments', async () => {
    const model = apple.transcriptionModel({ language: 'en-US' })
    await model.prepare()

    const result = await transcribe({ model, audio: speech })

    expect(result.text).toMatch(/quick brown fox/i)
    expect(result.segments.length).toBeGreaterThan(0)
    expect(result.durationInSeconds).toBeGreaterThan(0)
  })

  it('transcribes only the bytes of a typed array view', async () => {
    const model = apple.transcriptionModel({ language: 'en-US' })
    const padded = new Uint8Array(speech.length + 8)
    padded.set(speech, 4)

    const result = await transcribe({
      model,
      audio: padded.subarray(4, 4 + speech.length),
    })

    expect(result.text).toMatch(/fox/i)
  })

  it('reports the language as an ISO-639-1 code', async () => {
    const model = apple.transcriptionModel({ language: 'en_US' })

    const result = await transcribe({ model, audio: speech })

    expect(result.language).toBe('en')
  })
})
