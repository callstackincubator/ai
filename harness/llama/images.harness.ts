import { generateText } from 'ai'
import { describe, expect, it } from 'react-native-harness'

import { base64ToBytes, redSquare } from '../fixtures'
import { setupLanguageModel } from './helpers'

const model = setupLanguageModel()

describe('llama media', () => {
  it('reads an image', async () => {
    const result = await generateText({
      model: model(),
      reasoning: 'none',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'What colour is this image? Answer with one word.',
            },
            {
              type: 'file',
              mediaType: 'image/png',
              data: base64ToBytes(redSquare),
            },
          ],
        },
      ],
    })

    expect(result.text).toMatch(/red/i)
  })

  it('rejects media types llama.rn cannot read', async () => {
    await expect(
      generateText({
        model: model(),
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Summarize this.' },
              {
                type: 'file',
                mediaType: 'application/pdf',
                data: base64ToBytes('JVBERi0='),
              },
            ],
          },
        ],
      })
    ).rejects.toThrow()
  })
})
