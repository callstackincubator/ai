import { describe, expect, test } from 'bun:test'

import { StreamTextFilter } from '../streamText'

function run(
  deltas: string[],
  options: { json?: boolean; toolCode?: boolean } = {}
) {
  const filter = new StreamTextFilter({
    json: options.json ?? false,
    toolCode: options.toolCode ?? false,
  })
  const shown = deltas.map((delta) => filter.push(delta))
  return { shown, text: shown.join('') + filter.flush() }
}

describe('StreamTextFilter', () => {
  test('passes plain text through', () => {
    expect(run(['Hel', 'lo']).shown).toEqual(['Hel', 'lo'])
  })

  test('hides a tool_code block split across deltas', () => {
    const { shown, text } = run(
      ['Let me check.\n``', '`tool_', 'code\ngetWeather()\n```'],
      { toolCode: true }
    )

    expect(shown).toEqual(['Let me check.\n', '', ''])
    expect(text).toBe('Let me check.\n')
  })

  test('shows held back backticks that are not a tool_code block', () => {
    const { shown, text } = run(['Use ``', 'x`` here'], { toolCode: true })

    expect(shown).toEqual(['Use ', '``x`` here'])
    expect(text).toBe('Use ``x`` here')
  })

  test('starts a new turn after a tool call', () => {
    const filter = new StreamTextFilter({ json: false, toolCode: true })
    filter.push('```tool_code\nf()\n```')
    filter.endTurn()

    expect(filter.push('Done.')).toBe('Done.')
  })

  test('leaves tool_code text alone for other models', () => {
    expect(run(['```tool_code\nf()\n```']).text).toBe('```tool_code\nf()\n```')
  })

  test('strips JSON code fences', () => {
    expect(
      run(['``', '`json\n{"a"', ':1}', '\n`', '``'], { json: true }).text
    ).toBe('{"a":1}')
  })
})
