import './global.css'

import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { StatusBar } from 'expo-status-bar'
import React from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import LLMScreen from './screens/LLMScreen'
import PlaygroundScreen from './screens/PlaygroundScreen'
import SpeechScreen from './screens/SpeechScreen'
import TranscribeScreen from './screens/TranscribeScreen'

const Tab = createNativeBottomTabNavigator()
const Stack = createNativeStackNavigator()

function LLMStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="LLM Chat" component={LLMScreen} />
    </Stack.Navigator>
  )
}

function PlaygroundStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Playground" component={PlaygroundScreen} />
    </Stack.Navigator>
  )
}

function TranscribeStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Transcribe" component={TranscribeScreen} />
    </Stack.Navigator>
  )
}

function SpeechStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Speech" component={SpeechScreen} />
    </Stack.Navigator>
  )
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Tab.Navigator>
          <Tab.Screen
            name="LLM Tab"
            component={LLMStack}
            options={{
              title: 'LLM',
              tabBarIcon: () => ({ sfSymbol: 'brain.head.profile' }),
            }}
          />
          <Tab.Screen
            name="Playground Tab"
            component={PlaygroundStack}
            options={{
              title: 'Playground',
              tabBarIcon: () => ({ sfSymbol: 'play.circle' }),
            }}
          />
          <Tab.Screen
            name="Transcribe Tab"
            component={TranscribeStack}
            options={{
              title: 'Transcribe',
              tabBarIcon: () => ({ sfSymbol: 'text.quote' }),
            }}
          />
          <Tab.Screen
            name="Speech Tab"
            component={SpeechStack}
            options={{
              title: 'Speech',
              tabBarIcon: () => ({ sfSymbol: 'speaker.wave.3' }),
            }}
          />
        </Tab.Navigator>
        <StatusBar style="auto" />
      </NavigationContainer>
    </SafeAreaProvider>
  )
}
