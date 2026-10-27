import { requireNativeModule } from 'expo-modules-core'

export type ThermalState = 'nominal' | 'fair' | 'serious' | 'critical'

type DeviceStatsModule = {
  getFootprint(): number
  getLifetimePeakFootprint(): number
  startSampling(intervalMs: number): void
  stopSampling(): number
  getThermalState(): ThermalState
  isLowPowerModeEnabled(): boolean
}

// Memory footprint in bytes and thermal state, for the runtime benchmarks in
// harness/benchmarks
export default requireNativeModule<DeviceStatsModule>('DeviceStats')
