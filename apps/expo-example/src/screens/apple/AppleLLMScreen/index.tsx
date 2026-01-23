import type { LanguageModelV3 } from '@ai-sdk/provider'
import React, { useState } from 'react'
import { View } from 'react-native'

import ChatUI from '../../../components/ChatUI'
import ProviderSelector from '../../../components/ProviderSelector'
import ProviderSetup from '../../../components/ProviderSetup'
import { languageAdapters, type SetupAdapter } from '../../../config/providers'

const providerOptions = languageAdapters.map((adapter) => ({
  label: adapter.label,
  value: adapter,
}))

export default function ChatScreen() {
  const [activeProvider, setActiveProvider] =
    useState<SetupAdapter<LanguageModelV3> | null>(null)
  const [isModelAvailable, setIsModelAvailable] = useState(false)

  const handleProviderChange = async (
    nextAdapter: SetupAdapter<LanguageModelV3>
  ) => {
    if (nextAdapter === activeProvider) return
    void activeProvider?.unload()
    setActiveProvider(nextAdapter)

    const availability = await nextAdapter.isAvailable()
    setIsModelAvailable(availability === 'yes')
  }

  return (
    <View className="flex-1">
      <ProviderSelector
        options={providerOptions}
        value={activeProvider}
        onProviderChange={handleProviderChange}
      />
      {activeProvider && (
        <ProviderSetup
          adapter={activeProvider}
          onAvailable={() => setIsModelAvailable(true)}
        />
      )}
      {activeProvider && isModelAvailable && (
        <ChatUI model={activeProvider.model} />
      )}
    </View>
  )
}
