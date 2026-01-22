import { Picker } from '@react-native-picker/picker'
import React from 'react'
import { Text, View } from 'react-native'

interface ProviderSelectorProps {
  provider: 'apple' | 'llama'
  onProviderChange: (provider: 'apple' | 'llama') => void
  disabled?: boolean
}

export default function ProviderSelector({
  provider,
  onProviderChange,
  disabled = false,
}: ProviderSelectorProps) {
  return (
    <View className="bg-white border-b border-gray-200 p-4">
      <Text className="text-sm font-semibold text-gray-700 mb-2">
        Select Provider
      </Text>
      <View className="border border-gray-300 rounded-lg overflow-hidden">
        <Picker
          selectedValue={provider}
          onValueChange={(value) =>
            onProviderChange(value as 'apple' | 'llama')
          }
          enabled={!disabled}
        >
          <Picker.Item label="Apple (On-device)" value="apple" />
          <Picker.Item label="Llama (Downloadable)" value="llama" />
        </Picker>
      </View>
    </View>
  )
}
