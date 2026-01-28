import { useRozeniteDevToolsClient } from '@rozenite/plugin-bridge'
import { useEffect, useMemo, useState } from 'react'
import { JSONTree } from 'react-json-tree'

import { AiSdkProfilerEventMap } from '../shared/client'
import { AI_SDK_PROFILER_PLUGIN_ID } from '../shared/constants'
import { AiSdkSpan } from '../shared/types'

const getAttributeString = (
  attributes: Record<string, unknown>,
  key: string
) => {
  const value = attributes[key]
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return 'unknown'
}

const formatDuration = (durationMs: number) => {
  if (durationMs < 1000) {
    return `${durationMs}ms`
  }
  return `${(durationMs / 1000).toFixed(2)}s`
}

const getOperationName = (span: AiSdkSpan) => {
  return getAttributeString(span.attributes, 'ai.operationId')
}

const getProviderName = (span: AiSdkSpan) => {
  return getAttributeString(span.attributes, 'ai.model.provider')
}

const normalizeProviderName = (provider: string) => {
  return provider.replace(/\.responses$/, '')
}

const getModelName = (span: AiSdkSpan) => {
  return getAttributeString(span.attributes, 'ai.model.id')
}

const getResourceName = (span: AiSdkSpan) => {
  return getAttributeString(span.attributes, 'resource.name')
}

const getOperationDisplayName = (span: AiSdkSpan) => {
  const operation = getOperationName(span)
  const match = /^ai\.([^.]+)/.exec(operation)
  return match?.[1] ?? operation
}

const getToolCallName = (span: AiSdkSpan) => {
  return getAttributeString(span.attributes, 'ai.toolCall.name')
}

const OPERATION_OPTIONS = [
  'generateText',
  'streamText',
  'generateObject',
  'streamObject',
  'embed',
  'embedMany',
] as const

const STRINGIFIED_JSON_KEYS = [
  'ai.response.toolCalls',
  'ai.prompt.tools',
  'ai.prompt.toolChoice',
  'ai.toolCall.args',
  'ai.prompt',
  'ai.prompt.messages',
  'ai.response.providerMetadata',
  'ai.response.object',
  'ai.schema',
  'ai.embedding',
  'ai.embeddings',
] as const

const JSON_TREE_THEME = {
  base00: 'transparent',
  base01: '#374151', // bg-gray-700
  base02: '#4b5563', // bg-gray-600
  base03: '#6b7280', // text-gray-500
  base04: '#9ca3af', // text-gray-400
  base05: '#d1d5db', // text-gray-300
  base06: '#e5e7eb', // text-gray-200
  base07: '#f9fafb', // text-gray-100
  base08: '#ef4444', // text-red-500
  base09: '#f59e0b', // text-yellow-500
  base0A: '#10b981', // text-green-500
  base0B: '#3b82f6', // text-blue-500
  base0C: '#06b6d4', // text-cyan-500
  base0D: '#8b5cf6', // text-purple-500
  base0E: '#ec4899', // text-pink-500
  base0F: '#f97316', // text-orange-500
}

const parseStringifiedJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => parseStringifiedJsonValue(item))
  }
  if (typeof value !== 'string') {
    return value
  }
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

const parseStringifiedJsonKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => parseStringifiedJsonKeys(item))
  }
  if (!value || typeof value !== 'object') {
    return value
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      const nextValue = STRINGIFIED_JSON_KEYS.includes(
        key as (typeof STRINGIFIED_JSON_KEYS)[number]
      )
        ? parseStringifiedJsonValue(entry)
        : entry
      return [key, parseStringifiedJsonKeys(nextValue)]
    })
  )
}

const terminalOperations = new Set([
  'ai.generateText',
  'ai.streamText',
  'ai.generateObject',
  'ai.streamObject',
  'ai.embed',
  'ai.embedMany',
])

type AiSdkSpanGroup = {
  id: string
  resourceName: string
  spans: AiSdkSpan[]
  isPending: boolean
}

