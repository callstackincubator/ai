import { Picker } from '@react-native-picker/picker'
import React from 'react'
import { Text, View } from 'react-native'

interface ProviderOption<TValue> {
  label: string
  value: TValue
}

interface ProviderSelectorProps<TValue> {
  options: ProviderOption<TValue>[]
  value: TValue
  onProviderChange: (value: TValue) => void
  disabled?: boolean
}

export default function ProviderSelector<TValue>({
  options,
  value,
  onProviderChange,
}: ProviderSelectorProps<TValue>) {
  return (
    <View className="bg-white border-b border-gray-200 p-4">
      <Text className="text-sm font-semibold text-gray-700 mb-2">
        Select Provider
      </Text>
      <View className="border border-gray-300 rounded-lg overflow-hidden">
        <Picker
          selectedValue={value}
          onValueChange={(_value, index) =>
            onProviderChange(options[index].value)
          }
        >
          {options.map((option, index) => (
            <Picker.Item
              key={`${option.label}-${index}`}
              label={option.label}
              value={option.value}
            />
          ))}
        </Picker>
      </View>
    </View>
  )
}
