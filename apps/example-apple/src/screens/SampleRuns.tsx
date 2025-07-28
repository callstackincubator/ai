import React, { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

import { apple, type DemoKey, schemaDemos } from '../schema-demos'

export default function SampleRuns() {
  const [loading, setLoading] = useState<string | null>(null)
  const isAvailable = apple.isAvailable()

  const runDemo = async (key: DemoKey) => {
    if (loading) return

    setLoading(key)

    try {
      const result = await schemaDemos[key].func()
      Alert.alert('Success', JSON.stringify(result, null, 2))
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : String(error)
      )
    } finally {
      setLoading(null)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Schema Demo Tests</Text>
      <Text style={styles.status}>
        Apple Intelligence: {isAvailable ? '✅ Available' : '❌ Not Available'}
      </Text>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {Object.entries(schemaDemos).map(([key, demo]) => (
          <TouchableOpacity
            key={key}
            style={[styles.button, loading === key && styles.buttonDisabled]}
            onPress={() => runDemo(key as DemoKey)}
            disabled={loading !== null}
          >
            <View style={styles.buttonContent}>
              {loading === key && (
                <ActivityIndicator
                  size="small"
                  color="#fff"
                  style={styles.spinner}
                />
              )}
              <Text style={styles.buttonText}>{demo.name}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  status: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    color: '#666',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 10,
    minHeight: 50,
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#999',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  spinner: {
    marginRight: 8,
  },
})