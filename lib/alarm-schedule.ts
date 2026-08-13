// Alarm scheduling math shared by the client.
//
// The client computes an absolute epoch timestamp (`fireAt`) for every task
// alarm and writes it to Firestore. The Cloudflare Worker cron reads those
// timestamps and delivers a Web Push notification when they come due, which is
// the only mechanism that works when an iOS PWA is backgrounded or closed.

import { nextRepeatOccurrence, toRepeatRule, type RepeatRule } from './repeat-rule'
import { parseAlarmTime, parseTaskDate } from './task-dates'

export interface AlarmTaskInput {
  id: string
  title: string
  detail?: string
  alarm?: string
  repeats?: string
  repeatRule?: RepeatRule
  dueDate?: string
  completed?: boolean
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

  const rule = toRepeatRule(task)

  if (rule.kind !== 'none') {
    // Intervals count from the due date when there is one, so "every 2 weeks"
    // lands on the weeks the user actually meant.
    const anchor = task.dueDate ? parseTaskDate(task.dueDate) : undefined
    const next = nextRepeatOccurrence(rule, time, now, anchor)
    return next ? next.getTime() : null
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
