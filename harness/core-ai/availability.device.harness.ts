import { CoreAI, type CoreAICapabilities } from '@react-native-ai/core-ai'
import { describe, expect, it } from 'react-native-harness'

// The example app links the language, object-detection and segmentation tasks
// (see apps/expo-example/app.config.js)

describe('core-ai availability', () => {
  it('reports the linked products', async () => {
    const capabilities = (await CoreAI.getCapabilities()) as CoreAICapabilities

    expect(capabilities.isCoreAIRuntimeAvailable).toBe(true)
    expect(capabilities.isCoreAILMAvailable).toBe(true)
    expect(capabilities.isCoreAIObjectDetectionAvailable).toBe(true)
    expect(capabilities.isCoreAISegmentationAvailable).toBe(true)
    expect(capabilities.missingProducts).toEqual(['CoreAIDiffusion'])
  })

  it('rejects a task whose product is not linked', async () => {
    await expect(
      CoreAI.generateImage(
        { id: 'missing', sourceType: 'file', sourceUri: '/missing' },
        'a cat',
        {}
      )
    ).rejects.toMatchObject({ code: 'CORE_AI_MISSING_SPM_PRODUCT' })
  })
})
