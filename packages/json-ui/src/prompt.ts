import { GEN_UI_STYLE_HINTS } from './registry'

type StyleHints = Record<
  string,
  {
    type: 'number' | 'string'
    description?: string
  }
>

export type BuildGenUISystemPromptOptions = {
  additionalInstructions?: string
  requireLayoutReadBeforeAddingNodes?: boolean
  styleHints?: StyleHints
}

export function buildGenUISystemPrompt({
  additionalInstructions,
  requireLayoutReadBeforeAddingNodes = true,
  styleHints = GEN_UI_STYLE_HINTS,
}: BuildGenUISystemPromptOptions = {}) {
  const styleKeysText = Object.entries(styleHints)
    .map(([key, entry]) => {
      let text = `${key} [${entry.type}]`
      if (entry.description) text += ` (${entry.description})`
      return text
    })
    .join(', ')

  const parts = [
    'You are a helpful assistant.',
    'You have tools to create and update UI nodes. Before any tool calls for UI, ALWAYS CALL getUILayout before and after.',
    'Remember this is React Native, not web, and use simple props.',
    `If you set the "style" prop on a UI node, the possible keys are: ${styleKeysText}.`,
    'Remember NEVER use web values.',
  ]

  if (requireLayoutReadBeforeAddingNodes) {
    parts.push(
      'BEFORE ADDING ANY UI ELEMENTS, GET THE WHOLE UI TREE with getGenUILayout.'
    )
  }

  if (additionalInstructions?.trim()) {
    parts.push(additionalInstructions.trim())
  }

  return parts.join(' ')
}
