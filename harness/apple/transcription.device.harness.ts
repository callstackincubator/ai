import { apple, AppleSpeech } from '@react-native-ai/apple'
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

  it('is unavailable for a language it does not support', () => {
    expect(apple.transcriptionModel({ language: 'tlh' }).isAvailable()).toBe(
      false
    )
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

  it('times each word', async () => {
    const model = apple.transcriptionModel({ language: 'en-US' })

    const result = await transcribe({ model, audio: speech })
    const words = result.providerMetadata.apple.words as {
      text: string
      startSecond: number
      endSecond: number
    }[]

    expect(words.map((word) => word.text.toLowerCase())).toEqual(
      expect.arrayContaining(['quick', 'brown', 'fox'])
    )
    for (const [index, word] of words.entries()) {
      expect(word.endSecond).toBeGreaterThanOrEqual(word.startSecond)
      if (index > 0) {
        expect(word.startSecond).toBeGreaterThanOrEqual(
          words[index - 1].startSecond
        )
      }
    }
  })

  it('recognizes words from its vocabulary', async () => {
    const audio = new Uint8Array(
      await AppleSpeech.generate('Yesterday Kwabena Oduro visited Zyrtania.', {
        language: 'en-US',
      })
    )
    const model = apple.transcriptionModel({ language: 'en-US' })

    const result = await transcribe({
      model,
      audio,
      providerOptions: {
        apple: { contextualStrings: ['Kwabena Oduro', 'Zyrtania'] },
      },
    })

    expect(result.text).toMatch(/Kwabena/)
    expect(result.text).toMatch(/Zyrtania/)
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
