import { z } from 'zod'

export type JsonUIElement = {
  type: string
  props: Record<string, unknown>
  children?: string[]
}

export type JsonUISpec = {
  root: string
  elements: Record<string, JsonUIElement>
}

export const DEFAULT_GEN_UI_ROOT_ID = 'root'

export const GEN_UI_NODE_NAMES = {
  Text: 'Text',
  Paragraph: 'Paragraph',
  Label: 'Label',
  Heading: 'Heading',
  Button: 'Button',
  TextInput: 'TextInput',
} as const

export const GEN_UI_NODE_NAMES_THAT_SUPPORT_CHILDREN: string[] = []

export const GEN_UI_NODE_HINTS: Record<keyof typeof GEN_UI_NODE_NAMES, string> =
  {
    Text: 'Single line text. Props: text [string], style [object].',
    Paragraph: 'Long text. Props: text [string], style [object].',
    Label: 'Small label. Props: text [string], style [object].',
    Heading: 'Title text. Props: text [string], style [object].',
    Button: 'Tap button. Props: text [string], style [object].',
    TextInput:
      'Single line text input. Props: placeholder [string], style [object].',
  }

export const GEN_UI_STYLES = {
  flex: z.number(),
  padding: z.number(),
  gap: z.number(),
  backgroundColor: z.string(),
  color: z.string(),
  fontSize: z.number(),
  fontWeight: z.string(),
  textAlign: z.string(),
}

export const GEN_UI_STYLE_HINTS: Record<
  keyof typeof GEN_UI_STYLES,
  { type: 'number' | 'string'; description?: string }
> = {
  flex: { type: 'number', description: 'Flex grow/shrink basis value.' },
  padding: {
    type: 'number',
    description: 'Padding in density-independent px.',
  },
  gap: {
    type: 'number',
    description: 'Spacing between children in density-independent px.',
  },
  backgroundColor: { type: 'string', description: 'React Native color value.' },
  color: { type: 'string', description: 'Text color value.' },
  fontSize: { type: 'number', description: 'Font size in points.' },
  fontWeight: {
    type: 'string',
    description: 'Font weight string like "400", "600", "bold".',
  },
  textAlign: {
    type: 'string',
    description: 'Text alignment, for example "left", "center", "right".',
  },
}
