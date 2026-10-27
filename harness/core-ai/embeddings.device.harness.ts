import { cosineSimilarity, embed, embedMany } from 'ai'
import { beforeAll, describe, expect, it } from 'react-native-harness'

import { setupEmbeddingModel, writeCatsImage } from './helpers'

const model = setupEmbeddingModel()

let imageUri: string

beforeAll(async () => {
  imageUri = await writeCatsImage()
})

const norm = (vector: number[]) =>
  Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))

describe('core-ai text embeddings', () => {
  it('embeds text as unit vectors', async () => {
    const { embedding } = await embed({ model, value: 'a photo of a cat' })

    expect(embedding).toHaveLength(512)
    expect(norm(embedding)).toBeCloseTo(1, 2)
  })

  it('embeds similar text closer together', async () => {
    const { embeddings } = await embedMany({
      model,
      values: ['a photo of a cat', 'a picture of a kitten', 'a red sports car'],
    })

    expect(cosineSimilarity(embeddings[0], embeddings[1])).toBeGreaterThan(
      cosineSimilarity(embeddings[0], embeddings[2])
    )
  })

  it('embeds the same in batches as alone', async () => {
    // 20 values are two model calls of up to 16
    const values = Array.from({ length: 20 }, (_, i) => `photo number ${i}`)
    const { embeddings } = await embedMany({ model, values })
    const { embedding } = await embed({ model, value: values[17] })

    expect(embeddings).toHaveLength(20)
    expect(cosineSimilarity(embeddings[17], embedding)).toBeGreaterThan(0.999)
  })
})

describe('core-ai image embeddings', () => {
  it('embeds images into the space of text', async () => {
    const {
      embeddings: [image],
    } = await model.embedImages([imageUri])
    const { embeddings } = await embedMany({
      model,
      values: ['a photo of two cats', 'a bowl of soup', 'a photo of a car'],
    })

    expect(image).toHaveLength(512)
    expect(norm(image)).toBeCloseTo(1, 2)
    const [cats, soup, car] = embeddings.map((text) =>
      cosineSimilarity(text, image)
    )
    expect(cats).toBeGreaterThan(soup)
    expect(cats).toBeGreaterThan(car)
  })

  it('embeds several images at once', async () => {
    const { embeddings } = await model.embedImages([imageUri, imageUri])

    expect(embeddings).toHaveLength(2)
    expect(cosineSimilarity(embeddings[0], embeddings[1])).toBeGreaterThan(
      0.999
    )
  })
})
