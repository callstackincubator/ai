import { apple } from '@react-native-ai/apple'
import { generateSpeech } from 'ai'
import { AudioContext, AudioManager } from 'react-native-audio-api'

// Speaks the text with Apple's on-device voice and resolves when it is done
export async function speak(text: string, signal?: AbortSignal) {
  const { audio } = await generateSpeech({
    model: apple.speechModel(),
    text,
    abortSignal: signal,
  })
  if (signal?.aborted) return

  AudioManager.setAudioSessionOptions({
    iosCategory: 'playback',
    iosMode: 'spokenAudio',
  })
  const context = new AudioContext()
  try {
    // Copied into its own buffer, as the bytes can be a view into a larger one
    const buffer = await context.decodeAudioData(
      new Uint8Array(audio.uint8Array).buffer
    )
    // Stop can be tapped while the audio decodes
    if (signal?.aborted) return
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)

    let onAbort: (() => void) | undefined
    await new Promise<void>((resolve) => {
      onAbort = () => {
        source.stop()
        resolve()
      }
      source.onEnded = () => resolve()
      signal?.addEventListener('abort', onAbort)
      source.start()
    })
    if (onAbort) signal?.removeEventListener('abort', onAbort)
  } finally {
    context.close()
  }
}
