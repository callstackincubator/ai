import type { Experimental_TranscriptionModelV4StreamPart as StreamPart } from '@ai-sdk/provider'
import { apple, AppleSpeech, AppleTranscription } from '@react-native-ai/apple'
import { experimental_streamTranscribe as streamTranscribe } from 'ai'
import { beforeAll, describe, expect, it } from 'react-native-harness'

// Simulators do not have the speech transcriber. The speech is synthesized,
// then fed in chunks the way a recorder would

let sampleRate: number
let int16: Uint8Array
let float32: Uint8Array

beforeAll(async () => {
  // Mono 32-bit float wav with a 44 byte header
  const wav = new Uint8Array(
    await AppleSpeech.generate('The quick brown fox jumps over the lazy dog.', {
      language: 'en-US',
    })
  )
  sampleRate = new DataView(wav.buffer).getUint32(24, true)
  float32 = wav.slice(44)
  const samples = new Float32Array(float32.buffer)
  const ints = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    ints[i] = Math.max(-1, Math.min(1, samples[i])) * 0x7fff
  }
  int16 = new Uint8Array(ints.buffer)
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Streams the audio in chunks of the given sizes, repeating the last size.
 * With a delay, waits between chunks like a recorder does
 */
function chunked(audio: Uint8Array, sizes: number[], delayMs = 0) {
  let offset = 0
  let index = 0
  return new ReadableStream<Uint8Array>({
    pull: async (controller) => {
      if (offset >= audio.length) {
        controller.close()
        return
      }
      const size = sizes[Math.min(index++, sizes.length - 1)]
      // Copies, so a chunk is not a view into the whole recording
      controller.enqueue(audio.slice(offset, offset + size))
      offset += size
      if (delayMs) {
        await sleep(delayMs)
      }
    },
  })
}

async function transcribeStream(
  audio: ReadableStream<Uint8Array | string>,
  options: { encoding?: 'int16' | 'float32'; abortSignal?: AbortSignal } = {}
) {
  const { stream } = await apple
    .transcriptionModel({ language: 'en-US' })
    .doStream({
      audio,
      inputAudioFormat: { type: 'audio/pcm', rate: sampleRate },
      providerOptions: options.encoding
        ? { apple: { encoding: options.encoding } }
        : undefined,
      abortSignal: options.abortSignal,
    })
  const parts: StreamPart[] = []
  const reader = stream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      return parts
    }
    parts.push(value)
  }
}

function finishOf(parts: StreamPart[]) {
  const finish = parts.find((part) => part.type === 'finish')
  if (finish?.type !== 'finish') {
    throw new Error(`No finish part in ${JSON.stringify(parts)}`)
  }
  return finish
}

// Sizes in bytes, e.g. 100 ms of int16 audio is sampleRate / 5 bytes
const chunkings: [string, (rate: number) => number[]][] = [
  ['100 ms chunks', (rate) => [rate / 5]],
  ['odd chunks that split samples', () => [333]],
  ['large chunks', () => [64 * 1024]],
  ['the whole recording at once', () => [Number.MAX_SAFE_INTEGER]],
  ['chunks of mixed sizes', () => [1, 7, 4096, 2, 999, 12_345, 3, 5000]],
]

describe('apple stream transcription', () => {
  it('reports partial results before the final ones in real time', async () => {
    const tenth = sampleRate / 5
    const parts = await transcribeStream(chunked(int16, [tenth], 100))

    const types = parts.map((part) => part.type)
    expect(types[0]).toBe('stream-start')
    expect(types).toContain('transcript-partial')
    expect(types.indexOf('transcript-partial')).toBeLessThan(
      types.lastIndexOf('transcript-final')
    )
    expect(types.at(-1)).toBe('finish')
    expect(types).not.toContain('error')
  })

  for (const [name, sizes] of chunkings) {
    it(`transcribes ${name}`, async () => {
      const parts = await transcribeStream(chunked(int16, sizes(sampleRate)))
      const finish = finishOf(parts)

      expect(finish.text).toMatch(/quick brown fox/i)
      expect(finish.language).toBe('en')
      expect(finish.durationInSeconds).toBeCloseTo(
        int16.length / 2 / sampleRate,
        2
      )
    })
  }

  it('reports final segments in order', async () => {
    const finish = finishOf(
      await transcribeStream(chunked(int16, [sampleRate / 5]))
    )

    expect(finish.segments.length).toBeGreaterThan(0)
    for (const [index, segment] of finish.segments.entries()) {
      expect(segment.endSecond).toBeGreaterThanOrEqual(segment.startSecond)
      if (index > 0) {
        expect(segment.startSecond).toBeGreaterThanOrEqual(
          finish.segments[index - 1].endSecond - 0.01
        )
      }
    }
  })

  it('transcribes float32 samples', async () => {
    const finish = finishOf(
      await transcribeStream(chunked(float32, [sampleRate / 5]), {
        encoding: 'float32',
      })
    )

    expect(finish.text).toMatch(/quick brown fox/i)
    expect(finish.durationInSeconds).toBeCloseTo(
      float32.length / 4 / sampleRate,
      2
    )
  })

  it('transcribes base64 chunks', async () => {
    const tenth = sampleRate / 5
    const chunks: string[] = []
    for (let offset = 0; offset < int16.length; offset += tenth) {
      chunks.push(
        btoa(String.fromCharCode(...int16.subarray(offset, offset + tenth)))
      )
    }
    const audio = new ReadableStream<string>({
      start: (controller) => {
        chunks.forEach((chunk) => controller.enqueue(chunk))
        controller.close()
      },
    })

    expect(finishOf(await transcribeStream(audio)).text).toMatch(
      /quick brown fox/i
    )
  })

  it('finishes empty audio with no text', async () => {
    const finish = finishOf(
      await transcribeStream(chunked(new Uint8Array(), [1]))
    )

    expect(finish.text).toBe('')
    expect(finish.segments).toEqual([])
    expect(finish.durationInSeconds).toBe(0)
  })

  it('stops when aborted and transcribes again after', async () => {
    const controller = new AbortController()
    const audio = chunked(int16, [sampleRate / 5], 100)
    setTimeout(() => controller.abort(), 500)

    await expect(
      transcribeStream(audio, { abortSignal: controller.signal })
    ).rejects.toThrow()

    const finish = finishOf(await transcribeStream(chunked(int16, [64 * 1024])))
    expect(finish.text).toMatch(/quick brown fox/i)
  })

  it('works with streamTranscribe', async () => {
    const result = streamTranscribe({
      model: apple.transcriptionModel({ language: 'en-US' }),
      audio: chunked(int16, [sampleRate / 5]),
      inputAudioFormat: { type: 'audio/pcm', rate: sampleRate },
    })

    expect(await result.text).toMatch(/quick brown fox/i)
    expect((await result.segments).length).toBeGreaterThan(0)
  })

  it('transcribes appended audio with the raw api', async () => {
    const results: { text: string; isFinal: boolean }[] = []
    const errors: Error[] = []
    const session = await AppleTranscription.transcribeStream({
      language: 'en-US',
      sampleRate,
      onResult: (result) => results.push(result),
      onError: (error) => errors.push(error),
    })

    for (let offset = 0; offset < int16.length; offset += 777) {
      session.append(int16.subarray(offset, offset + 777))
    }
    await session.stop()

    const final = results
      .filter((result) => result.isFinal)
      .map((result) => result.text)
      .join(' ')
    expect(final).toMatch(/quick brown fox/i)
    expect(errors).toEqual([])
    expect(() => session.append(int16)).toThrow(/stopped/)
  })
})
