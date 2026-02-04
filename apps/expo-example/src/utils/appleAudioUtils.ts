import { addWAVHeader, AudioFormatType } from '@react-native-ai/apple'

/**
 * Converts Float32Array PCM data to WAV file format
 *
 * Uses the addWAVHeader utility from @react-native-ai/apple library with appropriate format settings.
 * This ensures consistent WAV file generation across the application.
 */
export const float32ArrayToWAV = (
  pcmData: Float32Array,
  sampleRate: number
): ArrayBuffer => {
  return addWAVHeader(pcmData.buffer, {
    sampleRate,
    channels: 1,
    bitsPerSample: 32,
    formatType: AudioFormatType.FLOAT,
  })
}
