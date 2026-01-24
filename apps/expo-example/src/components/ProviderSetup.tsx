import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native'

import type { Availability, SetupAdapter } from '../config/providers'

interface ProviderSetupProps<TModel> {
  adapter: SetupAdapter<TModel>
  onAvailable: (model: TModel) => void
}

export default function ProviderSetup<TModel>({
  adapter,
  onAvailable,
}: ProviderSetupProps<TModel>) {
  const [availability, setAvailability] = useState<Availability | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  useEffect(() => {
    adapter.isAvailable().then((result) => {
      setAvailability(result)
    })
  }, [adapter])

  useEffect(() => {
    if (availability === 'yes') {
      onAvailable(adapter.model)
    }
  }, [availability, adapter, onAvailable])

  const handleDownloadModel = async () => {
    setIsDownloading(true)
    setDownloadProgress(0)

    try {
      await adapter.download((percentage) => {
        setDownloadProgress(percentage)
      })
      const result = await adapter.isAvailable()
      setAvailability(result)
    } catch (error) {
      console.error('Download failed:', error)
      alert('Download failed. Please try again.')
    } finally {
      setIsDownloading(false)
    }
  }

  const handleDeleteModel = async () => {
    try {
      await adapter.delete()
      const result = await adapter.isAvailable()
      setAvailability(result)
    } catch (error) {
      console.error('Delete failed:', error)
      alert(
        `Failed to delete model: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  if (!availability) {
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
        {availability === 'availableForDownload' && !isDownloading && (
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

        {availability === 'yes' && (
          <View className="flex-row mt-3 gap-2">
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
      </View>

      <View className="flex-1 items-center justify-center p-4">
        <Text className="text-gray-400 text-center">
          {availability === 'no'
            ? 'Provider is not available on this device'
            : availability === 'availableForDownload'
              ? 'Download the model to get started'
              : 'Model downloaded and ready'}
        </Text>
      </View>
    </View>
  )
}
