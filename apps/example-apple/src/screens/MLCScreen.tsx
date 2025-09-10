import { mlc, MLCEngine } from '@react-native-ai/mlc'
import React, { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

export default function MLCScreen() {
  const [isLoading, setIsLoading] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [response, setResponse] = useState('')

  const runFullWorkflow = async () => {
    try {
      setIsLoading(true)
      setStatusText('Getting available models...')
      setResponse('')

      // Step 1: Get all models
      const models = await MLCEngine.getModels()
      console.log('Available models:', models)

      if (!models || models.length === 0) {
        Alert.alert('Error', 'No models available')
        return
      }

      // Step 2: Pick the first model
      const firstModel = models[0]
      const modelId = firstModel.model_id || 'Llama-3.2-3B-Instruct'
      console.log('Selected model:', modelId)
      setStatusText(`Selected model: ${modelId}`)

      // Step 3: Download the model with progress tracking
      setStatusText('Starting download...')

      const downloadPromise = MLCEngine.downloadModel(modelId)

      // Listen for download progress
      const progressListener = MLCEngine.onDownloadProgress((event) => {
        console.log('Download progress:', event)
        // Check if event has status (text-based) or percentage
        if ('status' in event) {
          setStatusText(`Download: ${event.status}`)
        } else if ('percentage' in event) {
          setStatusText(`Download: ${event.percentage.toFixed(1)}%`)
        }
      })

      await downloadPromise
      progressListener.remove()

      console.log('Download complete')
      setStatusText('Download complete')

      // Step 4: Prepare the model
      setStatusText('Preparing model...')
      await MLCEngine.prepareModel(modelId)
      console.log('Model prepared')
      setStatusText('Model ready')

      // Step 5: Generate text using the simple API
      setStatusText('Generating response...')
      const messages = [
        {
          role: 'user' as const,
          content: 'Hello! Who are you? Please introduce yourself briefly.',
        },
      ]

      const generatedText = await MLCEngine.generateText(modelId, messages)
      console.log('Generated text:', generatedText)

      setResponse(generatedText)
      setStatusText('Complete!')
    } catch (error) {
      console.error('Workflow error:', error)
      Alert.alert('Error', `Failed: ${error}`)
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
          <View className="bg-white p-4 rounded-lg border border-gray-200">
            <Text className="text-sm font-semibold mb-2">Response:</Text>
            <Text className="text-sm text-gray-800">{response}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  )
}
