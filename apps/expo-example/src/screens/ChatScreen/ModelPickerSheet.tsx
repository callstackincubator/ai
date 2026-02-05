import type { LanguageModelV3 } from '@ai-sdk/provider'
import Ionicons from '@expo/vector-icons/Ionicons'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { SymbolView } from 'expo-symbols'
import React, { RefObject, Suspense, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import type { SetupAdapter } from '../../config/providers.common'
import { useChatStore } from '../../store/chatStore'
import { useProviderStore } from '../../store/providerStore'
import { colors } from '../../theme/colors'
import { ModelItem, ModelItemFallback } from './ModelItem'

type ModelPickerSheetProps = {
  ref: RefObject<TrueSheet | null>
}

export function ModelPickerSheet({ ref }: ModelPickerSheetProps) {
  const { chatSettings, updateChatSettings } = useChatStore()
  const { adapters, addCustomModel } = useProviderStore()

  const [customUrl, setCustomUrl] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)

  const adaptersByProvider = new Map<string, SetupAdapter<LanguageModelV3>[]>()

  for (const adapter of adapters) {
    const key = adapter.model.provider
    const group = adaptersByProvider.get(key) ?? []
    group.push(adapter)
    adaptersByProvider.set(key, group)
  }

  const handleModelSelect = (id: string) => {
    updateChatSettings({ modelId: id })
    ref?.current?.dismiss()
  }

  const handleAddCustomModel = () => {
    addCustomModel(customUrl)
    setCustomUrl('')
    setShowCustomInput(false)
  }

  const { modelId: selectedModelId } = chatSettings

  return (
    <TrueSheet ref={ref} scrollable style={{ backgroundColor: '#fff' }}>
      <View style={styles.sheetContainer}>
        <ScrollView nestedScrollEnabled>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Choose Model</Text>
          </View>
          {Array.from(adaptersByProvider.entries()).map(
            ([providerLabel, adapters], index) => (
              <View
                key={providerLabel}
                style={index > 0 && styles.modelListSpacing}
              >
                <Text style={styles.sectionLabel}>{providerLabel}</Text>
                <View style={styles.modelList}>
                  {adapters.map((adapter, adapterIndex) => (
                    <Suspense
                      key={adapter.modelId}
                      fallback={
                        <ModelItemFallback
                          label={adapter.display.label}
                          accentColor={adapter.display.accentColor}
                          isLast={adapterIndex === adapters.length - 1}
                        />
                      }
                    >
                      <ModelItem
                        adapter={adapter}
                        isSelected={selectedModelId === adapter.modelId}
                        onSelect={handleModelSelect}
                        isFirst={adapterIndex === 0}
                        isLast={adapterIndex === adapters.length - 1}
                      />
                    </Suspense>
                  ))}
                </View>
              </View>
            )
          )}
          <View style={styles.customModelSection}>
            {showCustomInput ? (
              <>
                <Text style={styles.customModelInputTitle}>
                  Add from Hugging Face
                </Text>
                <View style={styles.customModelInput}>
                  <TextInput
                    value={customUrl}
                    onChangeText={setCustomUrl}
                    placeholder="Enter Hugging Face model URL"
                    placeholderTextColor={colors.placeholderText as any}
                    style={styles.customModelUrlInput}
                  />
                </View>
                <View style={styles.customModelButtons}>
                  <Pressable
                    onPress={() => setShowCustomInput(false)}
                    style={styles.customModelCancelButton}
                  >
                    <Text style={styles.customModelCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleAddCustomModel}
                    disabled={!customUrl.trim()}
                    style={[
                      styles.customModelAddButton,
                      !customUrl.trim() && styles.customModelAddButtonDisabled,
                    ]}
                  >
                    <Text style={styles.customModelAddText}>Add Model</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Pressable
                onPress={() => setShowCustomInput(true)}
                style={styles.addCustomModelButton}
              >
                <View style={styles.addCustomModelIcon}>
                  <SymbolView
                    name="link"
                    size={18}
                    tintColor={colors.secondaryLabel}
                    resizeMode="scaleAspectFit"
                    fallback={
                      <Ionicons
                        name="link"
                        size={18}
                        color={colors.secondaryLabel}
                      />
                    }
                  />
                </View>
                <Text style={styles.addCustomModelText}>
                  Add Custom Model from Hugging Face
                </Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </View>
    </TrueSheet>
  )
}

const styles = StyleSheet.create({
  sheetContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 8,
    backgroundColor: '#fff',
  },
  sheetHeader: {
    paddingTop: 16,
    paddingBottom: 24,
  },
  sheetTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.label as any,
    letterSpacing: 0.34,
  },
  sectionLabel: {
    paddingHorizontal: 16,
    paddingBottom: 6,
    fontSize: 13,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: -0.08,
    color: colors.secondaryLabel as any,
  },
  modelList: {
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: colors.secondarySystemBackground as any,
    overflow: 'hidden',
  },
  modelListSpacing: {
    marginTop: 16,
  },
  customModelSection: {
    marginTop: 32,
  },
  customModelInput: {
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: colors.secondarySystemBackground as any,
    overflow: 'hidden',
  },
  customModelInputTitle: {
    fontSize: 13,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: -0.08,
    color: colors.secondaryLabel as any,
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  customModelUrlInput: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    color: colors.label as any,
  },
  customModelButtons: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 12,
  },
  customModelCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.tertiarySystemFill as any,
    alignItems: 'center',
  },
  customModelCancelText: {
    fontSize: 17,
    fontWeight: '400',
    color: colors.label as any,
  },
  customModelAddButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.systemBlue as any,
    alignItems: 'center',
  },
  customModelAddButtonDisabled: {
    backgroundColor: colors.tertiarySystemFill as any,
  },
  customModelAddText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  addCustomModelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: colors.secondarySystemBackground as any,
  },
  addCustomModelIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.tertiarySystemFill as any,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCustomModelText: {
    flex: 1,
    marginLeft: 12,
    paddingVertical: 16,
    paddingRight: 16,
    fontSize: 17,
    fontWeight: '400',
    color: colors.label as any,
  },
})
