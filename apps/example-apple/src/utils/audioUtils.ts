/**
 * Merges multiple AudioBuffer objects into a single continuous Float32Array
 *
 * The Web Audio API recording typically provides audio data as a series of AudioBuffer chunks.
 * Each buffer contains PCM data that can be accessed via getChannelData(). This function
 * concatenates all the PCM data from channel 0 (assuming mono recording) into one array.
 */
export const mergeBuffersToFloat32Array = (
  buffers: AudioBuffer[]
): Float32Array => {
  if (buffers.length === 0) return new Float32Array(0)

  // Calculate total samples needed (using channel 0)
  const totalLength = buffers.reduce((sum, buffer) => sum + buffer.length, 0)

  // Create merged PCM data array
  const mergedPCM = new Float32Array(totalLength)

  let offset = 0
  for (const buffer of buffers) {
    // Get PCM data directly from channel 0
    const channelData = buffer.getChannelData(0)
    mergedPCM.set(channelData, offset)
    offset += buffer.length
  }

  return mergedPCM
}

/**
 * Converts Float32Array PCM data to WAV file format
 *
 * Creates a complete WAV file by:
 * 1. Building a 44-byte WAV header with RIFF/WAVE structure
 * 2. Setting audio format parameters (PCM, mono, 16-bit, sample rate)
 * 3. Converting Float32 samples (-1.0 to 1.0) to 16-bit signed integers (-32768 to 32767)
 * 4. Writing all data to an ArrayBuffer that represents a valid WAV file
 */
export const float32ArrayToWAV = (
  pcmData: Float32Array,
  sampleRate: number
): ArrayBuffer => {
  const length = pcmData.length
  const buffer = new ArrayBuffer(44 + length * 2) // 44-byte header + 16-bit samples
  const view = new DataView(buffer)

  // Helper function to write ASCII strings to the buffer
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i))
    }
  }

  // WAV file header (44 bytes total)
  writeString(0, 'RIFF') // ChunkID
  view.setUint32(4, 36 + length * 2, true) // ChunkSize
  writeString(8, 'WAVE') // Format
  writeString(12, 'fmt ') // Subchunk1ID
  view.setUint32(16, 16, true) // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true) // AudioFormat (1 = PCM)
  view.setUint16(22, 1, true) // NumChannels (1 = mono)
  view.setUint32(24, sampleRate, true) // SampleRate
  view.setUint32(28, sampleRate * 2, true) // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
  view.setUint16(32, 2, true) // BlockAlign (NumChannels * BitsPerSample/8)
  view.setUint16(34, 16, true) // BitsPerSample (16-bit)
  writeString(36, 'data') // Subchunk2ID
  view.setUint32(40, length * 2, true) // Subchunk2Size

  // Convert Float32Array to 16-bit PCM data
  let offset = 44
  for (let i = 0; i < length; i++) {
    // Clamp sample to [-1.0, 1.0] range and convert to 16-bit signed integer
    const sample = Math.max(-1, Math.min(1, pcmData[i]))
    const pcm16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff
    view.setInt16(offset, pcm16, true) // little-endian
    offset += 2
  }

  return buffer
}
