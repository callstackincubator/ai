import { apple } from '@react-native-ai/apple'
import { generateObject, generateText, streamText } from 'ai'
import React, { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { z } from 'zod'

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  status: {
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 32,
    color: '#6b7280',
  },
  grid: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    aspectRatio: 1,
    marginBottom: 16,
    borderRadius: 12,
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  loadingCard: {
    backgroundColor: '#dbeafe',
    borderWidth: 2,
    borderColor: '#93c5fd',
  },
  normalCard: {
    borderWidth: 2,
    borderColor: 'transparent',
  },
  disabledCard: {
    opacity: 0.5,
  },
  loadingContainer: {
    alignItems: 'center',
  },
  loadingText: {
    textAlign: 'center',
    color: '#2563eb',
    fontWeight: '600',
  },
  cardText: {
    textAlign: 'center',
    fontWeight: 'bold',
    color: 'white',
    fontSize: 16,
  },
  blue: { backgroundColor: '#3b82f6' },
  green: { backgroundColor: '#10b981' },
  purple: { backgroundColor: '#8b5cf6' },
  orange: { backgroundColor: '#f97316' },
  red: { backgroundColor: '#ef4444' },
  indigo: { backgroundColor: '#6366f1' },
  pink: { backgroundColor: '#ec4899' },
})

async function basicStringDemo() {
  const response = await generateText({
    model: apple(),
    prompt: 'Who founded Apple?',
  })
  return response.text
}

async function basicStringStreamingDemo() {
  const response = streamText({
    model: apple(),
    prompt: 'Write me short essay on the meaning of life',
  })
  for await (const chunk of response.textStream) {
    console.log(chunk)
  }
  return response.text
}

async function colorEnumDemo() {
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

async function basicNumberDemo() {
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

async function basicBooleanDemo() {
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

async function basicObjectDemo() {
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

async function basicArrayDemo() {
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
  const [loading, setLoading] = useState<string | null>(null)
  const isAvailable = apple.isAvailable()

  const runDemo = async (key: string) => {
    if (loading) return

    setLoading(key)

    try {
      const result = await playgroundDemos[key].func()
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

  const getBackgroundStyle = (index: number, isLoading: boolean) => {
    if (isLoading) return styles.loadingCard

    const colors = [
      'blue',
      'green',
      'purple',
      'orange',
      'red',
      'indigo',
      'pink',
    ] as const
    const colorKey = colors[index % colors.length]
    return [styles.normalCard, styles[colorKey]]
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic">
      <View style={styles.container}>
        <Text style={styles.status}>
          Apple Intelligence:{' '}
          {isAvailable ? '✅ Available' : '❌ Not Available'}
        </Text>

        <View style={styles.grid}>
          <View style={styles.row}>
            {Object.entries(playgroundDemos).map(([key, demo], index) => {
              const isLoading = loading === key
              const isDisabled = loading !== null && !isLoading
              const backgroundStyle = getBackgroundStyle(index, isLoading)

              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.card,
                    backgroundStyle,
                    isDisabled && styles.disabledCard,
                  ]}
                  onPress={() => runDemo(key)}
                  disabled={loading !== null}
                >
                  <View style={styles.cardContent}>
                    {isLoading ? (
                      <View style={styles.loadingContainer}>
                        <ActivityIndicator
                          size="large"
                          color="#3b82f6"
                          style={{ marginBottom: 8 }}
                        />
                        <Text style={styles.loadingText}>Generating...</Text>
                      </View>
                    ) : (
                      <View style={styles.loadingContainer}>
                        <Text style={styles.cardText}>{demo.name}</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      </View>
    </ScrollView>
  )
}
