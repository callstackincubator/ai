import { AppleTranscription } from '@react-native-ai/apple'
import { describe, expect, it } from 'react-native-harness'

// Simulators do not have the speech transcriber. The first run asks for
// microphone access on the device

describe('apple live transcription', () => {
  it('starts and stops recording', async () => {
    const errors: Error[] = []
    const live = await AppleTranscription.transcribeLive({
      language: 'en-US',
      onResult: () => {},
      onError: (error) => errors.push(error),
    })

    await new Promise((resolve) => setTimeout(resolve, 2000))
    await live.stop()

    expect(errors).toEqual([])
  })

  it('stops a session that already stopped', async () => {
    const live = await AppleTranscription.transcribeLive({
      language: 'en-US',
      onResult: () => {},
    })

    await live.stop()
    await expect(live.stop()).resolves.toBeUndefined()
  })
})
