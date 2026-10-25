import { apple } from '@react-native-ai/apple'
import { beforeAll, describe, expect, it } from 'react-native-harness'

import { invoice, qrCode } from '../fixtures'
import { answer, imagePrompt } from './helpers'

// Simulators do not have the Vision tools

beforeAll(async () => {
  expect((await apple.getModelInfo()).supportsVisionTools).toBe(true)
})

describe('apple vision tools', () => {
  const ocr = { apple: { builtInTools: ['ocr'] } }

  it('reads text with the ocr tool', async () => {
    expect(
      await answer({
        prompt: imagePrompt('What is the invoice number in this image?', {
          data: invoice,
        }),
        providerOptions: ocr,
      })
    ).toEqual(expect.arrayContaining([expect.stringContaining('4721')]))
  })

  it('reads text from an image labelled with its filename', async () => {
    expect(
      await answer({
        prompt: imagePrompt('What is the invoice number in invoice.png?', {
          data: invoice,
          filename: 'invoice.png',
        }),
        providerOptions: ocr,
      })
    ).toEqual(expect.arrayContaining([expect.stringContaining('4721')]))
  })

  it('reads a qr code with the barcode tool', async () => {
    expect(
      await answer({
        prompt: imagePrompt('What does the QR code in this image say?', {
          data: qrCode,
        }),
        providerOptions: { apple: { builtInTools: ['barcode'] } },
      })
    ).toEqual(expect.arrayContaining([expect.stringContaining('HARNESS-42')]))
  })
})
