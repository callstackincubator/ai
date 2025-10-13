import './global.css'

import React from 'react'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import MLCScreen from './screens/MLCScreen'

export default function App() {
  return (
    <KeyboardProvider>
      <SafeAreaProvider>
        <MLCScreen />
      </SafeAreaProvider>
    </KeyboardProvider>
  )
}
