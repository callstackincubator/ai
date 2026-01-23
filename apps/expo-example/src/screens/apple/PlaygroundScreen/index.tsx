import type { LanguageModelV3 } from '@ai-sdk/provider'
import { generateObject, generateText, streamText } from 'ai'
import React, { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { z } from 'zod'

import ProviderSelector from '../../../components/ProviderSelector'
import ProviderSetup from '../../../components/ProviderSetup'
import { languageAdapters, type SetupAdapter } from '../../../config/providers'

async function basicStringDemo(model: LanguageModelV3) {
  const response = await generateText({
    model,
    prompt: 'Who founded Apple?',
  })
  return response.text
}

async function basicStringStreamingDemo(model: LanguageModelV3) {
  const response = streamText({
    model,
    prompt: 'Write me short essay on the meaning of life',
  })
  let text = ''
  for await (const chunk of response.textStream) {
    text += chunk
  }
  return text
}

async function colorEnumDemo(model: LanguageModelV3) {
  const response = await generateObject({
    model,
    prompt: 'What color is the grass?',
    schema: z
      .object({
        color: z.enum(['red', 'blue', 'green']).describe('Pick a color'),
      })
      .describe('Color response'),
  })
  return response.object
}

async function basicNumberDemo(model: LanguageModelV3) {
  const response = await generateObject({
    model,
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

async function basicBooleanDemo(model: LanguageModelV3) {
  const response = await generateObject({
    model,
    prompt: 'Is the sky blue?',
    schema: z
      .object({
        answer: z.boolean(),
      })
      .describe('Boolean response'),
  })
  return response.object
}

async function basicObjectDemo(model: LanguageModelV3) {
  const response = await generateObject({
    model,
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

async function basicArrayDemo(model: LanguageModelV3) {
  const response = await generateObject({
    model,
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

const playgroundDemos = {
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
}

export default function PlaygroundScreen() {
  const [activeProvider, setActiveProvider] =
    useState<SetupAdapter<LanguageModelV3> | null>(null)
  const [isModelAvailable, setIsModelAvailable] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)

  const runDemo = async (key: string) => {
    if (loading) return

    if (!activeProvider || !isModelAvailable) return

    setLoading(key)

    try {
      const result = await playgroundDemos[key].func(activeProvider.model)
      Alert.alert('Success', JSON.stringify(result, null, 2))
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : String(error)
      )
    } finally {
      setLoading(null)
    }
  }

  const getBackgroundClass = (index: number, isLoading: boolean) => {
    if (isLoading) return 'bg-blue-100 border border-blue-300'

    const colors = [
      'bg-blue-500',
      'bg-green-500',
      'bg-purple-500',
      'bg-orange-500',
      'bg-red-500',
      'bg-indigo-500',
      'bg-pink-500',
    ] as const

    return colors[index % colors.length]
  }

  const providerOptions = languageAdapters.map((adapter) => ({
    label: adapter.label,
    value: adapter,
  }))

  const handleProviderChange = async (
    nextAdapter: SetupAdapter<LanguageModelV3>
  ) => {
    if (nextAdapter === activeProvider) return
    void activeProvider?.unload()
    setActiveProvider(nextAdapter)
    setIsModelAvailable(false)

    const availability = await nextAdapter.isAvailable()
    setIsModelAvailable(availability === 'yes')
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1">
      <ProviderSelector
        options={providerOptions}
        value={activeProvider}
        onProviderChange={handleProviderChange}
        disabled={loading !== null}
      />

      {activeProvider && !isModelAvailable && (
        <ProviderSetup
          adapter={activeProvider}
          onAvailable={() => setIsModelAvailable(true)}
        />
      )}

      {activeProvider && isModelAvailable && (
        <View className="p-4">
          <View className="flex-row flex-wrap justify-between">
            {Object.entries(playgroundDemos).map(([key, demo], index) => {
              const isLoading = loading === key
              const isDisabled = loading !== null && !isLoading
              const backgroundClass = getBackgroundClass(index, isLoading)

              return (
                <TouchableOpacity
                  key={key}
                  className={`w-[48%] aspect-square mb-4 rounded-lg justify-center items-center ${backgroundClass} ${
                    isDisabled ? 'opacity-50' : ''
                  }`}
                  onPress={() => runDemo(key)}
                  disabled={loading !== null}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#3b82f6" />
                  ) : (
                    <Text className="text-white font-bold">{demo.name}</Text>
                  )}
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      )}
    </ScrollView>
  )
}
