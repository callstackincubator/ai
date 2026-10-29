import { adk } from '@react-native-ai/adk'
import { describe, expect, it } from 'react-native-harness'

// Gemini Nano runs only on physical devices with AICore, such as a Pixel 9
describe('adk availability', () => {
  it('reports Gemini Nano details', async () => {
    const info = await adk.getModelInfo()

    expect(['available', 'downloadable', 'downloading']).toContain(
      info.availability
    )
  })

  // On a fresh device this downloads Gemini Nano, which takes minutes
  it('prepares Gemini Nano with download progress', async () => {
    await adk().prepare({ onProgress: () => {} })

    const info = await adk.getModelInfo()
    expect(info.availability).toBe('available')
    expect(info.contextSize).toBeGreaterThan(0)
    expect(adk.isAvailable()).toBe(true)
  })

  it('checks availability synchronously', () => {
    expect(typeof adk.isAvailable()).toBe('boolean')
    expect(adk().isAvailable()).toBe(adk.isAvailable())
  })

  it('counts tokens with the Gemini Nano tokenizer', async () => {
    expect(await adk().countTokens('How many tokens is this?')).toBeGreaterThan(
      0
    )
  })
})
