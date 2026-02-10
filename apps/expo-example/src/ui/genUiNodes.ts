import { z } from 'zod'

export const GEN_UI_NODE_NAMES = {
  Container: 'Container',
  Text: 'Text',
  Paragraph: 'Paragraph',
  Label: 'Label',
  Heading: 'Heading',
  Button: 'Button',
} as const

export const GEN_UI_NODE_NAMES_THAT_SUPPORT_CHILDREN = [
  GEN_UI_NODE_NAMES.Container,
]

export const GEN_UI_NODE_HINTS: Record<keyof typeof GEN_UI_NODE_NAMES, string> =
  {
    Container:
      'Box layout. Props: flex [number], padding [number], gap [number], style [object].',
    Text: 'Single line text. Props: text [string], style [object].',
    Paragraph: 'Long text. Props: text [string], style [object].',
    Label: 'Small label. Props: text [string], style [object].',
    Heading: 'Title text. Props: text [string], style [object].',
    Button: 'Tap button. Props: text [string], style [object].',
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
