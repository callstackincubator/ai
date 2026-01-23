import {
  downloadModel,
  getDownloadedModels,
  getModelPath,
  llama,
  type LlamaSpeechModel,
  removeModel,
} from '@react-native-ai/llama'
import { Picker } from '@react-native-picker/picker'
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native'

import type { SpeechModelOption } from '../config/models'

interface SpeechProviderSetupProps {
  models: SpeechModelOption[]
  onReady: (model: LlamaSpeechModel) => void
  onBack?: () => void
}

const getFilename = (modelId: string) => modelId.split('/').pop() ?? modelId

export default function SpeechProviderSetup({
  models,
  onReady,
  onBack,
}: SpeechProviderSetupProps) {
  const [selectedModel, setSelectedModel] = useState<SpeechModelOption>(
    models[0]
  )
  const [downloadedModels, setDownloadedModels] = useState<Set<string>>(
    new Set()
  )
  const [isLoading, setIsLoading] = useState(true)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [downloadingItem, setDownloadingItem] = useState<
    'model' | 'vocoder' | null
  >(null)
  const [isInitializing, setIsInitializing] = useState(false)

  const modelId = selectedModel.modelId
  const vocoderId = selectedModel.vocoderId
  const modelFilename = getFilename(modelId)
  const vocoderFilename = getFilename(vocoderId)
  const isModelDownloaded = downloadedModels.has(modelFilename)
  const isVocoderDownloaded = downloadedModels.has(vocoderFilename)
  const isReady = isModelDownloaded && isVocoderDownloaded

  useEffect(() => {
    getDownloadedModels().then((contextModels) => {
      const downloadedFilenames = new Set<string>(
        contextModels.map((m) => m.filename)
      )
      setDownloadedModels(downloadedFilenames)

      const firstReadyModel = models.find(
        (m) =>
          downloadedFilenames.has(getFilename(m.modelId)) &&
          downloadedFilenames.has(getFilename(m.vocoderId))
      )

      if (firstReadyModel) {
        setSelectedModel(firstReadyModel)
      }

      setIsLoading(false)
    })
  }, [models])

  const downloadModelFile = async () => {
    setIsDownloading(true)
    setDownloadProgress(0)
    setDownloadingItem('model')

    try {
      await downloadModel(modelId, (progress) => {
        setDownloadProgress(progress.percentage)
      })

      setDownloadedModels((prev) => {
        const next = new Set(prev)
        next.add(modelFilename)
        return next
      })
    } catch (error) {
      console.error('Model download failed:', error)
      alert('Model download failed. Please try again.')
    } finally {
      setIsDownloading(false)
      setDownloadingItem(null)
    }
  }

  const downloadVocoderFile = async () => {
    setIsDownloading(true)
    setDownloadProgress(0)
    setDownloadingItem('vocoder')

    try {
      await downloadModel(vocoderId, (progress) => {
        setDownloadProgress(progress.percentage)
      })

      setDownloadedModels((prev) => {
        const next = new Set(prev)
        next.add(vocoderFilename)
        return next
      })
    } catch (error) {
      console.error('Vocoder download failed:', error)
      alert('Vocoder download failed. Please try again.')
    } finally {
      setIsDownloading(false)
      setDownloadingItem(null)
    }
  }

  const initializeModel = async () => {
    setIsInitializing(true)
    try {
      const modelPath = getModelPath(modelId)
      const vocoderPath = getModelPath(vocoderId)

      const model = llama.speechModel(modelPath, {
        vocoderPath,
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

  const deleteModelFile = async () => {
    try {
      await removeModel(modelId)

      setDownloadedModels((prev) => {
        const next = new Set(prev)
        next.delete(modelFilename)
        return next
      })
    } catch (error) {
      console.error('Model delete failed:', error)
      alert(
        `Failed to delete model: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  const deleteVocoderFile = async () => {
    try {
      await removeModel(vocoderId)

      setDownloadedModels((prev) => {
        const next = new Set(prev)
        next.delete(vocoderFilename)
        return next
      })
    } catch (error) {
      console.error('Vocoder delete failed:', error)
      alert(
        `Failed to delete vocoder: ${error instanceof Error ? error.message : 'Unknown error'}`
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
            <Text className="text-lg font-semibold">Llama Speech Setup</Text>
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
              const isModelDL = downloadedModels.has(getFilename(model.modelId))
              const isVocoderDL = downloadedModels.has(
                getFilename(model.vocoderId)
              )
              const status =
                isModelDL && isVocoderDL
                  ? '✓ '
                  : isModelDL
                    ? '⚠️ '
                    : isVocoderDL
                      ? '⚠️ '
                      : ''
              return (
                <Picker.Item
                  key={model.modelId}
                  label={`${status}${model.name} - ${model.size}`}
                  value={model.modelId}
                />
              )
            })}
          </Picker>
        </View>

        {/* Model Download */}
        {!isModelDownloaded && !isDownloading && (
          <TouchableOpacity
            className="bg-blue-500 rounded-lg py-3 mt-3"
            onPress={downloadModelFile}
          >
            <Text className="text-white text-center font-semibold">
              Download Model ({modelFilename})
            </Text>
          </TouchableOpacity>
        )}

        {/* Vocoder Download */}
        {isModelDownloaded && !isVocoderDownloaded && !isDownloading && (
          <TouchableOpacity
            className="bg-blue-500 rounded-lg py-3 mt-3"
            onPress={downloadVocoderFile}
          >
            <Text className="text-white text-center font-semibold">
              Download Vocoder ({vocoderFilename})
            </Text>
          </TouchableOpacity>
        )}

        {isDownloading && (
          <View className="mt-3">
            <View className="flex-row justify-between mb-1">
              <Text className="text-sm text-gray-600">
                Downloading {downloadingItem}...
              </Text>
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

        {isReady && !isInitializing && (
          <View className="mt-3">
            <TouchableOpacity
              className="bg-green-500 rounded-lg py-3 mb-2"
              onPress={initializeModel}
            >
              <Text className="text-white text-center font-semibold">
                Initialize Speech Model
              </Text>
            </TouchableOpacity>
            <View className="flex-row gap-2">
              <TouchableOpacity
                className="flex-1 bg-red-500 rounded-lg py-3"
                onPress={deleteModelFile}
                disabled={!isModelDownloaded}
              >
                <Text className="text-white text-center font-semibold">
                  Delete Model
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 bg-red-500 rounded-lg py-3"
                onPress={deleteVocoderFile}
                disabled={!isVocoderDownloaded}
              >
                <Text className="text-white text-center font-semibold">
                  Delete Vocoder
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {isInitializing && (
          <View className="mt-3 flex-row items-center justify-center py-3">
            <ActivityIndicator size="small" color="#22C55E" />
            <Text className="ml-2 text-gray-600">
              Initializing speech model...
            </Text>
          </View>
        )}
      </View>

      <View className="flex-1 items-center justify-center p-4">
        <Text className="text-gray-400 text-center">
          {!isModelDownloaded
            ? 'Download the model to get started'
            : !isVocoderDownloaded
              ? 'Download the vocoder to continue'
              : 'Initialize the model to begin speech synthesis'}
        </Text>
      </View>
    </View>
  )
}
