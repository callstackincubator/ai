import { CoreAI, type CoreAICapabilities } from '@react-native-ai/core-ai'
import { describe, expect, it } from 'react-native-harness'

// The example app links every task (see apps/expo-example/app.config.js)

describe('core-ai availability', () => {
  it('reports the linked products', async () => {
    const capabilities = (await CoreAI.getCapabilities()) as CoreAICapabilities

    expect(capabilities.isCoreAIRuntimeAvailable).toBe(true)
    expect(capabilities.isCoreAILMAvailable).toBe(true)
    expect(capabilities.isCoreAIObjectDetectionAvailable).toBe(true)
    expect(capabilities.isCoreAISegmentationAvailable).toBe(true)
    expect(capabilities.isCoreAIDiffusionAvailable).toBe(true)
    expect(capabilities.missingProducts).toEqual([])
  })

  it('rejects a model that is not on disk', async () => {
    await expect(
      CoreAI.generateImage(
        { id: 'missing', sourceType: 'file', sourceUri: '/missing' },
        'a cat',
        {}
      )
    ).rejects.toMatchObject({ code: expect.any(String) })
  })
})
