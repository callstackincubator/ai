import { describe, expect, test } from 'bun:test'

import { addWAVHeader, AudioFormatType } from '../utils'

function readString(buffer: ArrayBuffer, offset: number, length: number) {
  return String.fromCharCode(...new Uint8Array(buffer, offset, length))
}

function wav(buffer: ArrayBuffer, offset: number) {
  const view = new DataView(buffer)
  return {
    uint32: (at: number) => view.getUint32(offset + at, true),
    uint16: (at: number) => view.getUint16(offset + at, true),
  }
}

describe('addWAVHeader', () => {
  const pcm = new Uint8Array([1, 2, 3, 4, 5, 6]).buffer

  test('writes the canonical RIFF/WAVE markers', () => {
    const wavBuffer = addWAVHeader(pcm, { sampleRate: 16000 })

    expect(wavBuffer.byteLength).toBe(44 + pcm.byteLength)
    expect(readString(wavBuffer, 0, 4)).toBe('RIFF')
    expect(readString(wavBuffer, 8, 4)).toBe('WAVE')
    expect(readString(wavBuffer, 12, 4)).toBe('fmt ')
    expect(readString(wavBuffer, 36, 4)).toBe('data')
  })

  test('derives sizes, byte rate and block align from options', () => {
    const wavBuffer = addWAVHeader(pcm, {
      sampleRate: 44100,
      channels: 2,
      bitsPerSample: 16,
    })
    const header = wav(wavBuffer, 0)

    expect(header.uint32(4)).toBe(36 + pcm.byteLength)
    expect(header.uint32(16)).toBe(16)
    expect(header.uint16(20)).toBe(1)
    expect(header.uint16(22)).toBe(2)
    expect(header.uint32(24)).toBe(44100)
    expect(header.uint32(28)).toBe((44100 * 2 * 16) / 8)
    expect(header.uint16(32)).toBe((2 * 16) / 8)
    expect(header.uint16(34)).toBe(16)
    expect(header.uint32(40)).toBe(pcm.byteLength)
  })

  test('defaults to mono 16-bit integer PCM', () => {
    const header = wav(addWAVHeader(pcm, { sampleRate: 24000 }), 0)

    expect(header.uint16(20)).toBe(1)
    expect(header.uint16(22)).toBe(1)
    expect(header.uint16(32)).toBe(2)
    expect(header.uint16(34)).toBe(16)
  })

  test('marks IEEE float format when requested', () => {
    const header = wav(
      addWAVHeader(pcm, {
        sampleRate: 48000,
        bitsPerSample: 32,
        formatType: AudioFormatType.FLOAT,
      }),
      0
    )

    expect(header.uint16(20)).toBe(3)
    expect(header.uint16(34)).toBe(32)
  })

  test('appends the PCM payload unchanged', () => {
    const wavBuffer = addWAVHeader(pcm, { sampleRate: 16000 })

    expect([...new Uint8Array(wavBuffer, 44)]).toEqual([1, 2, 3, 4, 5, 6])
  })

  test('handles empty PCM payloads', () => {
    const header = wav(
      addWAVHeader(new ArrayBuffer(0), { sampleRate: 8000 }),
      0
    )

    expect(header.uint32(4)).toBe(36)
    expect(header.uint32(40)).toBe(0)
  })
})
