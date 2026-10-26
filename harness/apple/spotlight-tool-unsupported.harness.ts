import { apple } from '@react-native-ai/apple'
import { describe, expect, it } from 'react-native-harness'

import { prompt } from './helpers'

describe('apple spotlight tool when unsupported', () => {
  // Simulators can create the tool but lack the model assets it runs on
  it('rejects as unsupported where getModelInfo reports no support', async () => {
    if ((await apple.getModelInfo()).supportsSpotlightTool) {
      return
    }

    await expect(
      apple().doGenerate({
        prompt: prompt('Search my notes for groceries.'),
        providerOptions: { apple: { builtInTools: ['spotlight'] } },
      })
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_OS' })
  })
})
