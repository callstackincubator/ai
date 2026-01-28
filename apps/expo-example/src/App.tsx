import './global.css'

import { StatusBar } from 'expo-status-bar'
import { Provider as JotaiProvider } from 'jotai'
import React from 'react'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import ChatScreen from './screens/apple/ChatScreen'

export default function App() {
  return (
    <KeyboardProvider>
      <SafeAreaProvider>
        <JotaiProvider>
          <ChatScreen />
          <StatusBar style="auto" />
        </JotaiProvider>
      </SafeAreaProvider>
    </KeyboardProvider>
  )
}
