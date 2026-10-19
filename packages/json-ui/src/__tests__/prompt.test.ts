import { describe, expect, test } from 'bun:test'

import { buildGenUISystemPrompt } from '../prompt'

describe('buildGenUISystemPrompt', () => {
  test('includes style hints rendered from the registry by default', () => {
    const prompt = buildGenUISystemPrompt()

    expect(prompt).toContain('flex [number] (Flex grow/shrink basis value.)')
    expect(prompt).toContain('backgroundColor [string]')
    expect(prompt).toContain(
      'BEFORE ADDING ANY UI ELEMENTS, GET THE WHOLE UI TREE with getGenUILayout.'
    )
  })

  test('omits the layout-read instruction when disabled', () => {
    const prompt = buildGenUISystemPrompt({
      requireLayoutReadBeforeAddingNodes: false,
    })

    expect(prompt).not.toContain('GET THE WHOLE UI TREE')
  })

  test('appends trimmed additional instructions', () => {
    const prompt = buildGenUISystemPrompt({
      additionalInstructions: '  use dark colors  ',
    })

    expect(prompt.endsWith('use dark colors')).toBe(true)
  })

  test('skips blank additional instructions', () => {
    const prompt = buildGenUISystemPrompt({
      additionalInstructions: '   ',
      requireLayoutReadBeforeAddingNodes: false,
    })

    expect(prompt.endsWith('Remember NEVER use web values.')).toBe(true)
  })

  test('renders custom style hints, with and without descriptions', () => {
    const prompt = buildGenUISystemPrompt({
      styleHints: {
        margin: { type: 'number', description: 'Outer spacing.' },
        opacity: { type: 'number' },
      },
    })

    expect(prompt).toContain('margin [number] (Outer spacing.)')
    expect(prompt).toContain('opacity [number]')
    expect(prompt).not.toContain('flex [number]')
  })
})
