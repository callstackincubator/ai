import type {
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider'
import { createAndroidProvider } from '@react-native-ai/android'

export function prompt(text: string): LanguageModelV4CallOptions['prompt'] {
  return [{ role: 'user', content: [{ type: 'text', text }] }]
}

export async function readAll(
  stream: ReadableStream<LanguageModelV4StreamPart>
) {
  const parts: LanguageModelV4StreamPart[] = []
  const reader = stream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) return parts
    parts.push(value)
  }
}

// AICore rejects requests an app sends in quick succession with a quota error
export const cooldown = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 3000))

// Function calling needs Gemini Nano 4, which ML Kit serves as the preview
// release with the fast preference
export const nano4 = createAndroidProvider({
  model: { releaseStage: 'preview', preference: 'fast' },
})
