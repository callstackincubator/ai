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
      void previousAdapter.current.unload()
    }
    previousAdapter.current = adapter
    void adapter.prepare()
  }, [adapter])

  return null
}
