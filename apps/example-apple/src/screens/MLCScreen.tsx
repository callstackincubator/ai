import { mlc, MLCEngine } from '@react-native-ai/mlc'
import { generateObject, generateText, streamText } from 'ai'
import React, { useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { z } from 'zod'

const identificationSchema = z.object({
  name: z.string().describe('The name or identity of the AI assistant'),
  description: z
    .string()
    .describe(
      "A brief description of the AI assistant's capabilities and purpose"
    ),
})

export default function MLCScreen() {
  const [isLoading, setIsLoading] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [response, setResponse] = useState('')
  const [structuredResponse, setStructuredResponse] = useState<z.infer<
    typeof identificationSchema
  > | null>(null)

  const setupModel = async () => {
    // Step 1: Get available models
    setStatusText('Getting available models...')
    const models = await MLCEngine.getModels()
    const modelId = models[0]!.model_id!
    setStatusText(`Selected model: ${modelId}`)

    // Step 2: Create and prepare model
    const model = mlc.languageModel(modelId)
    await model.download((event) => {
      setStatusText(`Downloading model: ${event.status}`)
    })
    setStatusText('Preparing model...')
    await model.prepare()
    setStatusText('Model ready')

    return model
  }

  const runGenerateText = async () => {
    try {
      setIsLoading(true)
      setResponse('')

      const model = await setupModel()

      // Generate text using AI SDK
      setStatusText('Generating response...')

      const result = await generateText({
        model,
        prompt: 'Hello! Who are you? Please introduce yourself briefly.',
      })

      setResponse(result.text)
      setStatusText('Complete!')
    } catch (error) {
      setStatusText(`Error: ${error}`)
    } finally {
      setIsLoading(false)
    }
  }

  const runStreamText = async () => {
    try {
      setIsLoading(true)
      setResponse('')

      const model = await setupModel()

      // Stream text using AI SDK
      setStatusText('Streaming response...')

      const result = await streamText({
        model,
        prompt: 'Hello! Who are you? Please introduce yourself.',
      })

      for await (const textPart of result.textStream) {
        setResponse((prev) => prev + textPart)
      }

      setStatusText('Streaming complete!')
    } catch (error) {
      setStatusText(`Error: ${error}`)
    } finally {
      setIsLoading(false)
    }
  }

  const runStructuredOutput = async () => {
    try {
      setIsLoading(true)
      setStructuredResponse(null)

      const model = await setupModel()

      // Generate structured output
      setStatusText('Generating structured response...')

      const result = await generateObject({
        model,
        schema: identificationSchema,
        prompt:
          'Who are you? Please identify yourself and describe your capabilities.',
      })

      setStructuredResponse(result.object)
      setStatusText('Structured output complete!')
    } catch (error) {
      setStatusText(`Error: ${error}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <View className="p-5">
        <Text className="text-2xl font-bold mb-6 text-center">
          MLC Engine Demo
        </Text>

        <View className="mb-6">
          <TouchableOpacity
            className={`bg-blue-500 px-6 py-4 rounded-lg mb-3 ${
              isLoading ? 'opacity-50' : ''
            }`}
            onPress={runGenerateText}
            disabled={isLoading}
          >
            <Text className="text-white font-semibold text-center">
              Generate Text
            </Text>
            <Text className="text-white text-xs text-center mt-1">
              Get models → Download → Prepare → Generate
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className={`bg-purple-500 px-6 py-4 rounded-lg mb-3 ${
              isLoading ? 'opacity-50' : ''
            }`}
            onPress={runStreamText}
            disabled={isLoading}
          >
            <Text className="text-white font-semibold text-center">
              Stream Text
            </Text>
            <Text className="text-white text-xs text-center mt-1">
              Same as above, but streaming incrementally
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className={`bg-green-500 px-6 py-4 rounded-lg mb-3 ${
              isLoading ? 'opacity-50' : ''
            }`}
            onPress={runStructuredOutput}
            disabled={isLoading}
          >
            <Text className="text-white font-semibold text-center">
              Generate Structured Output
            </Text>
            <Text className="text-white text-xs text-center mt-1">
              AI identifies itself with name & description
            </Text>
          </TouchableOpacity>
        </View>

        {isLoading && (
          <View className="items-center mb-4">
            <ActivityIndicator size="large" color="#3B82F6" />
          </View>
        )}

        {statusText !== '' && (
          <View className="bg-gray-100 p-4 rounded-lg mb-4">
            <Text className="text-sm font-semibold mb-1">Status:</Text>
            <Text className="text-sm text-gray-700">{statusText}</Text>
          </View>
        )}

        {response !== '' && (
          <View className="bg-white p-4 rounded-lg border border-gray-200 mb-4">
            <Text className="text-sm font-semibold mb-2">
              Generated Response:
            </Text>
            <Text className="text-sm text-gray-800">{response}</Text>
          </View>
        )}

        {structuredResponse && (
          <View className="bg-green-50 p-4 rounded-lg border border-green-200">
            <Text className="text-sm font-semibold mb-2">
              Structured Response:
            </Text>
            <View className="mb-2">
              <Text className="text-xs font-semibold text-gray-600">Name:</Text>
              <Text className="text-sm text-gray-800">
                {structuredResponse.name}
              </Text>
            </View>
            <View>
              <Text className="text-xs font-semibold text-gray-600">
                Description:
              </Text>
              <Text className="text-sm text-gray-800">
                {structuredResponse.description}
              </Text>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  )
}
