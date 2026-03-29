import type { TurboModule } from 'react-native'

import { unsupportedSync } from './unsupportedPlatform'

export interface Spec extends TurboModule {
  getCurrentLocale(): string
}

export default {
  getCurrentLocale: () => unsupportedSync('Apple utilities'),
} satisfies Spec
