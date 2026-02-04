import { SymbolView } from 'expo-symbols'
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { AdaptiveGlass } from '../../../components/AdaptiveGlass'
import { useChatStore } from '../../../store/chatStore'
import {
  useDownloadProgress,
  useProviderStore,
} from '../../../store/providerStore'
import { colors } from '../../../theme/colors'

export function ModelAvailableForDownload() {
  const {
    chatSettings: { modelId },
  } = useChatStore()
  const { downloadModel } = useProviderStore()

  const downloadProgress = useDownloadProgress(modelId)
  const isDownloading = downloadProgress !== undefined

  const handleDownload = () => {
    downloadModel(modelId)
  }

  return (
    <View style={styles.container}>
      <AdaptiveGlass style={styles.iconContainer}>
        <View style={styles.iconInner}>
          <SymbolView
            name={isDownloading ? 'arrow.down.circle' : 'arrow.down.to.line'}
            size={32}
            tintColor={colors.systemBlue}
            resizeMode="scaleAspectFit"
          />
        </View>
      </AdaptiveGlass>
      <Text style={styles.title}>
        {isDownloading ? 'Model Downloading' : 'Model Must Be Downloaded'}
      </Text>
      <Text style={styles.subtitle}>
        {isDownloading
          ? `Downloading... ${Math.round(downloadProgress)}%`
          : 'This model needs to be downloaded before you can use it.'}
      </Text>
      {!isDownloading && (
        <Pressable onPress={handleDownload} style={styles.downloadButton}>
          <Text style={styles.downloadButtonText}>Download Model</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconContainer: {
    borderRadius: 40,
    overflow: 'hidden',
  },
  iconInner: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 24,
    fontSize: 22,
    fontWeight: '600',
    color: colors.label as any,
  },
  subtitle: {
    marginTop: 8,
    maxWidth: 280,
    textAlign: 'center',
    fontSize: 15,
    color: colors.secondaryLabel as any,
  },
  downloadButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: colors.systemBlue as any,
  },
  downloadButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
})
