import type { z } from 'zod'

import type { JsonUIElement } from './registry'

export type GenUIStylesConfig = Record<string, z.ZodTypeAny>

export type ParsedGenUIProps = {
  baseStyle: Record<string, unknown>
  text: string | undefined
  label: string | undefined
  props: Record<string, unknown>
}

export type ParseGenUIElementPropsOptions = {
  nodeId?: string
  type?: string
}

/**
 * Parses a JSON UI element's props into a baseStyle object (validated by style validators)
 * and common fields (text, label). Use this in custom GenUINode implementations to reuse
 * the same style and prop parsing as the default renderer.
 */
export function parseGenUIElementProps(
  element: JsonUIElement,
  styleValidators: GenUIStylesConfig,
  options?: ParseGenUIElementPropsOptions
): ParsedGenUIProps {
  const { nodeId = '', type = '' } = options ?? {}
  const props = element.props ?? {}
  const style = props.style as Record<string, unknown> | undefined
  const flex = props.flex as number | undefined
  const padding = props.padding as number | undefined
  const gap = props.gap as number | undefined
  const text = (props.text ?? props.value ?? props.label) as string | undefined
  const label = (props.label ?? props.text) as string | undefined

  const baseStyle = {
    ...(flex != null ? { flex } : {}),
    ...(padding != null ? { padding } : {}),
    ...(gap != null ? { gap } : {}),
    ...style,
  } as Record<string, unknown>

  for (const key of Object.keys(props)) {
    const validator = styleValidators[key]
    if (validator) {
      if (validator.safeParse(props[key]).success) {
        baseStyle[key] = props[key]
      } else {
        console.warn(
          `[json-ui-lite-rn] Invalid style prop: ${key} for node ${nodeId} of type ${type}: ${props[key]}`
        )
      }
    }
  }

  return { baseStyle, text, label, props }
}
