import {
  experimental_streamTranscribe as streamTranscribe,
  experimental_transcribe as transcribe,
} from 'ai'
import { describe, expect, it } from 'react-native-harness'

import { speech, speechPcm8k } from '../fixtures'
import { setupSpeechModel } from './helpers'

const model = setupSpeechModel()

const audio = Uint8Array.from(atob(speech), (char) => char.charCodeAt(0))

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .split(/\s+/)
    .filter(Boolean)

describe('core-ai transcription', () => {
  it('transcribes speech', async () => {
    const { text } = await transcribe({ model, audio })

    const transcript = words(text)
    for (const word of ['quick', 'brown', 'fox', 'lazy', 'dog', 'paris']) {
      expect(transcript).toContain(word)
    }
  })

  it('splits the transcript at the pause, with timestamps', async () => {
    const { segments, durationInSeconds } = await transcribe({ model, audio })

    expect(durationInSeconds).toBeCloseTo(6.3, 0)
    expect(segments).toHaveLength(2)
    expect(words(segments[0].text)).toContain('fox')
    expect(words(segments[1].text)).toContain('paris')
    // Segments are contiguous, so the first one ends with the 1.5 s pause
    // after the first sentence (about 2.4 s in), where the second starts
    expect(segments[0].startSecond).toBeLessThan(1)
    expect(segments[1].startSecond).toBe(segments[0].endSecond)
    expect(segments[1].startSecond).toBeGreaterThan(2.4)
    expect(segments[1].endSecond).toBeCloseTo(durationInSeconds!, 0)
  })

  it('rejects audio it cannot decode', async () => {
    await expect(
      transcribe({ model, audio: new Uint8Array([1, 2, 3, 4]) })
    ).rejects.toThrow('decode')
  })
})

describe('core-ai streaming transcription', () => {
  const stream = () => {
    const pcm = Uint8Array.from(atob(speechPcm8k), (char) => char.charCodeAt(0))
    // 0.1 s chunks of an odd size, so samples split across chunks
    const chunkSize = 1601
    return streamTranscribe({
      model,
      inputAudioFormat: { type: 'audio/pcm', rate: 8000 },
      audio: new ReadableStream<Uint8Array>({
        start(controller) {
          for (let i = 0; i < pcm.length; i += chunkSize) {
            controller.enqueue(pcm.subarray(i, i + chunkSize))
          }
          controller.close()
        },
      }),
    })
  }

  it('streams the transcript as it grows', async () => {
    const result = stream()
    let deltas = ''
    const finals: string[] = []
    for await (const part of result.fullStream) {
      if (part.type === 'transcript-delta') deltas += part.delta
      if (part.type === 'transcript-final') finals.push(part.text)
    }

    expect(finals).toHaveLength(2)
    expect(words(finals[0])).toContain('fox')
    expect(words(finals[1])).toContain('paris')
    // The deltas add up to the final text
    expect(deltas).toBe(finals.join(' '))
    expect(await result.text).toBe(finals.join(' '))
  })

  it('resamples to the model rate', async () => {
    const result = stream()

    expect(await result.durationInSeconds).toBeCloseTo(6.3, 0)
    expect(await result.segments).toHaveLength(2)
  })
})
