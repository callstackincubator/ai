import type { LanguageModelV3 } from '@ai-sdk/provider'
import { createAppleProvider } from '@react-native-ai/apple'
import React, { useState } from 'react'
import { View } from 'react-native'

import ChatUI from '../../../components/ChatUI'
import ProviderSelector from '../../../components/ProviderSelector'
import ProviderSetup from '../../../components/ProviderSetup'
import { LLAMA_MODELS } from '../../../config/models'
import {
  checkCalendarEvents,
  createCalendarEvent,
  getCurrentTime,
} from '../../../tools'

const apple = createAppleProvider({
  availableTools: {
    getCurrentTime,
    createCalendarEvent,
    checkCalendarEvents,
  },
})

export default function AppleLLMScreen() {
  const [provider, setProvider] = useState<'apple' | 'llama'>('apple')
  const [model, setModel] = useState<LanguageModelV3 | null>(null)

  // If using Apple, model is ready immediately
  if (provider === 'apple') {
    return (
      <View className="flex-1">
        <ProviderSelector
          provider={provider}
          onProviderChange={(newProvider) => {
            setProvider(newProvider)
            setModel(null)
          }}
        />
        <ChatUI
          model={apple()}
          tools={{
            getCurrentTime,
            createCalendarEvent,
            checkCalendarEvents,
          }}
        />
      </View>
    )
  }

  // If using Llama and model not ready, show setup
  if (provider === 'llama' && !model) {
    return (
      <ProviderSetup
        models={LLAMA_MODELS}
        onReady={(llamaModel) => setModel(llamaModel)}
        onBack={() => setProvider('apple')}
      />
    )
  }

  // If using Llama and model is ready, show chat
  return (
    <View className="flex-1">
      <ProviderSelector
        provider={provider}
        onProviderChange={(newProvider) => {
          setProvider(newProvider)
          setModel(null)
        }}
      />
      <ChatUI model={model!} />
    </View>
  )
}
