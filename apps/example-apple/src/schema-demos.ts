import { createAppleProvider } from '@react-native-ai/apple'
import {
  experimental_generateSpeech,
  experimental_transcribe,
  generateObject,
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

export async function basicTranscribeDemo() {
  const file = await fetch(
    'https://www.voiptroubleshooter.com/open_speech/american/OSR_us_000_0010_8k.wav'
  )
  const audio = await file.arrayBuffer()
  const response = await experimental_transcribe({
    model: apple.transcriptionModel(),
    audio,
  })
  return response.text
}

export async function basicSpeechDemo() {
  const response = await experimental_generateSpeech({
    model: apple.speechModel(),
    text: 'What is the weather in Wroclaw?',
  })
  console.log(typeof response.audio)
  return 'ok'
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
  basicTranscribe: { name: 'Transcribe', func: basicTranscribeDemo },
  basicSpeech: { name: 'Speech', func: basicSpeechDemo },
}

export type DemoKey = keyof typeof schemaDemos
