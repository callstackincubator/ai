import { Stack } from 'expo-router'
import React from 'react'

export default function ChatLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="history"
        options={{ title: 'Chats', headerLargeTitle: true }}
      />
    </Stack>
  )
}
