import {
  downloadModel,
  getDownloadedModels,
  getModelPath,
  llama,
  type LlamaLanguageModel,
  removeModel,
} from '@react-native-ai/llama'
import { Picker } from '@react-native-picker/picker'
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native'

import type { ModelOption } from '../config/models'

interface ProviderSetupProps {
  models: ModelOption[]
  onReady: (model: LlamaLanguageModel) => void
  onBack?: () => void
}

const getFilenameFromModelId = (modelId: string) => {
  const parts = modelId.split('/')
  return parts[parts.length - 1]
}

export default function ProviderSetup({
  models,
  onReady,
  onBack,
}: ProviderSetupProps) {
  const [selectedModel, setSelectedModel] = useState<ModelOption>(models[0])
  const [downloadedModels, setDownloadedModels] = useState<Set<string>>(
    new Set()
  )
  const [isLoading, setIsLoading] = useState(true)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [isInitializing, setIsInitializing] = useState(false)

  const isModelReady = downloadedModels.has(
    getFilenameFromModelId(selectedModel.modelId)
  )

  useEffect(() => {
    getDownloadedModels().then((contextModels) => {
      const downloadedFilenames = new Set<string>(
        contextModels.map((m) => m.filename)
      )
      setDownloadedModels(downloadedFilenames)

      const firstDownloadedModel = models.find((m) =>
        downloadedFilenames.has(getFilenameFromModelId(m.modelId))
      )

      if (firstDownloadedModel) {
        setSelectedModel(firstDownloadedModel)
      }

      setIsLoading(false)
    })
  }, [models])

  const handleDownloadModel = async () => {
    setIsDownloading(true)
    setDownloadProgress(0)

    try {
      await downloadModel(selectedModel.modelId, (progress) => {
        setDownloadProgress(progress.percentage)
      })

      setDownloadedModels((prev) => {
        const next = new Set(prev)
        next.add(getFilenameFromModelId(selectedModel.modelId))
        return next
      })
    } catch (error) {
      console.error('Download failed:', error)
      alert('Download failed. Please try again.')
    } finally {
      setIsDownloading(false)
    }
  }

  const initializeModel = async () => {
    setIsInitializing(true)
    try {
      const modelPath = getModelPath(selectedModel.modelId)
      const model = llama.languageModel(modelPath, {
        contextParams: {
          n_ctx: 2048,
          n_gpu_layers: 99,
        },
      })
      await model.prepare()
      onReady(model)
    } catch (error) {
      console.error('Model initialization failed:', error)
      alert(
        `Failed to initialize model: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    } finally {
      setIsInitializing(false)
    }
  }

  const handleDeleteModel = async () => {
    try {
      await removeModel(selectedModel.modelId)

      setDownloadedModels((prev) => {
        const next = new Set(prev)
        next.delete(getFilenameFromModelId(selectedModel.modelId))
        return next
      })
    } catch (error) {
      console.error('Delete failed:', error)
      alert(
        `Failed to delete model: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text className="mt-4 text-gray-600">Loading models...</Text>
      </View>
    )
  }

  return (
    <View className="flex-1">
      <View className="bg-white border-b border-gray-200 p-4">
        {onBack && (
          <View className="flex-row items-center justify-between mb-4">
            <TouchableOpacity
              onPress={onBack}
              className="bg-gray-100 px-4 py-2 rounded-lg"
            >
              <Text className="text-gray-700">← Back</Text>
            </TouchableOpacity>
            <Text className="text-lg font-semibold">Llama Setup</Text>
            <View style={{ width: 80 }} />
          </View>
        )}

        <Text className="text-sm font-semibold text-gray-700 mb-2">
          Select Model
        </Text>
        <View className="border border-gray-300 rounded-lg overflow-hidden">
          <Picker
            selectedValue={selectedModel.modelId}
            onValueChange={(itemValue) => {
              const model = models.find((m) => m.modelId === itemValue)
              if (model) setSelectedModel(model)
            }}
            enabled={!isDownloading && !isInitializing}
          >
            {models.map((model) => {
              const isDownloaded = downloadedModels.has(
                getFilenameFromModelId(model.modelId)
              )
              return (
                <Picker.Item
                  key={model.modelId}
                  label={`${isDownloaded ? '✓ ' : ''}${model.name} - ${model.size}`}
                  value={model.modelId}
                />
              )
            })}
          </Picker>
        </View>

        {!isModelReady && !isDownloading && (
          <TouchableOpacity
            className="bg-blue-500 rounded-lg py-3 mt-3"
            onPress={handleDownloadModel}
          >
            <Text className="text-white text-center font-semibold">
              Download Model
            </Text>
          </TouchableOpacity>
        )}

        {isDownloading && (
          <View className="mt-3">
            <View className="flex-row justify-between mb-1">
              <Text className="text-sm text-gray-600">Downloading...</Text>
              <Text className="text-sm text-gray-600">{downloadProgress}%</Text>
            </View>
            <View className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <View
                className="h-full bg-blue-500"
                style={{ width: `${downloadProgress}%` }}
              />
            </View>
          </View>
        )}

        {isModelReady && !isInitializing && (
          <View className="flex-row mt-3 gap-2">
            <TouchableOpacity
              className="flex-1 bg-green-500 rounded-lg py-3"
              onPress={initializeModel}
            >
              <Text className="text-white text-center font-semibold">
                Initialize Model
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="bg-red-500 rounded-lg py-3 px-4"
              onPress={handleDeleteModel}
            >
              <Text className="text-white text-center font-semibold">
                Delete
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {isInitializing && (
          <View className="mt-3 flex-row items-center justify-center py-3">
            <ActivityIndicator size="small" color="#22C55E" />
            <Text className="ml-2 text-gray-600">Initializing model...</Text>
          </View>
        )}
      </View>

      <View className="flex-1 items-center justify-center p-4">
        <Text className="text-gray-400 text-center">
          {!isModelReady
            ? 'Download a model to get started'
            : 'Initialize the model to begin chatting'}
        </Text>
      </View>
    </View>
  )
}
