import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { NavigationContainer } from '@react-navigation/native'
import { StatusBar } from 'expo-status-bar'
import React from 'react'

import RAG from './screens/RAG'
import SampleRuns from './screens/SampleRuns'

const Tab = createBottomTabNavigator()

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator>
        <Tab.Screen name="SampleRuns" component={SampleRuns} />
        <Tab.Screen name="RAG" component={RAG} />
      </Tab.Navigator>
      <StatusBar style="auto" />
    </NavigationContainer>
  )
}
