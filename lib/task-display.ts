// How a task is described on screen: the one-line summary under its name,
// the date group it falls into, and when its reminder rings next.
//
// Kept free of React so the grid, the calendar and the properties window all
// word things the same way.

import type { Task } from './task'
import { getNextFireAt } from './alarm-schedule'
import { parseTaskDate } from './task-dates'
import {
  DAY_NAMES,
  DAY_PICKER_ORDER,
  isRepeating,
  ruleOccursOnDate,
  toRepeatRule,
  type RepeatRule,
} from './repeat-rule'

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function startOfDay(date: Date): Date {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

/** Whole days from `today` to `date`, negative when it is in the past. */
export function daysFromToday(date: Date, today: Date = new Date()): number {
  return Math.round((startOfDay(date).getTime() - startOfDay(today).getTime()) / 86_400_000)
}

export function shortDate(date: Date): string {
  return `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}`
}

/** "Today", "Tomorrow", "Thursday" within the week, otherwise "Wed, Oct 14". */
export function relativeDay(date: Date, today: Date = new Date()): string {
  const days = daysFromToday(date, today)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  if (days < 0) return `Overdue, ${shortDate(date)}`
  if (days < 7) return DAYS_LONG[date.getDay()]
  return `${DAY_NAMES[date.getDay()]}, ${shortDate(date)}`
}

/** Monday-first day list, e.g. "Mon, Wed, Fri". */
export function weekdayList(days: number[]): string {
  return DAY_PICKER_ORDER.filter((day) => days.includes(day)).map((day) => DAY_NAMES[day]).join(', ')
}

export function repeatSummary(rule: RepeatRule): string {
  switch (rule.kind) {
    case 'none':
      return ''
    case 'daily':
      return rule.interval === 1 ? 'Every day' : `Every ${rule.interval} days`
    case 'weekly':
      return (rule.interval === 1 ? '' : `Every ${rule.interval} weeks, `) + weekdayList(rule.days)
    case 'monthly':
      return `Monthly on day ${rule.dayOfMonth}`
  }
}

/** The grey line under a task's name in Tiles view. */
export function taskSummary(task: Task, today: Date = new Date()): string {
  const rule = toRepeatRule(task)
  if (task.completed) return task.dueDate ? `Done, due ${shortDate(parseTaskDate(task.dueDate))}` : 'Done'
  if (isRepeating(rule)) return repeatSummary(rule) + (task.alarm ? ` at ${task.alarm}` : '')
  if (task.dueDate) return relativeDay(parseTaskDate(task.dueDate), today) + (task.alarm ? `, ${task.alarm}` : '')
  if (task.detail) return task.detail.split(/[.\n]/)[0]
  return task.alarm ? `Alarm at ${task.alarm}` : 'No due date'
}

/** The narrow "Due" column in Details view. */
export function taskDueColumn(task: Task, today: Date = new Date()): string {
  if (task.completed) return 'Done'
  const rule = toRepeatRule(task)
  if (rule.kind === 'weekly') return weekdayList(rule.days)
  if (isRepeating(rule)) return repeatSummary(rule)
  if (!task.dueDate) return task.alarm ?? ''
  const due = parseTaskDate(task.dueDate)
  const days = daysFromToday(due, today)
  const day = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : shortDate(due)
  return day + (task.alarm ? ` ${task.alarm}` : '')
}

export const TASK_GROUPS = ['Overdue', 'Today', 'Tomorrow', 'Next 7 days', 'Later', 'Repeating', 'No due date'] as const
export type TaskGroup = (typeof TASK_GROUPS)[number]

export function taskGroup(task: Task, today: Date = new Date()): TaskGroup {
  if (isRepeating(toRepeatRule(task))) return 'Repeating'
  if (!task.dueDate) return 'No due date'
  const days = daysFromToday(parseTaskDate(task.dueDate), today)
  if (days < 0) return 'Overdue'
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days < 7) return 'Next 7 days'
  return 'Later'
}

/**
 * Whether a task shows up on a calendar day: its due date, a repeat, or, for
 * an alarm with neither, today (that is when a one-shot alarm rings).
 */
export function taskOccursOn(task: Task, date: Date, today: Date = new Date()): boolean {
  if (task.dueDate) {
    if (daysFromToday(parseTaskDate(task.dueDate), date) === 0) return true
  }
  const rule = toRepeatRule(task)
  if (isRepeating(rule)) return ruleOccursOnDate(rule, date, task.dueDate ? parseTaskDate(task.dueDate) : undefined)
  return Boolean(task.alarm && !task.dueDate && daysFromToday(date, today) === 0)
}

type ReminderSource = Pick<Task, 'alarm' | 'dueDate' | 'repeatRule' | 'repeats'>

/** The yellow note on the Reminder tab, worded from the real alarm schedule. */
export function nextReminderText(task: ReminderSource, now: Date = new Date()): string {
  if (!task.alarm) return 'Turn on the alarm to get a reminder for this task.'
  const fireAt = getNextFireAt({ id: '', title: '', ...task }, now)
  if (fireAt === null) return 'The alarm time has passed, so no reminder is scheduled.'
  return `Next reminder: ${relativeDay(new Date(fireAt), now)} at ${task.alarm}.`
}
