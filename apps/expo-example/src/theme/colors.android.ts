import { PlatformColor } from 'react-native'

export const colors = {
  // Text
  label: PlatformColor('@android:color/primary_text_light'),
  secondaryLabel: PlatformColor('@android:color/secondary_text_light'),
  tertiaryLabel: PlatformColor('@android:color/tertiary_text_light'),
  placeholderText: PlatformColor('@android:color/background_light'),

  // Backgrounds
  systemBackground: PlatformColor('@android:color/background_light'),
  secondarySystemBackground: PlatformColor('@android:color/background_light'),
  tertiarySystemBackground: PlatformColor('@android:color/background_light'),

  // Fills
  tertiarySystemFill: PlatformColor('@android:color/darker_gray'),

  // Accent colors
  systemBlue: PlatformColor('@android:color/holo_blue_light'),
  systemRed: PlatformColor('@android:color/holo_red_light'),
  systemYellow: PlatformColor('@android:color/holo_orange_light'),

  // Separators
  separator: PlatformColor('@android:color/darker_gray'),
}
