import Ionicons from '@expo/vector-icons/Ionicons'
import React from 'react'
import { Alert, Pressable } from 'react-native'

import { colors } from '../../theme/colors'

export function AttachmentMenu() {
  return (
    <Pressable
      hitSlop={8}
      onPress={() =>
        Alert.alert('Add attachment', undefined, [
          { text: 'Take Photo', onPress: () => console.log('Take Photo') },
          {
            text: 'Photo Library',
            onPress: () => console.log('Photo Library'),
          },
          { text: 'Cancel', style: 'cancel' },
        ])
      }
    >
      <Ionicons name="add" size={24} color={colors.tertiaryLabel as any} />
    </Pressable>
  )
}
