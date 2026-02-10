import Ionicons from '@expo/vector-icons/Ionicons'
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { colors } from '../../theme/colors'

type ChatMessageBubbleProps = {
  content: string
  isUser: boolean
  messageType?: 'text' | 'toolExecution'
  toolExecution?: {
    toolName: string
    payload: unknown
  }
}

export function ChatMessageBubble({
  content,
  isUser,
  messageType = 'text',
  toolExecution,
}: ChatMessageBubbleProps) {
  const [expanded, setExpanded] = React.useState(false)
  const isToolHint = messageType === 'toolExecution'
  const toolLabel = toolExecution
    ? `Tool executed: ${toolExecution.toolName}`
    : content
  const payload = toolExecution?.payload
    ? JSON.stringify(toolExecution.payload, null, 2)
    : ''
  const hasPayload = payload !== '{}'

  return (
    <View
      style={[
        styles.messageRow,
        isToolHint
          ? styles.messageRowAssistant
          : isUser
            ? styles.messageRowUser
            : styles.messageRowAssistant,
      ]}
    >
      <Pressable
        disabled={!isToolHint}
        onPress={() => hasPayload && setExpanded((prev) => !prev)}
        style={[
          styles.messageBubble,
          isToolHint
            ? styles.messageBubbleToolHint
            : isUser
              ? styles.messageBubbleUser
              : styles.messageBubbleAssistant,
        ]}
      >
        {isToolHint ? (
          <View style={styles.toolHintHeader}>
            <Text
              selectable
              style={[styles.messageText, styles.messageTextToolHint]}
            >
              {toolLabel}
            </Text>
            {hasPayload && (
              <Ionicons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.tertiaryLabel}
              />
            )}
          </View>
        ) : (
          <Text
            selectable
            style={[
              styles.messageText,
              isUser ? styles.messageTextUser : styles.messageTextAssistant,
            ]}
          >
            {content}
          </Text>
        )}
        {isToolHint && expanded ? (
          <Text selectable style={styles.payloadText}>
            {payload}
          </Text>
        ) : null}
      </Pressable>
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
  messageBubbleToolHint: {
    backgroundColor: colors.tertiarySystemFill as any,
    borderRadius: 14,
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
  messageTextToolHint: {
    color: colors.secondaryLabel as any,
    fontSize: 14,
    lineHeight: 20,
  },
  toolHintHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  expandIcon: {
    color: colors.tertiaryLabel as any,
    fontSize: 12,
  },
  payloadText: {
    marginTop: 8,
    fontFamily: 'Menlo',
    fontSize: 12,
    lineHeight: 18,
    color: colors.tertiaryLabel as any,
  },
})
