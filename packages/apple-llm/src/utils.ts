/**
 * WAV file utilities for handling audio data
 *
 * This module provides utilities for creating WAV file headers and converting PCM data to WAV format.
 */

export const AudioFormatType = {
  INTEGER: 0,
  FLOAT: 1,
} as const

export interface WAVOptions {
  sampleRate: number
  channels?: number
  bitsPerSample?: number
  formatType?: number // 0 = integer, 1 = float (use AudioFormatType constants)
}

/**
 * Creates a WAV file header with the specified parameters
 */
const createWAVHeader = (
  pcmDataLength: number,
  options: WAVOptions
): ArrayBuffer => {
  const {
    sampleRate,
    channels = 1,
    bitsPerSample = 16,
    formatType = AudioFormatType.INTEGER,
  } = options

  const buffer = new ArrayBuffer(44)
  const view = new DataView(buffer)

  const byteRate = (sampleRate * channels * bitsPerSample) / 8
  const blockAlign = (channels * bitsPerSample) / 8

  // Helper function to write ASCII strings
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i))
    }
  }

  // WAV file header (44 bytes total)
  writeString(0, 'RIFF') // ChunkID
  view.setUint32(4, 36 + pcmDataLength, true) // ChunkSize
  writeString(8, 'WAVE') // Format
  writeString(12, 'fmt ') // Subchunk1ID
  view.setUint32(16, 16, true) // Subchunk1Size (16 for PCM)
  view.setUint16(20, formatType === AudioFormatType.FLOAT ? 3 : 1, true) // AudioFormat (3 = IEEE float, 1 = PCM)
  view.setUint16(22, channels, true) // NumChannels
  view.setUint32(24, sampleRate, true) // SampleRate
  view.setUint32(28, byteRate, true) // ByteRate
  view.setUint16(32, blockAlign, true) // BlockAlign
  view.setUint16(34, bitsPerSample, true) // BitsPerSample
  writeString(36, 'data') // Subchunk2ID
  view.setUint32(40, pcmDataLength, true) // Subchunk2Size

  return buffer
}

/**
 * Adds WAV header to PCM data
 *
 * Takes PCM data (either raw bytes from native APIs or Float32Array from Web Audio API)
 * and wraps it in a proper WAV file structure.
 */
export const addWAVHeader = (
  pcmData: ArrayBufferLike,
  options: WAVOptions
): ArrayBuffer => {
  const header = createWAVHeader(pcmData.byteLength, options)

  const wavBuffer = new ArrayBuffer(header.byteLength + pcmData.byteLength)
  const wavView = new Uint8Array(wavBuffer)

  wavView.set(new Uint8Array(header), 0)
  wavView.set(new Uint8Array(pcmData), header.byteLength)

  return wavBuffer
}
