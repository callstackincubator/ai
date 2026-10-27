import { apple } from '@react-native-ai/apple'
import { experimental_generateSpeech as generateSpeech } from 'ai'
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
  // Copied into its own buffer, as the bytes can be a view into a larger one
  const buffer = await context.decodeAudioData(
    new Uint8Array(audio.uint8Array).buffer
  )
  const source = context.createBufferSource()
  source.buffer = buffer
  source.connect(context.destination)

  await new Promise<void>((resolve) => {
    source.onEnded = () => resolve()
    signal?.addEventListener('abort', () => {
      source.stop()
      resolve()
    })
    source.start()
  })
  context.close()
}
