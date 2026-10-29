import { adk } from '@react-native-ai/adk'
import { experimental_transcribe as transcribe } from 'ai'
import { describe, expect, it } from 'react-native-harness'

import { speech } from '../fixtures'

// ML Kit decides per device which locales and modes it supports
describe('adk transcription', () => {
  const model = adk.transcriptionModel({ language: 'en-US' })

  it('reports speech recognition availability', async () => {
    expect([
      'available',
      'downloadable',
      'downloading',
      'unavailable',
    ]).toContain(await model.getAvailability())
  })

  it('transcribes speech where ML Kit supports it', async () => {
    if (!(await model.isAvailable())) {
      await expect(model.prepare()).rejects.toMatchObject({
        code: 'MODEL_UNAVAILABLE',
      })
      return
    }

    await model.prepare()
    const { text } = await transcribe({ model, audio: speech })

    expect(text).toMatch(/quick brown fox/i)
  })
})
