import Ionicons from '@expo/vector-icons/Ionicons'
import { DrawerActions, useNavigation } from '@react-navigation/native'
import { SymbolView } from 'expo-symbols'
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { AdaptiveGlass } from '../../components/AdaptiveGlass'
import { colors } from '../../theme/colors'

type ChatHeaderProps = {
  title: string
  subtitle: string
  onOpenModelSheet: () => void
  onOpenSettingsSheet: () => void
}

export function ChatHeader({
  title,
  subtitle,
  onOpenModelSheet,
  onOpenSettingsSheet,
}: ChatHeaderProps) {
  const navigation = useNavigation()

  return (
    <View style={styles.header}>
      <AdaptiveGlass isInteractive style={styles.headerButton}>
        <Pressable
          onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
          style={styles.headerButtonPressable}
        >
          <SymbolView
            name="line.3.horizontal"
            size={20}
            tintColor={colors.label}
            resizeMode="scaleAspectFit"
            fallback={<Ionicons name="menu" size={20} color={colors.label} />}
          />
        </Pressable>
      </AdaptiveGlass>

      <Pressable onPress={onOpenModelSheet} style={styles.headerTitleContainer}>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.headerSubtitleRow}>
          <Text style={styles.headerSubtitle}>{subtitle}</Text>
          <SymbolView
            name="chevron.down"
            size={12}
            tintColor={colors.secondaryLabel}
            resizeMode="scaleAspectFit"
            fallback={
              <Ionicons
                name="chevron-down"
                size={12}
                color={colors.secondaryLabel}
              />
            }
          />
        </View>
      </Pressable>

      <AdaptiveGlass isInteractive style={styles.headerButton}>
        <Pressable
          onPress={onOpenSettingsSheet}
          style={styles.headerButtonPressable}
        >
          <SymbolView
            name="slider.horizontal.3"
            size={20}
            tintColor={colors.label}
            resizeMode="scaleAspectFit"
            fallback={
              <Ionicons
                name="settings-outline"
                size={20}
                color={colors.label}
              />
            }
          />
        </Pressable>
      </AdaptiveGlass>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  headerButton: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  headerButtonPressable: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.label as any,
  },
  headerSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.secondaryLabel as any,
  },
})
