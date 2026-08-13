// Shared UI-facing types.
//
// These used to live in app/page.tsx, which meant every screen component
// imported its types from a page module. They belong here instead.

import type { RepeatRule } from './repeat-rule'
import type { TaskRecord } from './storage-idb'

/** A task as the screens consume it: dates parsed, storage details resolved. */
export interface Task {
  id: string
  title: string
  type: 'picture' | 'text' | 'mixed'
  photo?: string | null
  detail?: string
  createdDate: Date
  lastEditedDate: Date
  alarm?: string
  /** Legacy "Mon, Wed, Fri" string, kept for older data and the .ics export. */
  repeats?: string
  /** Structured repeat, preferred over `repeats` when present. */
  repeatRule?: RepeatRule
  completed?: boolean
  dueDate?: string
}

export type Screen = 'tasks' | 'calendar' | 'detail' | 'add' | 'completed' | 'settings'

/** Convert a stored record into the shape the screens render. */
export function storedTaskToTask(stored: TaskRecord): Task {
  return {
    id: stored.id,
    title: stored.title,
    type: stored.photo ? 'picture' : 'text',
    photo: stored.photo || undefined,
    detail: stored.detail || undefined,
    createdDate: new Date(stored.createdAt),
    lastEditedDate: new Date(stored.updatedAt),
    alarm: stored.alarm || undefined,
    repeats: stored.repeats || undefined,
    repeatRule: stored.repeatRule,
    completed: stored.completed,
    dueDate: stored.dueDate || undefined,
  }
}
