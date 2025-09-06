import { tool } from 'ai'
import * as Calendar from 'expo-calendar'
import { z } from 'zod'

/**
 * Creates a new calendar event with specified title, date, time and duration
 */
export const createCalendarEvent = tool({
  description: 'Create a new calendar event',
  inputSchema: z.object({
    title: z.string().describe('Event title'),
    date: z.string().describe('Event date (YYYY-MM-DD)'),
    time: z.string().optional().describe('Event time (HH:MM)'),
    duration: z.number().optional().describe('Duration in minutes'),
  }),
  execute: async ({ title, date, time, duration = 60 }) => {
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
  },
})

/**
 * Retrieves upcoming calendar events for a specified number of days
 */
export const checkCalendarEvents = tool({
  description: 'Check upcoming calendar events',
  inputSchema: z.object({
    days: z.number().optional().describe('Number of days to look ahead'),
  }),
  execute: async ({ days = 7 }) => {
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
  },
})

/**
 * Get current time
 */
export const getCurrentTime = tool({
  description: 'Get current time and date',
  inputSchema: z.object({}),
  execute: async () => {
    return `Current time is: ${new Date().toUTCString()}`
  },
})
