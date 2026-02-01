import type { LanguageModelV3 } from '@ai-sdk/provider'
import { useEffect, useRef } from 'react'

import type { SetupAdapter } from '../config/providers'

/**
 * Manages model lifecycle - unloads previous model and prepares new one on change.
 */
export function ModelLifecycleManager({
  adapter,
}: {
  adapter: SetupAdapter<LanguageModelV3>
}) {
  const previousAdapter = useRef<SetupAdapter<LanguageModelV3> | null>(null)

  useEffect(() => {
    if (previousAdapter.current && previousAdapter.current !== adapter) {
      previousAdapter.current.unload()
    }
    previousAdapter.current = adapter
    adapter.prepare()
    return () => {
      adapter.unload()
    }
  }, [adapter])

  return null
}
