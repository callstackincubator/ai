import { createAppleProvider } from '@react-native-ai/apple'
import {
  cosineSimilarity,
  embed,
  embedMany,
  generateObject,
  generateText,
  streamText,
  tool,
} from 'ai'
import { z } from 'zod'

const getWeather = tool({
  description: 'Retrieve the weather for a given city',
  inputSchema: z.object({
    city: z.string().describe('The city to get the weather for'),
  }),
  execute: async ({ city }) => {
    console.log('Executing tool for city:', city)
    const temperature = Math.floor(Math.random() * 20) + 10
    return `Weather forecast for ${city}: ${temperature}°C`
  },
})

export const apple = createAppleProvider({
  availableTools: {
    getWeather,
  },
})

export async function basicStringDemo() {
  const response = streamText({
    model: apple(),
    system: `Help the person with getting weather information. Use tools to get the weather.`,
    prompt: 'What is the weather in Wroclaw?',
    tools: {
      getWeather,
    },
  })
  for await (const chunk of response.textStream) {
    console.log(chunk)
  }
  return response.text
}

export async function basicStringStreamingDemo() {
  const response = streamText({
    model: apple(),
    prompt: 'Write me short essay on the meaning of life',
  })
  for await (const chunk of response.textStream) {
    console.log(chunk)
  }
  return response.text
}

export async function colorEnumDemo() {
  const response = await generateObject({
    model: apple(),
    prompt: 'What color is the grass?',
    schema: z
      .object({
        color: z.enum(['red', 'blue', 'green']).describe('Pick a color'),
      })
      .describe('Color response'),
  })
  return response.object
}

export async function basicNumberDemo() {
  const response = await generateObject({
    model: apple(),
    system: 'There are 3 people in the room.',
    prompt: 'How many people are in the room?',
    schema: z
      .object({
        value: z.number().min(1).max(10).describe('A number between 1 and 10'),
      })
      .describe('Number response'),
  })
  return response.object
}

export async function basicBooleanDemo() {
  const response = await generateObject({
    model: apple(),
    prompt: 'Is the sky blue?',
    schema: z
      .object({
        answer: z.boolean(),
      })
      .describe('Boolean response'),
  })
  return response.object
}

export async function basicObjectDemo() {
  const response = await generateObject({
    model: apple(),
    prompt: 'Create a simple person',
    schema: z
      .object({
        name: z.string().describe('Person name'),
        age: z.number().int().min(1).max(100).describe('Age'),
        active: z.boolean().describe('Is active'),
      })
      .describe('Basic person info'),
  })
  return response.object
}

export async function basicArrayDemo() {
  const response = await generateObject({
    model: apple(),
    prompt: 'Random list of fruits',
    topK: 50,
    temperature: 1,
    schema: z
      .object({
        items: z.array(z.string()).min(2).max(3).describe('List of items'),
      })
      .describe('Array response'),
  })
  return response.object
}

export async function basicEmbeddingDemo() {
  const response = await embedMany({
    model: apple.textEmbeddingModel(),
    values: [
      'React Native allows developers to build mobile apps using JavaScript and React.',
      'MiniLM is a small, efficient transformer model used for sentence embeddings and semantic search.',
      'NLContextualEmbedding is a lightweight Apple API that provides on-device contextual word embeddings.',
      'Swift is a general-purpose programming language developed by Apple for iOS, macOS, and beyond.',
      'Vector similarity search helps retrieve semantically relevant documents based on embeddings.',
      'Expo simplifies React Native development by offering tooling and services for building and deploying apps.',
      'CoreML lets you integrate machine learning models into your iOS app for fast on-device inference.',
      'On-device AI enables privacy-preserving applications without relying on cloud servers.',
      'Sentence transformers generate fixed-length embeddings for variable-length input text.',
      'FAISS is a library developed by Facebook for efficient similarity search and clustering of dense vectors.',
    ],
  })

  const question = await embed({
    model: apple.textEmbeddingModel(),
    value:
      'How do I run machine learning models directly on iOS without cloud?',
  })

  let bestScore = -Infinity
  let bestIndex = -1

  for (let i = 0; i < response.embeddings.length; i++) {
    const score = cosineSimilarity(question.embedding, response.embeddings[i])
    if (score > bestScore) {
      bestScore = score
      bestIndex = i
    }
  }

  console.log('Best match index:', bestIndex)
  console.log('Best similarity score:', bestScore)
  console.log('Best match:', response.values[bestIndex])

  return response.embeddings
}

export const schemaDemos = {
  basicString: { name: 'String', func: basicStringDemo },
  basicStringStreaming: {
    name: 'String Streaming',
    func: basicStringStreamingDemo,
  },
  colorEnum: { name: 'Enum', func: colorEnumDemo },
  basicNumber: { name: 'Number', func: basicNumberDemo },
  basicBoolean: { name: 'Boolean', func: basicBooleanDemo },
  basicObject: { name: 'Object', func: basicObjectDemo },
  basicArray: { name: 'Array', func: basicArrayDemo },
  basicEmbedding: { name: 'Embedding', func: basicEmbeddingDemo },
}

export type DemoKey = keyof typeof schemaDemos
