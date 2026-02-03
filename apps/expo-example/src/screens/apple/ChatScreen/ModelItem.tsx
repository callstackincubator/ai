import type { LanguageModelV3 } from '@ai-sdk/provider'
import { SymbolView } from 'expo-symbols'
import React from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import type { SetupAdapter } from '../../../config/providers'
import {
  useDownloadProgress,
  useProviderStore,
} from '../../../store/providerStore'
import { colors } from '../../../theme/colors'

type ModelItemProps = {
  adapter: SetupAdapter<LanguageModelV3>
  isSelected: boolean
  onSelect: (id: string) => void
  isFirst: boolean
  isLast: boolean
}

export function ModelItem({
  adapter,
  isSelected,
  onSelect,
  isLast,
}: ModelItemProps) {
  const { removeModel, availability, downloadModel } = useProviderStore()
  const downloadProgress = useDownloadProgress(adapter.modelId)

  const selectedModelAvailability = availability.get(adapter.modelId)

  const { accentColor } = adapter.display

  const handlePress = async () => {
    if (downloadProgress !== undefined) return
    if (selectedModelAvailability === 'availableForDownload') {
      await downloadModel(adapter.modelId)
    }
    if (selectedModelAvailability === 'yes') {
      onSelect(adapter.modelId)
    }
  }

  const handleDelete = async () => {
    if (downloadProgress || adapter.builtIn) return
    removeModel(adapter.modelId)
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={selectedModelAvailability === 'no'}
      style={[styles.modelItemContent]}
      onLongPress={handleDelete}
    >
      <View
        style={[
          styles.modelIcon,
          {
            backgroundColor:
              selectedModelAvailability === 'no'
                ? colors.tertiaryLabel
                : accentColor,
          },
        ]}
      >
        <SymbolView
          name="cpu"
          size={20}
          tintColor="#fff"
          resizeMode="scaleAspectFit"
        />
      </View>
      <View
        style={[styles.modelItemInfo, !isLast && styles.modelItemInfoBorder]}
      >
        <View style={styles.modelItemTextContainer}>
          <Text
            style={[
              styles.modelItemLabel,
              selectedModelAvailability === 'no' &&
                styles.modelItemLabelUnavailable,
            ]}
          >
            {adapter.display.label}
          </Text>
          {downloadProgress !== undefined ? (
            <View style={styles.downloadProgressContainer}>
              <View style={styles.downloadProgressTrack}>
                <View
                  style={[
                    styles.downloadProgressFill,
                    { width: `${downloadProgress}%` },
                  ]}
                />
              </View>
              <Text style={styles.downloadProgressText}>
                Downloading... {downloadProgress}%
              </Text>
            </View>
          ) : (
            <Text style={styles.modelStatusText}>
              {selectedModelAvailability === 'yes'
                ? 'Downloaded'
                : selectedModelAvailability === 'availableForDownload'
                  ? 'Tap to download'
                  : 'Not available on this device'}
            </Text>
          )}
        </View>
        <View style={styles.modelItemTrailing}>
          {downloadProgress !== undefined ? (
            <ActivityIndicator size="small" color={colors.systemBlue as any} />
          ) : isSelected ? (
            <SymbolView
              name="checkmark"
              size={20}
              tintColor={colors.systemBlue}
              resizeMode="scaleAspectFit"
            />
          ) : null}
        </View>
      </View>
    </Pressable>
  )
}

type ModelItemFallbackProps = {
  label: string
  accentColor: string
  isLast: boolean
}

export function ModelItemFallback({
  label,
  accentColor,
  isLast,
}: ModelItemFallbackProps) {
  return (
    <View style={styles.modelItemContent}>
      <View style={[styles.modelIcon, { backgroundColor: accentColor }]}>
        <SymbolView
          name="cpu"
          size={20}
          tintColor="#fff"
          resizeMode="scaleAspectFit"
        />
      </View>
      <View
        style={[styles.modelItemInfo, !isLast && styles.modelItemInfoBorder]}
      >
        <View style={styles.modelItemTextContainer}>
          <Text style={styles.modelItemLabel}>{label}</Text>
          <Text style={styles.modelStatusText}>Checking...</Text>
        </View>
        <View style={styles.modelItemTrailing}>
          <ActivityIndicator size="small" color={colors.tertiaryLabel as any} />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  modelItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    backgroundColor: colors.secondarySystemBackground as any,
  },
  modelIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modelItemInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
    paddingRight: 16,
    paddingVertical: 12,
    minHeight: 56,
  },
  modelItemInfoBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator as any,
  },
  modelItemTextContainer: {
    flex: 1,
  },
  modelItemLabel: {
    fontSize: 17,
    fontWeight: '400',
    color: colors.label as any,
  },
  modelItemLabelUnavailable: {
    color: colors.tertiaryLabel as any,
  },
  downloadProgressContainer: {
    marginTop: 6,
  },
  downloadProgressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.tertiarySystemFill as any,
    overflow: 'hidden',
  },
  downloadProgressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.systemBlue as any,
  },
  downloadProgressText: {
    marginTop: 4,
    fontSize: 13,
    color: colors.secondaryLabel as any,
  },
  modelStatusText: {
    marginTop: 2,
    fontSize: 13,
    color: colors.secondaryLabel as any,
  },
  modelItemTrailing: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
})
