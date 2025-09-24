import { tool } from 'ai'
import * as Battery from 'expo-battery'
import * as Calendar from 'expo-calendar'
import * as Contacts from 'expo-contacts'
import { Alert, Linking } from 'react-native'
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
    const now = new Date()
    const currentDay = now.toDateString()
    const currentTime = now.toTimeString()

    return `Current day: ${currentDay}\nCurrent time: ${currentTime}`
  },
})

/**
 * Get device battery level
 */
export const getBatteryLevel = tool({
  description: 'Get current battery level of the device',
  inputSchema: z.object({}),
  execute: async () => {
    const batteryLevel = await Battery.getBatteryLevelAsync()
    const batteryState = await Battery.getBatteryStateAsync()

    const percentage = Math.round(batteryLevel * 100)
    const state = Battery.BatteryState[batteryState]

    return {
      level: percentage,
      state,
      message: `Battery level: ${percentage}% (${state})`,
    }
  },
})

/**
 * List all contacts from the device
 */
export const listContacts = tool({
  description: 'List all contacts from the device with their basic information',
  inputSchema: z.object({
    limit: z
      .number()
      .optional()
      .describe('Maximum number of contacts to return'),
    fields: z
      .array(z.string())
      .optional()
      .describe(
        'Specific fields to retrieve (firstName, lastName, emails, phoneNumbers, etc.)'
      ),
  }),
  execute: async ({ limit, fields }) => {
    // Request permissions first
    const { status } = await Contacts.requestPermissionsAsync()

    if (status !== 'granted') {
      return {
        error: 'Contacts permission not granted',
        contacts: [],
        message: 'Permission to access contacts was denied',
      }
    }

    // Define which fields to retrieve
    const contactFields: Contacts.FieldType[] = fields
      ? fields.map((field) => {
          // Map common field names to Contacts.Fields constants
          const fieldMap: Record<string, Contacts.FieldType> = {
            firstName: Contacts.Fields.FirstName,
            lastName: Contacts.Fields.LastName,
            emails: Contacts.Fields.Emails,
            phoneNumbers: Contacts.Fields.PhoneNumbers,
            company: Contacts.Fields.Company,
            jobTitle: Contacts.Fields.JobTitle,
            name: Contacts.Fields.Name,
          }
          return fieldMap[field] || (field as Contacts.FieldType)
        })
      : [
          Contacts.Fields.FirstName,
          Contacts.Fields.LastName,
          Contacts.Fields.Emails,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Company,
        ]

    try {
      const { data } = await Contacts.getContactsAsync({
        fields: contactFields,
        pageSize: limit || 100,
        pageOffset: 0,
      })

      const processedContacts = data.map((contact) => ({
        id: contact.id,
        firstName: contact.firstName || '',
        lastName: contact.lastName || '',
        name:
          contact.name ||
          `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
        emails: contact.emails?.map((email) => email.email) || [],
        phoneNumbers: contact.phoneNumbers?.map((phone) => phone.number) || [],
        company: contact.company || '',
        jobTitle: contact.jobTitle || '',
      }))

      return {
        contacts: processedContacts,
        count: processedContacts.length,
        message: `Found ${processedContacts.length} contacts`,
      }
    } catch (error) {
      return {
        error: 'Failed to retrieve contacts',
        contacts: [],
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  },
})

/**
 * Open email app with pre-filled recipient
 */
export const openEmail = tool({
  description: 'Open email app',
  inputSchema: z.object({
    email: z.string().describe('Email address to send to'),
    subject: z.string().optional().describe('Email subject line'),
  }),
  execute: async ({ email, subject }) => {
    Linking.openURL(`mailto:${email}?subject=${subject}`)
    return { message: 'Email app opened' }
  },
})
