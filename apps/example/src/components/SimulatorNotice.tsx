import { SymbolView } from 'expo-symbols'
import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { isSimulator } from '../simulator'
import { colors } from '../theme/colors'

// Says when a stand-in replaces something the Simulator cannot run
export function SimulatorNotice({ children }: { children: string }) {
  if (!isSimulator) return null
  return (
    <View style={styles.notice}>
      <SymbolView name="hammer" size={14} tintColor={colors.secondaryLabel} />
      <Text style={styles.text}>{children}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: colors.tertiarySystemFill,
  },
  text: {
    flex: 1,
    fontSize: 13,
    color: colors.secondaryLabel,
  },
})
