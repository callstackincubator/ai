import { tool } from 'ai'
import * as Calendar from 'expo-calendar'
import { z } from 'zod'

type ToolExecutionReporter = (event: {
  toolName: string
  args: unknown
  result?: unknown
}) => void

let toolExecutionReporter: ToolExecutionReporter | null = null

export function setToolExecutionReporter(
  reporter: ToolExecutionReporter | null
) {
  toolExecutionReporter = reporter
}

/**
 * Wraps a tool execute function: on throw, logs the error and returns { error: message }.
 * Reports tool execution args & results to the toolExecutionReporter.
 */
export function withToolProxy<TArgs, TResult>(
  toolName: string,
  execute: (args: TArgs) => Promise<TResult>
): (args: TArgs) => Promise<TResult | { error: string }> {
  return async (args: TArgs) => {
    try {
      console.log('[tools] Executing tool', toolName, args)
      const result = await execute(args)
      try {
        console.log(
          '[tools] Finished tool execution with success',
          toolName,
          args,
          result
        )
        toolExecutionReporter?.({ toolName, args, result })
      } catch (reportError) {
        console.warn('[tools] Failed to report tool execution', reportError)
      }
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[tool ${toolName}]`, err)
      try {
        console.log(
          '[tools] Finished tool execution with error',
          toolName,
          args,
          { error: message }
        )
        toolExecutionReporter?.({ toolName, args, result: { error: message } })
      } catch (reportError) {
        console.warn('[tools] Failed to report tool execution', reportError)
      }
      return { error: message }
    }
  }
}

const createCalendarEvent = tool({
  title: 'createCalendarEvent',
  description: 'Create a new calendar event',
  inputSchema: z.object({
    title: z.string().describe('Event title'),
    date: z.string().describe('Event date (YYYY-MM-DD)'),
    time: z.string().optional().describe('Event time (HH:MM)'),
    duration: z.number().optional().describe('Duration in minutes'),
  }),
  execute: withToolProxy(
    'createCalendarEvent',
    async ({ title, date, time, duration = 60 }) => {
      await Calendar.requestCalendarPermissionsAsync()

      const calendars = await Calendar.getCalendarsAsync(
        Calendar.EntityTypes.EVENT
      )

      const eventDate = new Date(date)
      if (time) {
        const [hours, minutes] = time.split(':').map(Number)
        eventDate.setHours(hours, minutes)
      }

      await Calendar.createEventAsync(calendars[0].id, {
        title,
        startDate: eventDate,
        endDate: new Date(eventDate.getTime() + duration * 60 * 1000),
      })

      return { message: `Created "${title}"` }
    }
  ),
})

const checkCalendarEvents = tool({
  title: 'checkCalendarEvents',
  description: 'Check upcoming calendar events',
  inputSchema: z.object({
    days: z.number().optional().describe('Number of days to look ahead'),
  }),
  execute: withToolProxy('checkCalendarEvents', async ({ days = 7 }) => {
    await Calendar.requestCalendarPermissionsAsync()

    const calendars = await Calendar.getCalendarsAsync(
      Calendar.EntityTypes.EVENT
    )

    const startDate = new Date()
    const endDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000)

    const events = await Calendar.getEventsAsync(
      calendars.map((cal) => cal.id),
      startDate,
      endDate
    )

    return events.map((event) => ({
      title: event.title,
      date: event.startDate,
    }))
  }),
})

const getCurrentTime = tool({
  title: 'getCurrentTime',
  description: 'Get current time and date',
  inputSchema: z.object({}),
  execute: withToolProxy('getCurrentTime', async () => {
    return `Current time is: ${new Date().toUTCString()}`
  }),
})

export const toolDefinitions = {
  createCalendarEvent,
  checkCalendarEvents,
  getCurrentTime,
}
