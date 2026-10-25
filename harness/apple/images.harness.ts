import { apple } from '@react-native-ai/apple'
import { generateText } from 'ai'
import { File, Paths } from 'expo-file-system'
import { describe, expect, it } from 'react-native-harness'

import { base64ToBytes, redSquare } from '../fixtures'
import { answer, imagePrompt } from './helpers'

const colourQuestion = 'What colour is this image? Answer with one word.'

describe('apple images', () => {
  it('reads base64 image data', async () => {
    expect(
      await answer({ prompt: imagePrompt(colourQuestion, { data: redSquare }) })
    ).toEqual([expect.stringMatching(/red/i)])
  })

  it('reads image bytes', async () => {
    expect(
      await answer({
        prompt: imagePrompt(colourQuestion, {
          data: base64ToBytes(redSquare),
        }),
      })
    ).toEqual([expect.stringMatching(/red/i)])
  })

  it('reads a local file image without downloading it', async () => {
    const file = new File(Paths.cache, 'harness-red.png')
    file.write(base64ToBytes(redSquare))

    const result = await generateText({
      model: apple(),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: colourQuestion },
            { type: 'image', image: new URL(file.uri) },
          ],
        },
      ],
    })

    expect(result.text).toMatch(/red/i)
  })

  it('answers with images in earlier turns', async () => {
    const [first] = imagePrompt('What is this?', { data: redSquare })
    const [last] = imagePrompt(colourQuestion, { data: redSquare })

    expect(
      await answer({
        prompt: [
          first,
          { role: 'assistant', content: [{ type: 'text', text: 'A square.' }] },
          last,
        ],
      })
    ).toEqual([expect.stringMatching(/red/i)])
  })
})
