import { describe, expect, test } from 'bun:test'
import { z } from 'zod'

import { parseGenUIElementProps } from '../parseGenUIProps'
import { GEN_UI_STYLES, type JsonUIElement } from '../registry'

describe('parseGenUIElementProps', () => {
  test('promotes flex, padding and gap into the base style', () => {
    const element: JsonUIElement = {
      type: 'Text',
      props: { flex: 1, padding: 8, gap: 4 },
    }

    const { baseStyle } = parseGenUIElementProps(element, GEN_UI_STYLES)

    expect(baseStyle).toEqual({ flex: 1, padding: 8, gap: 4 })
  })

  test('validated shorthand props are re-applied over the style object', () => {
    const element: JsonUIElement = {
      type: 'Text',
      props: { padding: 8, style: { padding: 16, color: 'red' } },
    }

    const { baseStyle } = parseGenUIElementProps(element, GEN_UI_STYLES)

    expect(baseStyle).toEqual({ padding: 8, color: 'red' })

    const invalidShorthand: JsonUIElement = {
      type: 'Text',
      props: { padding: 'lots', style: { padding: 16 } },
    }

    const originalWarn = console.warn
    console.warn = () => undefined
    try {
      expect(
        parseGenUIElementProps(invalidShorthand, GEN_UI_STYLES).baseStyle
      ).toEqual({ padding: 16 })
    } finally {
      console.warn = originalWarn
    }
  })

  test('keeps zero-valued shorthands', () => {
    const element: JsonUIElement = {
      type: 'Text',
      props: { flex: 0, padding: 0, gap: 0 },
    }

    const { baseStyle } = parseGenUIElementProps(element, GEN_UI_STYLES)

    expect(baseStyle).toEqual({ flex: 0, padding: 0, gap: 0 })
  })

  test('copies style-validated props and skips invalid ones with a warning', () => {
    const warnings: unknown[][] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => warnings.push(args)

    try {
      const element: JsonUIElement = {
        type: 'Text',
        props: { fontSize: 24, fontWeight: 'bold' },
      }

      const validators = {
        fontSize: z.number(),
        fontWeight: z.enum(['bold', 'normal']),
        textAlign: z.string(),
      }

      const { baseStyle } = parseGenUIElementProps(element, validators, {
        nodeId: 'n1',
        type: 'Text',
      })

      expect(baseStyle).toEqual({ fontSize: 24, fontWeight: 'bold' })
      expect(warnings).toEqual([])

      const bad: JsonUIElement = {
        type: 'Text',
        props: { fontSize: 'huge' },
      }
      const parsed = parseGenUIElementProps(bad, validators, {
        nodeId: 'n2',
        type: 'Text',
      })

      expect(parsed.baseStyle).toEqual({})
      expect(warnings).toHaveLength(1)
      expect(String(warnings[0][0])).toContain('Invalid style prop: fontSize')
      expect(String(warnings[0][0])).toContain('n2')
    } finally {
      console.warn = originalWarn
    }
  })

  test('ignores props without a validator', () => {
    const element: JsonUIElement = {
      type: 'Button',
      props: { onPress: 'noop', text: 'Tap me' },
    }

    const { baseStyle, props } = parseGenUIElementProps(element, GEN_UI_STYLES)

    expect(baseStyle).toEqual({})
    expect(props.onPress).toBe('noop')
  })

  test('resolves text and label from the prop fallback chain', () => {
    const { text, label } = parseGenUIElementProps(
      { type: 'Text', props: { label: 'primary label', text: 'alt text' } },
      GEN_UI_STYLES
    )

    expect(text).toBe('alt text')
    expect(label).toBe('primary label')
  })

  test('falls back to value for text and is undefined when nothing is set', () => {
    const parsed = parseGenUIElementProps(
      { type: 'TextInput', props: { value: 'typed' } },
      GEN_UI_STYLES
    )

    expect(parsed.text).toBe('typed')
    expect(parsed.label).toBeUndefined()
  })

  test('handles elements without props', () => {
    const element = { type: 'Text' } as JsonUIElement

    const parsed = parseGenUIElementProps(element, GEN_UI_STYLES)

    expect(parsed.baseStyle).toEqual({})
    expect(parsed.text).toBeUndefined()
    expect(parsed.label).toBeUndefined()
    expect(parsed.props).toEqual({})
  })
})
