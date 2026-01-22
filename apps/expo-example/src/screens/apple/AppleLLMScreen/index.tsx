import type { LanguageModelV3 } from '@ai-sdk/provider'
import React, { useState } from 'react'
import { Text, View } from 'react-native'

import ChatUI from '../../../components/ChatUI'
import ProviderSetup from '../../../components/ProviderSetup'
import { LLAMA_MODELS } from '../../../config/models'

export default function AppleLLMScreen() {
  const [model, setModel] = useState<LanguageModelV3 | null>(null)

  // Apple provider not available on Android, use Llama only
  if (!model) {
    return (
      <View className="flex-1">
        <View className="bg-white border-b border-gray-200 p-4">
          <Text className="text-sm font-semibold text-gray-700 mb-2">
            Provider: Llama (Android)
          </Text>
          <Text className="text-xs text-gray-500">
            Apple Intelligence is only available on iOS
          </Text>
        </View>
        <ProviderSetup
          models={LLAMA_MODELS}
          onReady={(llamaModel) => setModel(llamaModel)}
        />
      </View>
    )
  }

  return (
    <View className="flex-1">
      <View className="bg-white border-b border-gray-200 p-4">
        <Text className="text-sm font-semibold text-gray-700 mb-2">
          Provider: Llama
        </Text>
        <Text className="text-xs text-gray-500">Model is ready</Text>
      </View>
      <ChatUI model={model} />
    </View>
  )
}
