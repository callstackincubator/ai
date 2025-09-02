import { apple } from '@react-native-ai/apple'
import { experimental_generateSpeech } from 'ai'
import React, { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { AudioContext } from 'react-native-audio-api'

const play = async (arrayBuffer: ArrayBufferLike) => {
  const context = new AudioContext()

  const source = context.createBufferSource()
  source.buffer = await context.decodeAudioData(arrayBuffer as ArrayBuffer)
  source.connect(context.destination)

  source.start()
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  sectionTitleNoMargin: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  textInput: {
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#f9fafb',
    marginBottom: 24,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  generateButton: {
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    shadowColor: '#3b82f6',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  generateButtonActive: {
    backgroundColor: '#3b82f6',
  },
  generateButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  playButton: {
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    shadowColor: '#10b981',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  buttonContent: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statusBadge: {
    backgroundColor: '#dcfce7',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  statusText: {
    color: '#166534',
    fontSize: 14,
    fontWeight: '500',
  },
  timeBox: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  timeLabel: {
    color: '#1e40af',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  timeValue: {
    color: '#1e40af',
    fontSize: 20,
    fontWeight: 'bold',
  },
  bottomSpacing: {
    height: 32,
  },
})

export default function SpeechScreen() {
  const [inputText, setInputText] = useState(
    'On-device text to speech is awesome'
  )
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedSpeech, setGeneratedSpeech] = useState<{
    arrayBuffer: ArrayBufferLike
    time: number
  } | null>(null)

  const generateSpeech = async () => {
    if (!inputText.trim() || isGenerating) return

    setIsGenerating(true)
    setGeneratedSpeech(null)

    const startTime = Date.now()

    try {
      const result = await experimental_generateSpeech({
        model: apple.speechModel(),
        text: inputText,
      })

      const endTime = Date.now()
      const duration = endTime - startTime

      setGeneratedSpeech({
        arrayBuffer: result.audio.uint8Array.buffer,
        time: duration,
      })
    } catch (error) {
      Alert.alert(
        'Speech Generation Error',
        error instanceof Error ? error.message : 'Failed to generate speech'
      )
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={styles.container}
    >
      <View style={styles.scrollView}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Enter Your Text</Text>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type something to convert to speech..."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[
              styles.generateButton,
              isGenerating
                ? styles.generateButtonDisabled
                : styles.generateButtonActive,
            ]}
            onPress={generateSpeech}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <View style={styles.buttonContent}>
                <ActivityIndicator
                  style={{ marginRight: 12 }}
                  color="#FFFFFF"
                />
                <Text style={styles.buttonText}>Generating Speech...</Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>Generate Speech</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Output Section */}
        {generatedSpeech && (
          <View style={styles.card}>
            <View style={styles.statusRow}>
              <Text style={styles.sectionTitleNoMargin}>Generated Speech</Text>
              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>Ready</Text>
              </View>
            </View>

            <View style={styles.timeBox}>
              <Text style={styles.timeLabel}>Generation Time</Text>
              <Text style={styles.timeValue}>{generatedSpeech.time}ms</Text>
            </View>

            <TouchableOpacity
              style={styles.playButton}
              onPress={() => play(generatedSpeech.arrayBuffer)}
            >
              <View style={styles.buttonContent}>
                <Text style={styles.buttonText}>▶️ Play Audio</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Bottom spacing */}
        <View style={styles.bottomSpacing} />
      </View>
    </ScrollView>
  )
}
