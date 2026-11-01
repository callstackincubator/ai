import { android } from '@react-native-ai/android'
import { experimental_transcribe as transcribe } from 'ai'
import { describe, expect, it } from 'react-native-harness'

import { base64ToBytes, speech } from '../fixtures'

const model = android.transcriptionModel({ language: 'en-US', mode: 'basic' })

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
})
