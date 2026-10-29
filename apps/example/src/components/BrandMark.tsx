import React from 'react'
import { StyleSheet, View } from 'react-native'

import { accent } from '../theme/brand'

// The React Native AI chip mark from docs/DESIGN.md, one square per #
const rows = [
  '..#.#.#..',
  '.........',
  '#.#####.#',
  '..#...#..',
  '#.#.#.#.#',
  '..#...#..',
  '#.#####.#',
  '.........',
  '..#.#.#..',
]

export function BrandMark({ size = 54 }: { size?: number }) {
  // Whole pixels keep the squares crisp
  const cell = Math.max(1, Math.round(size / 9))
  return (
    <View style={{ width: cell * 9, height: cell * 9 }}>
      {rows.map((row, y) =>
        [...row].map((char, x) =>
          char === '#' ? (
            <View
              key={`${x}-${y}`}
              style={[
                styles.cell,
                { left: x * cell, top: y * cell, width: cell, height: cell },
              ]}
            />
          ) : null
        )
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  cell: {
    position: 'absolute',
    backgroundColor: accent,
  },
})
