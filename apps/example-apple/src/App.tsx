import './global.css'

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { NavigationContainer } from '@react-navigation/native'
import { StatusBar } from 'expo-status-bar'
import React from 'react'

import LLMScreen from './screens/LLMScreen'
import PlaygroundScreen from './screens/PlaygroundScreen'
import SpeechScreen from './screens/SpeechScreen'
import TranscribeScreen from './screens/TranscribeScreen'

const Tab = createBottomTabNavigator()

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator>
        <Tab.Screen name="LLM" component={LLMScreen} />
        <Tab.Screen name="Playground" component={PlaygroundScreen} />
        <Tab.Screen name="Transcribe" component={TranscribeScreen} />
        <Tab.Screen name="Speech" component={SpeechScreen} />
      </Tab.Navigator>
      <StatusBar style="auto" />
    </NavigationContainer>
  )
}
