import React from 'react'
import { Text, View } from 'react-native'

export default function SpeechScreen() {
  return (
    <View className="flex-1 bg-gray-50 p-4">
      <Text className="text-2xl font-bold text-center mb-2">Speech</Text>
      <Text className="text-base text-gray-600 text-center">
        Text to speech synthesis
      </Text>
    </View>
  )
}
