import { tool } from 'ai'
import { z } from 'zod'

export const webSearch = tool({
  description: 'Search the web for current information',
  inputSchema: z.object({
    query: z.string().describe('Search query'),
  }),
  execute: async ({ query }) => {
    return {
      message: `Web search is not enabled in this demo. Query was: "${query}".`,
    }
  },
})

export const codeInterpreter = tool({
  description: 'Run code and analyze data',
  inputSchema: z.object({
    code: z.string().describe('Code to execute'),
  }),
  execute: async () => {
    return {
      message: 'Code Interpreter is not enabled in this demo.',
    }
  },
})

export const imageGeneration = tool({
  description: 'Create images from descriptions',
  inputSchema: z.object({
    prompt: z.string().describe('Image prompt'),
  }),
  execute: async ({ prompt }) => {
    return {
      message: `Image generation is not enabled in this demo. Prompt was: "${prompt}".`,
    }
  },
})
