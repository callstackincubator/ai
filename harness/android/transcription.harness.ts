import { android } from '@react-native-ai/android'
import {
  experimental_streamTranscribe as streamTranscribe,
  experimental_transcribe as transcribe,
} from 'ai'
import { describe, expect, it } from 'react-native-harness'

import { base64ToBytes, speech, speechPcm8k } from '../fixtures'

const model = android.transcriptionModel({ language: 'en-US', mode: 'basic' })

// The 8 kHz fixture at the 16 kHz ML Kit streams, by linear interpolation of
// its little-endian samples
function to16k(pcm8k: Uint8Array) {
  const view = new DataView(pcm8k.buffer, pcm8k.byteOffset, pcm8k.byteLength)
  const sampleCount = Math.floor(pcm8k.byteLength / 2)
  const output = new Int16Array(sampleCount * 2)
  for (let index = 0; index < sampleCount; index++) {
    const sample = view.getInt16(index * 2, true)
    const next =
      index + 1 < sampleCount ? view.getInt16((index + 1) * 2, true) : sample
    output[index * 2] = sample
    output[index * 2 + 1] = (sample + next) >> 1
  }
  return new Uint8Array(output.buffer)
}

describe('android transcription', () => {
  it('reports recognizer availability', async () => {
    const info = await model.getModelInfo()
    console.log('[android] speech recognition basic:', JSON.stringify(info))
    console.log(
      '[android] speech recognition advanced:',
      JSON.stringify(
        await android
          .transcriptionModel({ language: 'en-US', mode: 'advanced' })
          .getModelInfo()
      )
    )

    expect(info.availability).not.toBe('unknown')
  })

  it('transcribes an M4A file', async () => {
    await model.prepare({ onProgress: () => {} })

    const { text } = await transcribe({
      model,
      audio: base64ToBytes(speech),
    })

    expect(text).toMatch(/quick brown fox/i)
    expect(text).toMatch(/paris/i)
  })

  it('streams PCM with deltas and timed segments', async () => {
    const pcm = to16k(base64ToBytes(speechPcm8k))
    // 100 ms chunks, as a microphone sends them
    const audio = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let offset = 0; offset < pcm.length; offset += 3200) {
          controller.enqueue(pcm.subarray(offset, offset + 3200))
        }
        controller.close()
      },
    })

    const result = streamTranscribe({
      model,
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      audio,
    })
    let deltas = ''
    const segments: {
      text: string
      startSecond?: number
      endSecond?: number
    }[] = []
    for await (const part of result.fullStream) {
      if (part.type === 'transcript-delta') deltas += part.delta
      if (part.type === 'transcript-final') segments.push(part)
    }
    console.log('[android] streamed segments:', JSON.stringify(segments))

    expect(await result.text).toMatch(/quick brown fox/i)
    expect(deltas).toMatch(/quick brown fox/i)
    expect(segments.length).toBeGreaterThan(0)
    // A one-word segment ends as it starts
    const [first] = segments
    if (first!.startSecond !== undefined) {
      expect(first!.endSecond).toBeGreaterThanOrEqual(first!.startSecond)
    }
  })
})
