import { android } from '@react-native-ai/android'
import { describe, expect, it } from 'react-native-harness'

import { nano4 } from './helpers'

// Gemini Nano runs only on physical devices with AICore, such as a Pixel 9
describe('android availability', () => {
  it('reports Gemini Nano details', async () => {
    const info = await android.getModelInfo()
    console.log('[android] Gemini Nano:', JSON.stringify(info))

    expect(['available', 'downloadable', 'downloading']).toContain(
      info.availability
    )
  })

  // On a fresh device this downloads Gemini Nano, which takes minutes
  it('prepares Gemini Nano with download progress', async () => {
    await android().prepare({ onProgress: () => {} })

    const info = await android.getModelInfo()
    expect(info.availability).toBe('available')
    expect(info.contextSize).toBeGreaterThan(0)
    expect(info.features).toBeDefined()
  })

  it('reports Gemini Nano 4 preview details', async () => {
    const info = await nano4.getModelInfo()
    console.log('[android] Gemini Nano preview fast:', JSON.stringify(info))

    expect(info.availability).not.toBe('unknown')
  })

  it('counts tokens with the Gemini Nano tokenizer', async () => {
    expect(
      await android().countTokens('How many tokens is this?')
    ).toBeGreaterThan(0)
  })
})
