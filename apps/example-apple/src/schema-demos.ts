import { createAppleProvider } from '@react-native-ai/apple'
import NativeAppleEmbeddings from '@react-native-ai/apple/src/NativeAppleEmbeddings'
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

  return response.values[bestIndex]
}

// Embedding performance benchmark by token length
export async function embeddingBenchmark() {
  console.log('🚀 Starting Embedding Performance Benchmark')
  console.log('='.repeat(50))

  // Test datasets of varying token lengths (1-15, 16-50, 51-256 tokens)
  const testSets = {
    short: [
      'Search results',
      'Welcome back',
      'Error loading data',
      'John Smith profile',
      'Upload complete successfully',
    ],
    medium: [
      'This React Native app provides seamless cross-platform mobile development with native performance and shared codebase efficiency.',
      'Machine learning models running locally on iOS devices ensure user privacy while delivering intelligent features without internet connectivity.',
      'Apple Intelligence framework enables developers to integrate sophisticated AI capabilities directly into their applications with minimal configuration required.',
      'Modern mobile development emphasizes user experience through intuitive interfaces, responsive design, and accessibility features for all users.',
      'On-device processing eliminates latency issues and privacy concerns while providing instant responses for time-sensitive applications and workflows.',
    ],
    long: [
      "The transformation of mobile app development through React Native has revolutionized how developers approach cross-platform solutions, enabling teams to write code once and deploy across iOS and Android platforms while maintaining near-native performance. This approach significantly reduces development time, maintenance overhead, and resource allocation, allowing companies to reach broader audiences more efficiently. The framework's component-based architecture promotes code reusability and modular design patterns that enhance scalability and maintainability over time.",
      "Apple Intelligence represents a paradigm shift in on-device artificial intelligence, bringing sophisticated machine learning capabilities directly to iOS devices without compromising user privacy or requiring constant internet connectivity. The framework encompasses natural language processing, computer vision, speech recognition, and predictive analytics, all optimized for Apple's Neural Engine hardware. This integration allows developers to create intelligent applications that understand context, anticipate user needs, and provide personalized experiences while maintaining the highest standards of data protection and security.",
      'Modern embedding models have transformed how applications understand and process natural language, enabling semantic search, content recommendation, and intelligent categorization at unprecedented scale and accuracy. These transformer-based architectures, when optimized for mobile deployment, can process text in real-time while consuming minimal device resources. The implementation of vector similarity search allows applications to find contextually relevant content, detect duplicate information, and provide intelligent suggestions based on user behavior patterns and content relationships.',
      'The evolution of mobile hardware architecture, particularly the introduction of dedicated neural processing units and specialized AI accelerators, has made sophisticated machine learning inference possible directly on smartphones and tablets. These hardware optimizations, combined with advanced model compression techniques and quantization strategies, enable complex AI workloads to run efficiently on battery-powered devices. This shift toward edge computing reduces dependence on cloud services, improves response times, and ensures functionality even in offline scenarios.',
      'Privacy-preserving machine learning has become increasingly important as users demand greater control over their personal data while still expecting intelligent, personalized experiences from their applications. Techniques such as federated learning, differential privacy, and on-device training allow AI systems to learn from user behavior without exposing sensitive information to external servers. This approach builds user trust while enabling developers to create adaptive applications that improve over time through local learning and optimization strategies.',
    ],
  }

  console.log('🔥 Prepare model...')
  await NativeAppleEmbeddings.prepare('en')

  const results: any = {}

  // Test each token length category
  for (const [setName, texts] of Object.entries(testSets)) {
    const avgTokenLength = Math.round(
      texts.join(' ').split(' ').length / texts.length
    )
    console.log(
      `\n📊 Testing ${setName} texts (avg ${avgTokenLength} tokens per text)`
    )

    const runs = 5
    const timings: number[] = []

    for (let run = 1; run <= runs; run++) {
      const startTime = performance.now()
      await NativeAppleEmbeddings.generateEmbeddings(texts, 'en')
      const endTime = performance.now()

      const duration = endTime - startTime
      timings.push(duration)

      console.log(`   Run ${run}/${runs}: ${duration.toFixed(2)}ms`)
    }

    const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length
    const avgTimePerItem = avgTime / texts.length

    results[setName] = avgTimePerItem

    console.log(
      `   ✅ Processing time: ${avgTimePerItem.toFixed(2)}ms per item`
    )
  }

  // Calculate overall average
  const allProcessingTimes = Object.values(results).map(
    (r: any) => r.avgTimePerItem
  )
  const overallAverage =
    allProcessingTimes.reduce((a, b) => a + b, 0) / allProcessingTimes.length

  console.log(`\n📈 Performance Summary:`)
  console.log('='.repeat(50))

  for (const [setName, data] of Object.entries(results)) {
    console.log(`${setName.toUpperCase()}: ${Number(data).toFixed(2)}ms`)
  }

  console.log(`\nOVERALL AVERAGE: ${overallAverage.toFixed(2)}ms per item`)

  return {
    results,
    overallAverage,
  }
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
  embeddingBenchmark: { name: 'Embedding Benchmark', func: embeddingBenchmark },
}

export type DemoKey = keyof typeof schemaDemos
