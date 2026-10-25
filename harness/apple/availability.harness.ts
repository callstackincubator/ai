import { apple, AppleUtils } from '@react-native-ai/apple'
import { describe, expect, it } from 'react-native-harness'

const availabilities = [
  'available',
  'deviceNotEligible',
  'appleIntelligenceNotEnabled',
  'modelNotReady',
  'systemNotReady',
  'unknown',
]

describe('apple availability', () => {
  it('is available', () => {
    expect(apple.isAvailable()).toBe(true)
  })

  it('describes the on-device model', async () => {
    const info = await apple.getModelInfo()

    expect(info).toMatchObject({
      model: 'system',
      availability: 'available',
      supportsLocale: true,
      supportsTokenCounting: true,
      supportsImagePrompts: true,
    })
    expect(info.contextSize).toBeGreaterThan(0)
    expect(info.supportedLanguages).toContain('en-US')
  })

  it('checks support for a locale', async () => {
    expect((await apple.getModelInfo({ locale: 'en-US' })).supportsLocale).toBe(
      true
    )
  })

  it('reports why private cloud compute is unavailable', async () => {
    const info = await apple.getModelInfo({ model: 'private-cloud-compute' })

    expect(info.model).toBe('private-cloud-compute')
    expect(availabilities).toContain(info.availability)
    if (info.availability !== 'available') {
      expect(info.contextSize).toBeUndefined()
      expect(info.supportsLocale).toBe(false)
      expect(info.supportedLanguages).toEqual([])
    }
  })

  it('reads the current locale', () => {
    expect(AppleUtils.getCurrentLocale()).toMatch(
      /^[a-z]{2,3}([-_][A-Za-z]+)*$/
    )
  })
})
