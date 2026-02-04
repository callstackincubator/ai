import Ionicons from '@expo/vector-icons/Ionicons'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { SymbolView } from 'expo-symbols'
import React, { RefObject } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { Host, Slider } from '../../components/expo-ui'
import { useChatStore } from '../../store/chatStore'
import { colors } from '../../theme/colors'
import { toolDefinitions } from '../../tools'

type SettingsSheetProps = {
  ref: RefObject<TrueSheet | null>
}

export function SettingsSheet({ ref }: SettingsSheetProps) {
  const { chatSettings, toggleTool, updateChatSettings } = useChatStore()
  const { temperature, maxSteps, enabledToolIds } = chatSettings

  return (
    <TrueSheet ref={ref} scrollable>
      <View style={styles.sheetContainer}>
        <ScrollView nestedScrollEnabled>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Tools & Settings</Text>
          </View>
          <Text style={styles.sectionLabel}>Tools</Text>
          <View style={styles.toolsList}>
            {Object.entries(toolDefinitions).map(([id, tool], index, arr) => {
              const enabled = enabledToolIds.includes(id)
              const isFirst = index === 0
              const isLast = index === arr.length - 1
              return (
                <Pressable
                  key={id}
                  onPress={() => toggleTool(id)}
                  style={[
                    styles.toolItem,
                    isFirst && styles.toolItemFirst,
                    isLast && styles.toolItemLast,
                  ]}
                >
                  <View
                    style={[
                      styles.toolItemContent,
                      !isLast && styles.toolItemContentBorder,
                    ]}
                  >
                    <View style={styles.toolItemTextContainer}>
                      <Text style={styles.toolItemTitle}>{tool.title}</Text>
                      <Text style={styles.toolItemDescription}>
                        {tool.description}
                      </Text>
                    </View>
                    {enabled && (
                      <SymbolView
                        name="checkmark"
                        size={20}
                        tintColor={colors.systemBlue}
                        resizeMode="scaleAspectFit"
                        fallback={
                          <Ionicons
                            name="checkmark"
                            size={20}
                            color={colors.systemBlue}
                          />
                        }
                      />
                    )}
                  </View>
                </Pressable>
              )
            })}
          </View>

          <View style={styles.settingsSection}>
            <Text style={styles.sectionLabel}>Model Settings</Text>
            <View style={styles.settingsCard}>
              <View style={styles.settingRowSlider}>
                <View style={styles.settingSliderHeader}>
                  <Text style={styles.settingTitle}>Temperature</Text>
                  <Text style={styles.settingValue}>
                    {temperature.toFixed(1)}
                  </Text>
                </View>
                <Host style={styles.sliderHost}>
                  <Slider
                    value={temperature}
                    min={0}
                    max={2}
                    onValueChange={(value) =>
                      updateChatSettings({
                        temperature: Math.round(value * 10) / 10,
                      })
                    }
                  />
                </Host>
              </View>
              <View style={styles.settingRowSliderWithBorder}>
                <View style={styles.settingSliderHeader}>
                  <Text style={styles.settingTitle}>Max Steps</Text>
                  <Text style={styles.settingValue}>{maxSteps}</Text>
                </View>
                <Host style={styles.sliderHost}>
                  <Slider
                    value={maxSteps}
                    min={1}
                    max={20}
                    steps={19}
                    onValueChange={(value) =>
                      updateChatSettings({ maxSteps: Math.round(value) })
                    }
                  />
                </Host>
              </View>
            </View>
            <Text style={styles.settingsFooter}>
              Temperature controls response randomness. Max steps limits tool
              call iterations.
            </Text>
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
  toolsList: {
    marginTop: 8,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: colors.secondarySystemBackground as any,
    overflow: 'hidden',
  },
  toolItem: {
    paddingLeft: 16,
    backgroundColor: colors.secondarySystemBackground as any,
  },
  toolItemFirst: {
    // First item styling (handled by parent container border radius)
  },
  toolItemLast: {
    // Last item styling (handled by parent container border radius)
  },
  toolItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingRight: 16,
    minHeight: 56,
  },
  toolItemContentBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  toolItemTextContainer: {
    flex: 1,
  },
  toolItemTitle: {
    fontSize: 17,
    fontWeight: '400',
    color: colors.label as any,
  },
  toolItemDescription: {
    marginTop: 2,
    fontSize: 13,
    color: colors.secondaryLabel as any,
  },
  settingsSection: {
    marginTop: 32,
  },
  settingsCard: {
    marginTop: 8,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: colors.secondarySystemBackground as any,
    overflow: 'hidden',
  },
  settingRowSlider: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  settingRowSliderWithBorder: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator as any,
  },
  settingSliderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  settingTitle: {
    fontSize: 17,
    fontWeight: '400',
    color: colors.label as any,
  },
  settingValue: {
    fontSize: 17,
    fontWeight: '400',
    color: colors.secondaryLabel as any,
  },
  sliderHost: {
    height: 30,
  },
  settingsFooter: {
    marginTop: 8,
    paddingHorizontal: 16,
    fontSize: 13,
    color: colors.secondaryLabel as any,
    lineHeight: 18,
  },
})