export default function AiSdkProfilerPanel() {
  const client = useRozeniteDevToolsClient<AiSdkProfilerEventMap>({
    pluginId: AI_SDK_PROFILER_PLUGIN_ID,
  })
  const [spans, setSpans] = useState<AiSdkSpan[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(true)
  const [filterOperation, setFilterOperation] = useState('')
  const [filterProvider, setFilterProvider] = useState('')
  const [filterModel, setFilterModel] = useState('')

  useEffect(() => {
    if (!client) {
      return
    }

    const subscriptions = [
      client.onMessage('ai-sdk-span', (data) => {
        setSpans((current) => [data.span, ...current].slice(0, 500))
      }),
    ]

    client.send('ai-sdk-enable', {})

    return () => {
      subscriptions.forEach((subscription) => subscription.remove())
      client.send('ai-sdk-disable', {})
    }
  }, [client])

  const resourceGroups = useMemo(() => {
    const groups: AiSdkSpanGroup[] = []
    const activeByResource = new Map<string, number>()

    const orderedSpans = spans.slice().reverse()
    orderedSpans.forEach((span) => {
      const resourceName = getResourceName(span)

      // There can only be one active group per resourceName at a time.
      let groupIndex = activeByResource.get(resourceName)
      if (groupIndex === undefined) {
        const group = {
          id: `${resourceName}-${span.spanId}`,
          resourceName,
          spans: [span],
          isPending: true,
        }
        groups.push(group)
        groupIndex = groups.length - 1
        activeByResource.set(resourceName, groupIndex)
      } else {
        groups[groupIndex].spans.push(span)
      }

      // Mark group as closed when terminal span arrives
      if (terminalOperations.has(span.name)) {
        groups[groupIndex].isPending = false
        activeByResource.delete(resourceName)
      }
    })

    return groups
  }, [spans])

  const filteredResourceGroups = useMemo(() => {
    const matchesFilters = (span: AiSdkSpan) => {
      const provider = getProviderName(span)
      const model = getModelName(span)

      const matchOperation = filterOperation
        ? getOperationDisplayName(span) === filterOperation
        : true
      const matchProvider = filterProvider
        ? normalizeProviderName(provider) === filterProvider
        : true
      const matchModel = filterModel ? model === filterModel : true

      return matchOperation && matchProvider && matchModel
    }

    if (!filterOperation && !filterProvider && !filterModel) {
      return resourceGroups
    }
    return resourceGroups.filter((group) => group.spans.some(matchesFilters))
  }, [resourceGroups, filterOperation, filterProvider, filterModel])

  const selectedResource = useMemo(() => {
    if (!selectedGroupId) {
      return null
    }
    return (
      filteredResourceGroups.find((group) => group.id === selectedGroupId) ||
      null
    )
  }, [filteredResourceGroups, selectedGroupId])

  const filteredSteps = useMemo(() => {
    if (!selectedResource) {
      return []
    }
    return selectedResource.spans
  }, [selectedResource])

  const selectedSpan = useMemo(
    () => filteredSteps.find((span) => span.spanId === selectedSpanId) || null,
    [filteredSteps, selectedSpanId]
  )

  const providerOptions = useMemo(() => {
    const providers = new Set<string>()
    spans.forEach((span) => {
      const provider = normalizeProviderName(getProviderName(span))
      if (provider) {
        providers.add(provider)
      }
    })
    return Array.from(providers)
  }, [spans])

  const modelOptions = useMemo(() => {
    const models = new Set<string>()
    spans.forEach((span) => {
      const model = getModelName(span)
      if (model) {
        models.add(model)
      }
    })
    return Array.from(models)
  }, [spans])

  useEffect(() => {
    if (filteredResourceGroups.length === 0) {
      setSelectedGroupId(null)
      setSelectedSpanId(null)
      return
    }
    const hasSelected = selectedGroupId
      ? filteredResourceGroups.some((group) => group.id === selectedGroupId)
      : false
    if (!hasSelected) {
      setSelectedGroupId(filteredResourceGroups[0].id)
    }
  }, [filteredResourceGroups, selectedGroupId])

  useEffect(() => {
    if (filteredSteps.length === 0) {
      setSelectedSpanId(null)
      return
    }
    const hasSelected = selectedSpanId
      ? filteredSteps.some((span) => span.spanId === selectedSpanId)
      : false
    if (!hasSelected) {
      setSelectedSpanId(filteredSteps[0].spanId)
    }
  }, [filteredSteps, selectedSpanId])

  const handleToggleRecording = () => {
    if (!client) {
      return
    }
    if (isRecording) {
      client.send('ai-sdk-disable', {})
      setIsRecording(false)
    } else {
      client.send('ai-sdk-enable', {})
      setIsRecording(true)
    }
  }

  if (!client) {
    return (
      <div style={styles.loading}>
        <div>Connecting to React Native...</div>
      </div>
    )
  }

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>AI SDK Profiler</div>
          <div style={styles.subtitle}>
            OpenTelemetry spans from AI SDK requests
          </div>
        </div>
        <div style={styles.headerActions}>
          <button style={styles.button} onClick={handleToggleRecording}>
            {isRecording ? 'Pause' : 'Resume'}
          </button>
          <button
            style={styles.button}
            onClick={() => {
              setSpans([])
              setSelectedGroupId(null)
              setSelectedSpanId(null)
            }}
            disabled={spans.length === 0}
          >
            Clear
          </button>
        </div>
      </div>

      <div style={styles.filters}>
        <select
          style={styles.select}
          value={filterOperation}
          onChange={(event) => setFilterOperation(event.target.value)}
        >
          <option value="">Collected data</option>
          {OPERATION_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select
          style={styles.select}
          value={filterProvider}
          onChange={(event) => setFilterProvider(event.target.value)}
        >
          <option value="">All providers</option>
          {providerOptions.map((provider) => (
            <option key={provider} value={provider}>
              {provider}
            </option>
          ))}
        </select>
        <select
          style={styles.select}
          value={filterModel}
          onChange={(event) => setFilterModel(event.target.value)}
        >
          <option value="">All models</option>
          {modelOptions.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </div>

      <div style={styles.content}>
        <div style={styles.resources}>
          {filteredResourceGroups.length === 0 ? (
            <div style={styles.empty}>No AI SDK spans recorded yet.</div>
          ) : (
            filteredResourceGroups.map((group) => {
              return (
                <button
                  key={group.id}
                  style={{
                    ...styles.row,
                    ...(selectedGroupId === group.id ? styles.rowSelected : {}),
                  }}
                  onClick={() => setSelectedGroupId(group.id)}
                >
                  <div style={styles.rowTitle}>
                    {group.spans[0]
                      ? getOperationDisplayName(group.spans[0])
                      : 'unknown'}
                  </div>
                  <div style={styles.rowMeta}>
                    {group.resourceName} · {group.spans.length} steps ·{' '}
                    {group.isPending ? 'pending' : 'complete'}
                  </div>
                </button>
              )
            })
          )}
        </div>
        <div style={styles.steps}>
          {!selectedResource ? (
            <div style={styles.empty}>Select a resource to view spans.</div>
          ) : filteredSteps.length === 0 ? (
            <div style={styles.empty}>No spans match the filters.</div>
          ) : (
            filteredSteps.map((span) => {
              const operation = getOperationName(span)
              return (
                <button
                  key={`${span.traceId}-${span.spanId}`}
                  style={{
                    ...styles.row,
                    ...(selectedSpanId === span.spanId
                      ? styles.rowSelected
                      : {}),
                  }}
                  onClick={() => setSelectedSpanId(span.spanId)}
                >
                  <div style={styles.rowTitle}>{operation}</div>
                  <div style={styles.rowMeta}>
                    {operation === 'ai.toolCall'
                      ? getToolCallName(span)
                      : `${normalizeProviderName(getProviderName(span))} · ${getModelName(span)} · ${formatDuration(span.duration)}`}
                  </div>
                </button>
              )
            })
          )}
        </div>
        <div style={styles.details}>
          {!selectedSpan ? (
            <div style={styles.empty}>Select a span to view details.</div>
          ) : (
            <>
              <div style={styles.detailsHeader}>
                <div>
                  <div style={styles.detailsTitle}>{selectedSpan.name}</div>
                  <div style={styles.detailsSubtitle}>
                    {formatDuration(selectedSpan.duration)} ·{' '}
                    {new Date(selectedSpan.startTime).toLocaleTimeString()}
                  </div>
                </div>
                <div style={styles.tag}>
                  {getAttributeString(
                    selectedSpan.attributes,
                    'ai.operationId'
                  )}
                </div>
              </div>
              <div style={styles.section}>
                <div style={styles.sectionTitle}>Attributes</div>
                <div style={styles.code}>
                  <JSONTree
                    data={parseStringifiedJsonKeys(selectedSpan.attributes)}
                    theme={JSON_TREE_THEME}
                    invertTheme={false}
                    shouldExpandNodeInitially={(
                      keyPath: readonly (string | number)[]
                    ) => keyPath.length <= 2}
                  />
                </div>
              </div>
              {selectedSpan.events.length ? (
                <div style={styles.section}>
                  <div style={styles.sectionTitle}>Events</div>
                  <div style={styles.code}>
                    <JSONTree
                      data={parseStringifiedJsonKeys(selectedSpan.events)}
                      theme={JSON_TREE_THEME}
                      invertTheme={false}
                      shouldExpandNodeInitially={(
                        keyPath: readonly (string | number)[]
                      ) => keyPath.length <= 2}
                    />
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    fontFamily: 'Inter, system-ui, sans-serif',
    color: '#f2f2f2',
    backgroundColor: '#0b0b0b',
  },
  loading: {
    display: 'flex',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #1f1f1f',
  },
  title: {
    fontSize: 18,
    fontWeight: 600,
  },
  subtitle: {
    fontSize: 12,
    color: '#8a8a8a',
    marginTop: 4,
  },
  headerActions: {
    display: 'flex',
    gap: 8,
  },
  button: {
    backgroundColor: '#242424',
    color: '#f2f2f2',
    border: '1px solid #333',
    borderRadius: 6,
    padding: '6px 12px',
    cursor: 'pointer',
  },
  filters: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    padding: '12px 20px',
    borderBottom: '1px solid #1f1f1f',
  },
  select: {
    backgroundColor: '#101010',
    border: '1px solid #2a2a2a',
    borderRadius: 6,
    color: '#f2f2f2',
    padding: '6px 10px',
  },
  content: {
    display: 'flex',
    flex: 1,
    minHeight: 0,
  },
  resources: {
    width: 260,
    borderRight: '1px solid #1f1f1f',
    overflowY: 'auto',
  },
  steps: {
    width: 320,
    borderRight: '1px solid #1f1f1f',
    overflowY: 'auto',
  },
  row: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    width: '100%',
    padding: '12px 16px',
    borderBottom: '1px solid #1f1f1f',
    backgroundColor: 'transparent',
    color: '#f2f2f2',
    cursor: 'pointer',
    textAlign: 'left',
    border: 'none',
    outline: 'none',
    boxShadow: 'none',
    borderRadius: 0,
    boxSizing: 'border-box',
    WebkitTapHighlightColor: 'transparent',
    appearance: 'none',
  },
  rowSelected: {
    backgroundColor: '#1f1f1f',
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: 600,
  },
  rowMeta: {
    fontSize: 11,
    color: '#9a9a9a',
    marginTop: 4,
  },
  details: {
    flex: 1,
    padding: '16px 20px',
    overflowY: 'auto',
  },
  detailsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailsTitle: {
    fontSize: 16,
    fontWeight: 600,
  },
  detailsSubtitle: {
    fontSize: 12,
    color: '#9a9a9a',
    marginTop: 4,
  },
  tag: {
    backgroundColor: '#262626',
    padding: '4px 8px',
    borderRadius: 6,
    fontSize: 11,
    color: '#d1d1d1',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#9a9a9a',
    marginBottom: 8,
  },
  code: {
    backgroundColor: '#101010',
    border: '1px solid #2a2a2a',
    borderRadius: 8,
    padding: 12,
    fontSize: 12,
    whiteSpace: 'pre-wrap',
  },
  empty: {
    color: '#777',
    padding: 20,
  },
}
