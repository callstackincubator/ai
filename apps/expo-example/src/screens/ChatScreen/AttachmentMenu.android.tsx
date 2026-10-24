import Ionicons from '@expo/vector-icons/Ionicons'
import React from 'react'
import { Alert, Pressable } from 'react-native'

import { colors } from '../../theme/colors'
import type { ImageSource } from '../../utils/imageAttachments'

type AttachmentMenuProps = {
  onPick: (source: ImageSource) => void
}

export function AttachmentMenu({ onPick }: AttachmentMenuProps) {
  return (
    <Pressable
      hitSlop={8}
      onPress={() =>
        Alert.alert('Add attachment', undefined, [
          { text: 'Take Photo', onPress: () => onPick('camera') },
          { text: 'Photo Library', onPress: () => onPick('library') },
          { text: 'Cancel', style: 'cancel' },
        ])
      }
    >
      <Ionicons name="add" size={24} color={colors.tertiaryLabel as any} />
    </Pressable>
  )
}
