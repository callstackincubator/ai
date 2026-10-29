import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Provider as JotaiProvider } from 'jotai'
import React, { useEffect, useState } from 'react'
import { StyleSheet, useColorScheme } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { KeyboardProvider } from 'react-native-keyboard-controller'

import { useOnboarding } from '../src/store/features'
import { loadPersistedState } from '../src/store/storage'

function RootStack() {
  const { onboarded } = useOnboarding()

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={onboarded}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="settings"
          options={{
            presentation: 'formSheet',
            sheetGrabberVisible: true,
            sheetAllowedDetents: [0.75, 1],
            headerShown: true,
            title: 'Settings',
          }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!onboarded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
    </Stack>
  )
}

export default function RootLayout() {
  const scheme = useColorScheme()
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    loadPersistedState().finally(() => setLoaded(true))
  }, [])

  return (
    <GestureHandlerRootView style={styles.root}>
      <KeyboardProvider>
        <JotaiProvider>
          <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
            {/* Stored settings load before the first screen renders */}
            {loaded && <RootStack />}
            <StatusBar style="auto" />
          </ThemeProvider>
        </JotaiProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
})
