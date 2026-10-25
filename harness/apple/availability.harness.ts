import { apple, AppleUtils } from '@react-native-ai/apple'
import { describe, expect, it } from 'react-native-harness'

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

  // The example app does not have the Private Cloud Compute entitlement
  it('reports private cloud compute as missing its entitlement', async () => {
    const info = await apple.getModelInfo({ model: 'private-cloud-compute' })

    expect(info).toMatchObject({
      model: 'private-cloud-compute',
      availability: 'missingEntitlement',
      supportsLocale: false,
      supportedLanguages: [],
    })
    expect(info.contextSize).toBeUndefined()
  })

  it('rejects private cloud compute generation without its entitlement', async () => {
    await expect(
      apple('private-cloud-compute').doGenerate({
        prompt: [
          { role: 'user', content: [{ type: 'text', text: 'Say hi.' }] },
        ],
      })
    ).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' })
  })

  it('reads the current locale', () => {
    expect(AppleUtils.getCurrentLocale()).toMatch(
      /^[a-z]{2,3}([-_][A-Za-z]+)*$/
    )
  })
})
