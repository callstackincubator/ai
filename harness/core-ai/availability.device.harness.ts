import { CoreAI, type CoreAICapabilities } from '@react-native-ai/core-ai'
import { describe, expect, it } from 'react-native-harness'

// The example app links every task (see apps/example/app.config.js)

describe('core-ai availability', () => {
  it('reports the linked products', async () => {
    const capabilities = (await CoreAI.getCapabilities()) as CoreAICapabilities

    expect(capabilities.isCoreAIRuntimeAvailable).toBe(true)
    expect(capabilities.isCoreAILMAvailable).toBe(true)
    expect(capabilities.isCoreAIObjectDetectionAvailable).toBe(true)
    expect(capabilities.isCoreAISegmentationAvailable).toBe(true)
    expect(capabilities.isCoreAIDiffusionAvailable).toBe(true)
    expect(capabilities.isCoreAISpeechAvailable).toBe(true)

    expect(capabilities.isCoreAIVideoSegmentationAvailable).toBe(true)
    expect(capabilities.isCoreAIVideoDiffusionAvailable).toBe(true)
    expect(capabilities.missingProducts).toEqual([])
  })

  it('rejects a model that is not on disk', async () => {
    await expect(
      CoreAI.generateImage({ source: '/missing' }, 'a cat', {})
    ).rejects.toMatchObject({ code: expect.any(String) })
  })

  it('rejects a bundle source that is not in the app bundle', async () => {
    await expect(
      CoreAI.inspectModel({ source: 'bundle://models/missing' })
    ).rejects.toMatchObject({
      code: 'CORE_AI_MISSING_SOURCE',
      message: 'The app bundle has no models/missing.',
    })
  })

  it('names a model after its folder when the config has no id', async () => {
    const info = await CoreAI.inspectModel({ source: '/missing/qwen3-0.6b/' })

    expect(info.id).toBe('qwen3-0.6b')
  })
})
