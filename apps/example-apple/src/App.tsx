import './global.css'

import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation'
import { NavigationContainer } from '@react-navigation/native'
import { StatusBar } from 'expo-status-bar'
import React from 'react'

import LLMScreen from './screens/LLMScreen'
import PlaygroundScreen from './screens/PlaygroundScreen'
import SpeechScreen from './screens/SpeechScreen'
import TranscribeScreen from './screens/TranscribeScreen'

const Tab = createNativeBottomTabNavigator()

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator>
        <Tab.Screen 
          name="LLM" 
          component={LLMScreen}
          options={{
            tabBarIcon: () => ({ sfSymbol: 'brain.head.profile' }),
          }}
        />
        <Tab.Screen 
          name="Playground" 
          component={PlaygroundScreen}
          options={{
            tabBarIcon: () => ({ sfSymbol: 'play.circle' }),
          }}
        />
        <Tab.Screen 
          name="Transcribe" 
          component={TranscribeScreen}
          options={{
            tabBarIcon: () => ({ sfSymbol: 'text.quote' }),
          }}
        />
        <Tab.Screen 
          name="Speech" 
          component={SpeechScreen}
          options={{
            tabBarIcon: () => ({ sfSymbol: 'speaker.wave.3' }),
          }}
        />
      </Tab.Navigator>
      <StatusBar style="auto" />
    </NavigationContainer>
  )
}
