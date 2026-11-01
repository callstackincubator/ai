import { android } from '@react-native-ai/android'
import { describe, expect, it } from 'react-native-harness'

import { cats } from '../fixtures'
import { cooldown } from './helpers'

const article =
  'The city council approved a plan on Tuesday to turn the old rail yard into a park. ' +
  'The project will add twelve acres of green space, a playground and a community garden. ' +
  'Construction starts next spring and is expected to take two years. Funding comes from a ' +
  'state grant and a local bond measure that voters passed last fall. Residents who spoke at ' +
  'the meeting mostly supported the plan, though some asked for more parking near the entrance.'

describe('android task apis', () => {
  it('reports each task', async () => {
    for (const task of [
      android.summarizer(),
      android.proofreader(),
      android.rewriter(),
      android.imageDescriber(),
    ]) {
      const info = await task.getModelInfo()
      console.log('[android] task:', task.constructor.name, info.availability)
      expect(info.availability).not.toBe('unknown')
    }
  })

  it('summarizes an article into bullets', async () => {
    const summarizer = android.summarizer({ outputType: 'twoBullets' })
    await summarizer.prepare()

    const chunks: string[] = []
    const summary = await summarizer.summarize(article, {
      onText: (text) => chunks.push(text),
    })
    console.log('[android] summary:', JSON.stringify(summary), chunks.length)

    expect(summary.toLowerCase()).toContain('park')
    // Each chunk is new text, not the text so far
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join('').trim()).toBe(summary.trim())
    await cooldown()
  })

  it('proofreads a sentence', async () => {
    const proofreader = android.proofreader()
    await proofreader.prepare()

    const suggestions = await proofreader.proofread(
      'The praject is compleet but needs too be reviewd'
    )
    console.log('[android] proofread:', JSON.stringify(suggestions))

    expect(suggestions[0]).toContain('project')
    await cooldown()
  })

  it('rewrites a sentence in a style', async () => {
    const rewriter = android.rewriter({ style: 'professional' })
    await rewriter.prepare()

    const suggestions = await rewriter.rewrite(
      'hey, cant make it today, lets do tmrw'
    )
    console.log('[android] rewrite:', JSON.stringify(suggestions))

    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions[0]!.length).toBeGreaterThan(0)
    await cooldown()
  })

  it('describes an image', async () => {
    const describer = android.imageDescriber()
    await describer.prepare()

    const description = await describer.describe(cats)
    console.log('[android] description:', JSON.stringify(description))

    expect(description.toLowerCase()).toMatch(/cat|kitten/)
    await cooldown()
  })

  it('stops when aborted', async () => {
    const summarizer = android.summarizer()
    await summarizer.prepare()
    const controller = new AbortController()

    const result = summarizer.summarize(article, {
      abortSignal: controller.signal,
    })
    controller.abort()

    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    await cooldown()
  })
})
