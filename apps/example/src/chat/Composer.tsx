import { SymbolView } from 'expo-symbols'
import React, { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
} from 'react-native-reanimated'

import { Glass } from '../components/Glass'
import { onAccent } from '../theme/brand'
import { colors } from '../theme/colors'
import {
  deleteAttachment,
  type ImageAttachment,
  type ImageSource,
  pickImages,
} from '../utils/imageAttachments'
import { AttachmentMenu } from './AttachmentMenu'
import { AttachmentThumbnails } from './AttachmentThumbnails'

type ComposerProps = {
  // Returns whether the message was sent
  onSend: (message: string, attachments: ImageAttachment[]) => boolean
  onStop: () => void
  isGenerating: boolean
  imageInputEnabled: boolean
}

export function Composer({
  onSend,
  onStop,
  isGenerating,
  imageInputEnabled,
}: ComposerProps) {
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<ImageAttachment[]>([])
  // Picked photos are copied after the picker closes, which takes a moment
  const [isPicking, setIsPicking] = useState(false)
  const canSend = input.trim().length > 0 || attachments.length > 0

  const handlePick = async (source: ImageSource) => {
    setIsPicking(true)
    try {
      const picked = await pickImages(source)
      setAttachments((prev) => [...prev, ...picked])
    } catch (error) {
      Alert.alert(
        'Could not attach image',
        error instanceof Error ? error.message : undefined
      )
    } finally {
      setIsPicking(false)
    }
  }

  const handleRemove = (attachment: ImageAttachment) => {
    deleteAttachment(attachment)
    setAttachments((prev) =>
      prev.filter((item) => item.fileName !== attachment.fileName)
    )
  }

  const handleSend = () => {
    if (!canSend || isGenerating) return
    // The draft stays when the message isn't sent
    if (!onSend(input.trim(), attachments)) return
    setInput('')
    setAttachments([])
  }

  return (
    <View style={styles.row}>
      {imageInputEnabled && (
        <Glass isInteractive style={styles.plus}>
          {isPicking ? (
            <ActivityIndicator accessibilityLabel="Attaching images" />
          ) : (
            <AttachmentMenu onPick={handlePick} />
          )}
        </Glass>
      )}
      <Glass style={styles.pill}>
        <Animated.View layout={LinearTransition.duration(200)}>
          {attachments.length > 0 && (
            <Animated.View entering={FadeIn} exiting={FadeOut}>
              <AttachmentThumbnails
                attachments={attachments}
                onRemove={handleRemove}
              />
            </Animated.View>
          )}
          <View style={styles.inputRow}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask anything"
              placeholderTextColor={colors.secondaryLabel}
              multiline
              style={styles.input}
            />
            {isGenerating ? (
              <Pressable
                onPress={onStop}
                accessibilityLabel="Stop"
                style={[styles.send, styles.stop]}
              >
                <SymbolView
                  name="stop.fill"
                  size={14}
                  tintColor={colors.systemBackground}
                />
              </Pressable>
            ) : (
              <Pressable
                onPress={handleSend}
                disabled={!canSend}
                accessibilityLabel="Send"
                style={[styles.send, !canSend && styles.sendDisabled]}
              >
                <SymbolView
                  name="arrow.up"
                  size={18}
                  weight="semibold"
                  tintColor={canSend ? onAccent : '#FFFFFF'}
                />
              </Pressable>
            )}
          </View>
        </Animated.View>
      </Glass>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  plus: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flex: 1,
    borderRadius: 24,
    padding: 6,
    paddingLeft: 16,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 17,
    color: colors.label,
    paddingTop: 9,
    paddingBottom: 9,
    maxHeight: 140,
  },
  send: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  sendDisabled: {
    backgroundColor: colors.tertiaryLabel,
  },
  stop: {
    backgroundColor: colors.label,
  },
})
