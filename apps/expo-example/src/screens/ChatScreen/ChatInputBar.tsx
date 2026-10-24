import Ionicons from '@expo/vector-icons/Ionicons'
import { SymbolView } from 'expo-symbols'
import React, { useState } from 'react'
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native'

import { AdaptiveGlass } from '../../components/AdaptiveGlass'
import { RecordButton } from '../../components/RecordButton'
import { colors } from '../../theme/colors'
import {
  deleteAttachment,
  type ImageAttachment,
  type ImageSource,
  pickImages,
} from '../../utils/imageAttachments'
import { AppleTokenCounter } from './AppleTokenCounter'
import { AttachmentMenu } from './AttachmentMenu'
import { AttachmentThumbnails } from './AttachmentThumbnails'

type ChatInputBarProps = {
  onSend: (message: string, attachments: ImageAttachment[]) => void
  isGenerating: boolean
  showAppleTokenCount: boolean
  imageInputEnabled: boolean
}

export function ChatInputBar({
  onSend,
  isGenerating,
  showAppleTokenCount,
  imageInputEnabled,
}: ChatInputBarProps) {
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<ImageAttachment[]>([])
  const canSend = input.trim().length > 0 || attachments.length > 0

  const handlePick = async (source: ImageSource) => {
    try {
      const picked = await pickImages(source)
      setAttachments((prev) => [...prev, ...picked])
    } catch (error) {
      Alert.alert(
        'Could not attach image',
        error instanceof Error ? error.message : undefined
      )
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
    onSend(input.trim(), attachments)
    setInput('')
    setAttachments([])
  }

  return (
    <AdaptiveGlass style={styles.inputBar}>
      <View style={styles.tokenCounterContainer}>
        <AppleTokenCounter input={input} isVisible={showAppleTokenCount} />
      </View>
      {attachments.length > 0 && (
        <AttachmentThumbnails
          attachments={attachments}
          onRemove={handleRemove}
        />
      )}
      <View style={styles.inputRow}>
        {imageInputEnabled && (
          <AdaptiveGlass isInteractive style={styles.plusButton}>
            <AttachmentMenu onPick={handlePick} />
          </AdaptiveGlass>
        )}

        <View style={styles.textInputContainer}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Message"
            placeholderTextColor={colors.secondaryLabel as any}
            multiline
            style={styles.textInput}
            editable={!isGenerating}
          />
        </View>

        {canSend ? (
          <Pressable
            onPress={handleSend}
            disabled={isGenerating}
            style={styles.sendButton}
          >
            <SymbolView
              name="arrow.up"
              size={20}
              tintColor="#fff"
              resizeMode="scaleAspectFit"
              fallback={<Ionicons name="arrow-up" size={20} color="#fff" />}
            />
          </Pressable>
        ) : (
          <RecordButton
            onTranscriptionComplete={(text) =>
              setInput((prev) => (prev ? `${prev} ${text}` : text))
            }
            disabled={isGenerating}
          />
        )}
      </View>
    </AdaptiveGlass>
  )
}

const styles = StyleSheet.create({
  inputBar: {
    padding: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  plusButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: colors.tertiarySystemFill as any,
    paddingHorizontal: 16,
    minHeight: 40,
  },
  tokenCounterContainer: {
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    fontSize: 17,
    color: colors.label as any,
    paddingTop: 10,
    paddingBottom: 10,
    maxHeight: 120,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginBottom: 2,
    backgroundColor: colors.systemBlue as any,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
