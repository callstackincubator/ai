import { GenerativeUIView as PackageGenerativeUIView } from 'json-ui-lite-rn'

import type { ChatUISpec } from '../../store/chatStore'

type GenerativeUIViewProps = {
  /** Normalized spec (root + elements with root node "root"). */
  spec: ChatUISpec | null | undefined
  loading?: boolean
}

export function GenerativeUIView({ spec, loading }: GenerativeUIViewProps) {
  return <PackageGenerativeUIView spec={spec} loading={loading} />
}
