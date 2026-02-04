import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { colors } from '../../theme/colors'

type ChatMessageBubbleProps = {
  content: string
  isUser: boolean
}

export function ChatMessageBubble({ content, isUser }: ChatMessageBubbleProps) {
  return (
    <View
      style={[
        styles.messageRow,
        isUser ? styles.messageRowUser : styles.messageRowAssistant,
      ]}
    >
      <View
        style={[
          styles.messageBubble,
          isUser ? styles.messageBubbleUser : styles.messageBubbleAssistant,
        ]}
      >
        <Text
          selectable
          style={[
            styles.messageText,
            isUser ? styles.messageTextUser : styles.messageTextAssistant,
          ]}
        >
          {content}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  messageRow: {
    flexDirection: 'row',
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowAssistant: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderCurve: 'continuous',
  },
  messageBubbleUser: {
    backgroundColor: colors.systemBlue as any,
  },
  messageBubbleAssistant: {
    backgroundColor: colors.secondarySystemBackground as any,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  messageTextUser: {
    color: '#fff',
  },
  messageTextAssistant: {
    color: colors.label as any,
  },
})
