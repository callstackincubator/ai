import React from 'react'
import { Text, View } from 'react-native'

export default function EmbeddingsScreen() {
  return (
    <View className="flex-1 bg-gray-50 p-4">
      <Text className="text-2xl font-bold text-center mb-2">Embeddings</Text>
      <Text className="text-base text-gray-600 text-center">
        Text embeddings and semantic search
      </Text>
    </View>
  )
}
