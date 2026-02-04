import type { AudioBuffer } from 'react-native-audio-api'

/**
 * Merges multiple AudioBuffer objects into a single continuous Float32Array
 *
 * The Web Audio API recording typically provides audio data as a series of AudioBuffer chunks.
 * Each buffer contains PCM data that can be accessed via getChannelData().
 *
 * In the future, we should support multiple channels too.
 */
export const mergeBuffersToFloat32Array = (
  buffers: AudioBuffer[]
): Float32Array => {
  if (buffers.length === 0) {
    return new Float32Array(0)
  }

  const totalLength = buffers.reduce((sum, buffer) => sum + buffer.length, 0)
  const mergedPCM = new Float32Array(totalLength)

  let offset = 0
  for (const buffer of buffers) {
    const channelData = buffer.getChannelData(0)
    mergedPCM.set(channelData, offset)
    offset += buffer.length
  }

  return mergedPCM
}
