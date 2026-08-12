// Alarm scheduling math shared by the client.
//
// The client computes an absolute epoch timestamp (`fireAt`) for every task
// alarm and writes it to Firestore. The Cloudflare Worker cron reads those
// timestamps and delivers a Web Push notification when they come due, which is
// the only mechanism that works when an iOS PWA is backgrounded or closed.

import { parseAlarmTime, parseTaskDate } from './task-dates'

export const DAY_NAME_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

export interface AlarmTaskInput {
  id: string
  title: string
  detail?: string
  alarm?: string
  repeats?: string
  dueDate?: string
  completed?: boolean
}

/** Parse a "Mon, Wed, Fri" repeat string into sorted weekday indexes (0 = Sunday). */
export function parseRepeatDays(repeats?: string): number[] {
  if (!repeats) return []

  const days = repeats
    .split(',')
    .map((day) => day.trim())
    .map((day) => DAY_NAME_TO_INDEX[day])
    .filter((index): index is number => index !== undefined)

  return Array.from(new Set(days)).sort((a, b) => a - b)
}

/**
 * Next absolute time this alarm should fire, or null when it never will again.
 * Times are resolved against the device's local timezone, which is the
 * timezone the user picked the alarm in.
 */
export function getNextFireAt(task: AlarmTaskInput, now: Date = new Date()): number | null {
  if (task.completed) return null
  if (!task.alarm) return null

  const time = parseAlarmTime(task.alarm)
  if (!time) return null

  const repeatDays = parseRepeatDays(task.repeats)

  if (repeatDays.length > 0) {
    // Repeating alarm: first matching weekday strictly in the future.
    for (let offset = 0; offset <= 7; offset++) {
      const candidate = new Date(now)
      candidate.setDate(candidate.getDate() + offset)
      candidate.setHours(time.hour, time.minute, 0, 0)

      if (candidate.getTime() <= now.getTime()) continue
      if (!repeatDays.includes(candidate.getDay())) continue

      return candidate.getTime()
    }
    return null
  }

  // One-shot alarm: on the due date when there is one, otherwise today.
  const candidate = task.dueDate ? parseTaskDate(task.dueDate) : new Date(now)
  if (Number.isNaN(candidate.getTime())) return null

  candidate.setHours(time.hour, time.minute, 0, 0)
  return candidate.getTime() > now.getTime() ? candidate.getTime() : null
}

/** IANA timezone of the current device, used by the worker to re-arm repeats. */
export function getDeviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** Deterministic Firestore document id for a user's task alarm. */
export function alarmDocId(uid: string, taskId: string): string {
  return `${uid}__${taskId}`
}
