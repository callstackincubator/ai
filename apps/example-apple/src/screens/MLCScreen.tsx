import { mlc, MLCEngine } from '@react-native-ai/mlc'
import { generateObject, generateText } from 'ai'
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

  const runFullWorkflow = async () => {
    try {
      setIsLoading(true)
      setStatusText('Getting available models...')
      setResponse('')

      // Step 1: Choose the model
      const models = await MLCEngine.getModels()

      // Step 2: Choose the model
      const modelId = models[0]!.model_id!

      setStatusText(`Selected model: ${modelId}`)

      // Step 3: Create MLC provider and download the model
      setStatusText('Starting download...')
      const model = mlc.languageModel(modelId)

      await model.download((event) => {
        setStatusText(`Download: ${event.status}`)
      })

      setStatusText('Download complete')

      // Step 4: Prepare the model
      setStatusText('Preparing model...')
      await model.prepare()
      setStatusText('Model ready')

      // Step 5: Generate text using AI SDK
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

  const runStructuredOutput = async () => {
    try {
      setIsLoading(true)
      setStatusText('Getting available models...')
      setStructuredResponse(null)

      // Step 1: Get models and select one
      const models = await MLCEngine.getModels()
      const modelId = models[0]!.model_id!
      setStatusText(`Selected model: ${modelId}`)

      // Step 2: Create model and ensure it's ready
      const model = mlc.languageModel(modelId)
      setStatusText('Preparing model...')
      await model.prepare()
      setStatusText('Model ready')

      // Step 3: Generate structured output
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
            onPress={runFullWorkflow}
            disabled={isLoading}
          >
            <Text className="text-white font-semibold text-center">
              Run Full Workflow
            </Text>
            <Text className="text-white text-xs text-center mt-1">
              Get models → Download → Prepare → Generate
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
            <Text className="text-sm font-semibold mb-2">Response:</Text>
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
