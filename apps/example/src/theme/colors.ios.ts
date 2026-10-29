import { DynamicColorIOS, PlatformColor } from 'react-native'

import { accent } from './brand'

export const colors = {
  // Text
  label: PlatformColor('label'),
  secondaryLabel: PlatformColor('secondaryLabel'),
  tertiaryLabel: PlatformColor('tertiaryLabel'),
  placeholderText: PlatformColor('placeholderText'),

  // Backgrounds
  systemBackground: PlatformColor('systemBackground'),
  secondarySystemBackground: PlatformColor('secondarySystemBackground'),
  tertiarySystemBackground: PlatformColor('tertiarySystemBackground'),

  // Fills
  secondarySystemFill: PlatformColor('secondarySystemFill'),
  tertiarySystemFill: PlatformColor('tertiarySystemFill'),

  // Accent colors
  systemBlue: PlatformColor('systemBlue'),
  systemRed: PlatformColor('systemRed'),
  systemYellow: PlatformColor('systemYellow'),
  systemGreen: PlatformColor('systemGreen'),
  systemIndigo: PlatformColor('systemIndigo'),

  // Brand: the fill, and a darker shade for text on light backgrounds
  accent,
  accentText: DynamicColorIOS({ light: '#32744b', dark: accent }),

  // Separators
  separator: PlatformColor('separator'),
}
