import React, { useEffect, useState } from 'react'
import { View } from 'react-native'

import ChatUI from '../../../components/ChatUI'
import ProviderSelector from '../../../components/ProviderSelector'
import ProviderSetup from '../../../components/ProviderSetup'
import { languageAdapters } from '../../../config/providers'

const providerOptions = languageAdapters.map((adapter, index) => ({
  label: adapter.label,
  value: index,
}))

export default function ChatScreen() {
  const [activeIndex, setActiveIndex] = useState<number>(0)
  const [isModelAvailable, setIsModelAvailable] = useState(false)

  const activeProvider = languageAdapters[activeIndex]

  const handleProviderChange = async (nextIndex: number) => {
    if (nextIndex === activeIndex) return
    void activeProvider?.unload()
    setActiveIndex(nextIndex)
    setIsModelAvailable(false)
  }

  useEffect(() => {
    languageAdapters[activeIndex].isAvailable().then((availability) => {
      setIsModelAvailable(availability === 'yes')
    })
  }, [activeIndex])

  return (
    <View className="flex-1">
      <ProviderSelector
        options={providerOptions}
        value={activeIndex}
        onProviderChange={handleProviderChange}
      />
      {isModelAvailable ? (
        <ChatUI model={activeProvider.model} />
      ) : (
        <ProviderSetup
          adapter={activeProvider}
          onAvailable={() => setIsModelAvailable(true)}
        />
      )}
    </View>
  )
}
