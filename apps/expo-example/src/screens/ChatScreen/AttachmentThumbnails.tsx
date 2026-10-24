import Ionicons from '@expo/vector-icons/Ionicons'
import { SymbolView } from 'expo-symbols'
import React from 'react'
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native'

import {
  getAttachmentUri,
  type ImageAttachment,
} from '../../utils/imageAttachments'

type AttachmentThumbnailsProps = {
  attachments: ImageAttachment[]
  onRemove: (attachment: ImageAttachment) => void
}

export function AttachmentThumbnails({
  attachments,
  onRemove,
}: AttachmentThumbnailsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {attachments.map((attachment) => (
        <View key={attachment.fileName} style={styles.thumbnail}>
          <Image
            source={{ uri: getAttachmentUri(attachment) }}
            style={styles.image}
          />
          <Pressable
            hitSlop={8}
            accessibilityLabel="Remove image"
            onPress={() => onRemove(attachment)}
            style={styles.removeButton}
          >
            <SymbolView
              name="xmark"
              size={10}
              weight="bold"
              tintColor="#fff"
              resizeMode="scaleAspectFit"
              fallback={<Ionicons name="close" size={12} color="#fff" />}
            />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  thumbnail: {
    width: 64,
    height: 64,
  },
  image: {
    width: 64,
    height: 64,
    borderRadius: 12,
    borderCurve: 'continuous',
  },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
