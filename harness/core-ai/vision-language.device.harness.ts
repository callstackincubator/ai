import { generateText, streamText } from 'ai'
import { beforeAll, describe, expect, it } from 'react-native-harness'

import { base64ToBytes, cats } from '../fixtures'
import {
  setupLanguageModel,
  VISION_LANGUAGE_MODEL,
  writeCatsImage,
} from './helpers'

const model = setupLanguageModel(VISION_LANGUAGE_MODEL)

// The 320x240 fixture has two cats lying on a pink blanket
let imageUri: string

beforeAll(async () => {
  imageUri = await writeCatsImage()
})

const ask = (image: Uint8Array | URL | string, text: string) => ({
  model: model(),
  maxOutputTokens: 64,
  messages: [
    {
      role: 'user' as const,
      content: [
        { type: 'image' as const, image, mediaType: 'image/jpeg' },
        { type: 'text' as const, text },
      ],
    },
  ],
})

describe('core-ai vision language model', () => {
  it('answers about an image file', async () => {
    const result = await generateText(
      ask(new URL(`file://${imageUri}`), 'What animals are in this picture?')
    )

    expect(result.text).toMatch(/cat/i)
    expect(result.usage.inputTokens).toBeGreaterThan(0)
    expect(result.usage.outputTokens).toBeGreaterThan(0)
  })

  it('answers about base64 image data', async () => {
    const result = await generateText(
      ask(
        base64ToBytes(cats),
        'How many cats are in this picture? Answer with one word.'
      )
    )

    expect(result.text).toMatch(/two|2/i)
  })

  it('streams the answer', async () => {
    let streamError: unknown
    const result = streamText({
      ...ask(
        `data:image/jpeg;base64,${cats}`,
        'Describe this picture in one sentence.'
      ),
      onError: ({ error }) => {
        streamError = error
      },
    })

    const chunks: string[] = []
    for await (const chunk of result.textStream) {
      chunks.push(chunk)
    }

    if (streamError) throw new Error(String(streamError))
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join('')).toMatch(/cat/i)
  })
})
