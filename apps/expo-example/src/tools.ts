import { tool } from 'ai'
import * as Calendar from 'expo-calendar'
import _ from 'lodash'
import { z } from 'zod'

import type { ChatUISpec } from './store/chatStore'
import { GEN_UI_ROOT_ID } from './store/chatStore'
import { GEN_UI_NODE_HINTS } from './ui/genUiNodes'

/**
 * Sometimes LLMs call the tools with a string instead of an object.
 * This function parses the string if it's a valid JSON string.
 * @param props String or object
 * @returns The object or parsed string
 */
function smartParse(
  props: string | Record<string, unknown>
): Record<string, unknown> {
  return typeof props === 'string' ? JSON.parse(props) : props
}

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

/** Minimal UI spec shape for the update_ui tool (root + elements). */
export type UpdateUISpecArg = {
  root: string
  elements: Record<string, unknown>
  state?: Record<string, unknown>
}

const createId = () => _.uniqueId('UI-')

/**
 * Creates generative UI tools that read/update the chat's UI spec.
 * Root node (id "root") is undeletable. Pass getSpec(chatId) and updateSpec(chatId, spec) from the component.
 */
export function createGenUITools(
  getSpec: (chatId: string) => ChatUISpec | null,
  updateSpec: (chatId: string, spec: ChatUISpec | null) => void,
  chatId: string
) {
  const getGenUIRootNode = tool({
    description:
      'Get the root node of the generative UI tree. Returns id, type, props, and children (array of { id, type }). Root always exists with id "root".',
    inputSchema: z.object({}),
    execute: withToolErrorHandler('getGenUIRootNode', async () => {
      const spec = getSpec(chatId)
      if (!spec?.root || !spec.elements[spec.root]) return { root: null }
      const el = spec.elements[spec.root]
      const children = (el.children ?? []).map((id) => ({
        id,
        type: spec.elements[id]?.type ?? 'unknown',
      }))
      return {
        root: {
          id: spec.root,
          type: el.type,
          props: el.props,
          children,
        },
      }
    }),
  })

  const getGenUINode = tool({
    description:
      'Get a node by id. Returns id, type, props, and children (array of { id, type }). If id is omitted, returns root node.',
    inputSchema: z.object({
      id: z.string().optional().describe('Node id; omit for root'),
    }),
    execute: withToolErrorHandler('getGenUINode', async ({ id }) => {
      const spec = getSpec(chatId)
      if (!spec) return { node: null }
      const nodeId = id ?? spec.root
      const el = spec.elements[nodeId]
      if (!el) return { node: null }
      const children = (el.children ?? []).map((childId) => ({
        id: childId,
        type: spec.elements[childId]?.type ?? 'unknown',
      }))
      return {
        node: {
          id: nodeId,
          type: el.type,
          props: el.props,
          children,
        },
      }
    }),
  })

  const getGenUINodeProps = tool({
    description: 'Get the props object of a node by id.',
    inputSchema: z.object({
      id: z.string().describe('Node id'),
    }),
    execute: withToolErrorHandler('getGenUINodeProps', async ({ id }) => {
      const spec = getSpec(chatId)
      if (!spec?.elements[id]) return { props: null }
      return { props: spec.elements[id].props }
    }),
  })

  const getAvailableGenUINodes = tool({
    description: 'List nodes + props.',
    inputSchema: z.object({}),
    execute: withToolErrorHandler('getAvailableGenUINodes', async () => {
      return {
        nodes: Object.entries(GEN_UI_NODE_HINTS).map(([name, props]) => ({
          name,
          props,
        })),
      }
    }),
  })

  const setGenUINodeProps = tool({
    description: 'Set or merge props for a node by id.',
    inputSchema: z.object({
      id: z.string().describe('Node id'),
      props: z.string().describe('Props object for the node'),
      merge: z.boolean().optional().describe('Merge with existing props'),
    }),
    execute: withToolErrorHandler(
      'setGenUINodeProps',
      async ({ id, props: _props, merge = true }) => {
        const parsedProps = smartParse(_props)
        const spec = getSpec(chatId)
        if (!spec) return { success: false, message: 'No UI spec' }
        if (!spec.elements[id])
          return { success: false, message: 'Node not found' }

        const elements = { ...spec.elements }
        const current = elements[id]
        const nextProps = merge
          ? { ...current.props, ...parsedProps }
          : parsedProps
        elements[id] = { ...current, props: nextProps }

        updateSpec(chatId, { root: spec.root, elements })
        return { success: true }
      }
    ),
  })

  const deleteNode = tool({
    description:
      'Delete a node by id. Cannot delete the root node (id "root"). Removes the node and its reference from the parent\'s children.',
    inputSchema: z.object({
      id: z.string().describe('Node id to delete'),
    }),
    execute: withToolErrorHandler('deleteNode', async ({ id }) => {
      if (id === GEN_UI_ROOT_ID) {
        return { success: false, message: 'Cannot delete root node' }
      }
      const spec = getSpec(chatId)
      if (!spec) return { success: false, message: 'No UI spec' }
      const elements = { ...spec.elements }
      delete elements[id]
      for (const key of Object.keys(elements)) {
        const el = elements[key]
        if (el.children?.includes(id)) {
          elements[key] = {
            ...el,
            children: el.children.filter((c) => c !== id),
          }
        }
      }
      updateSpec(chatId, { root: spec.root, elements })
      return { success: true }
    }),
  })

  const addNode = tool({
    description:
      'Add a new node as a child of parentId. Creates element with type and props. Returns new node id. Props must be a valid JSON object.',
    inputSchema: z.object({
      parentId: z.string().describe('Parent node id'),
      type: z
        .string()
        .describe('Component type (e.g. Container, Column, Text, Button)'),
      props: z.string().optional().describe('Props object for the node'),
    }),
    execute: withToolErrorHandler(
      'addNode',
      async ({ parentId, type, props: _propsArg }) => {
        const parsedProps = smartParse(_propsArg ?? '{}')
        const spec = getSpec(chatId)
        if (!spec) return { success: false, message: 'No UI spec' }
        if (!spec.elements[parentId])
          return { success: false, message: 'Parent not found' }
        const newId = createId()
        const props = parsedProps ?? {}
        const elements = { ...spec.elements }
        elements[newId] = { type, props, children: [] }
        const parent = elements[parentId]
        elements[parentId] = {
          ...parent,
          children: [...(parent.children ?? []), newId],
        }
        updateSpec(chatId, { root: spec.root, elements })
        return { success: true, id: newId }
      }
    ),
  })

  return {
    getGenUIRootNode,
    getGenUINode,
    getGenUINodeProps,
    getAvailableGenUINodes,
    setGenUINodeProps,
    deleteNode,
    addNode,
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
