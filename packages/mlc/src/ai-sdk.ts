import { MlcProvider } from './mlc-provider'

/**
 * Default MLC provider instance.
 */
export const mlc = () => new MlcProvider()

/**
 * Create a custom MLC provider with specific configuration.
 */
export function createMlcProvider(options?: { modelId?: string }) {
  return () => new MlcProvider(options?.modelId)
}
