import { NativeTabs } from 'expo-router/native-tabs'
import React from 'react'

import { useEnabledFeatures } from '../../src/store/features'

export default function TabsLayout() {
  const { isEnabled } = useEnabledFeatures()

  return (
    <NativeTabs minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="chat" hidden={!isEnabled('chat')}>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'bubble.left', selected: 'bubble.left.fill' }}
        />
        <NativeTabs.Trigger.Label>Chat</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="voice" hidden={!isEnabled('voice')}>
        <NativeTabs.Trigger.Icon sf="waveform" />
        <NativeTabs.Trigger.Label>Voice</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="search"
        role="search"
        hidden={!isEnabled('search')}
      >
        <NativeTabs.Trigger.Icon sf="magnifyingglass" />
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
