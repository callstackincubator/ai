import type { TurboModule } from 'react-native'

import {
  getOptionalTurboModule,
  unsupportedSync,
} from './unsupportedPlatform'

export interface Spec extends TurboModule {
  getCurrentLocale(): string
}

const NativeAppleUtils =
  getOptionalTurboModule<Spec>('NativeAppleUtils') ?? {
    getCurrentLocale: () => unsupportedSync('Apple utilities'),
  }

export default NativeAppleUtils
