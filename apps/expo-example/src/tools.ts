import { tool } from 'ai'
import * as Calendar from 'expo-calendar'
import { z } from 'zod'

export { setToolExecutionReporter } from 'json-ui-lite-rn'

/**
 * Wraps a tool execute function: on throw, logs the error and returns { error: message }.
 */
function withToolErrorHandler<TArgs, TResult>(
  toolName: string,
  execute: (args: TArgs) => Promise<TResult>
): (args: TArgs) => Promise<TResult | { error: string }> {
  return async (args: TArgs) => {
    try {
      console.log('[tools] Executing tool', toolName, args)
      return await execute(args)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[tool ${toolName}]`, err)
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
  execute: withToolErrorHandler(
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
  execute: withToolErrorHandler('checkCalendarEvents', async ({ days = 7 }) => {
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
  execute: withToolErrorHandler('getCurrentTime', async () => {
    return `Current time is: ${new Date().toUTCString()}`
  }),
})

export const toolDefinitions = {
  createCalendarEvent,
  checkCalendarEvents,
  getCurrentTime,
}
