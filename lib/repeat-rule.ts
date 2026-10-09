// Single source of truth for how a task alarm repeats.
//
// Repeats used to live only as a "Mon, Wed, Fri" string that four different
// modules each parsed by hand. That string is still written to Firestore so
// older clients and the calendar export keep working, but the structured
// `repeatRule` map is what everything reads.
//
// The Cloudflare Worker keeps its own copy of the parsing in
// worker/src/schedule.ts, because that package deliberately has no runtime
// dependencies. tests/repeat-rule-parity.test.ts asserts the two agree; if it
// ever fails, fix both sides rather than one.

export type RepeatRule =
  | { kind: 'none' }
  | { kind: 'daily'; interval: number }
  | { kind: 'weekly'; days: number[]; interval: number }
  | { kind: 'monthly'; dayOfMonth: number }

/** Weekday index, 0 = Sunday, matching Date#getDay. */
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** Order the day picker shows, Monday first. */
export const DAY_PICKER_ORDER = [1, 2, 3, 4, 5, 6, 0]

const DAY_NAME_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

export const NO_REPEAT: RepeatRule = { kind: 'none' }

function clampInterval(value: unknown): number {
  const interval = Math.trunc(Number(value))
  return Number.isFinite(interval) && interval >= 1 ? Math.min(interval, 52) : 1
}

function normalizeDays(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  const days = value
    .map((day) => Math.trunc(Number(day)))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
  return Array.from(new Set(days)).sort((a, b) => a - b)
}

/** Parse the legacy "Mon, Wed, Fri" string into weekday indexes. */
export function parseLegacyRepeats(repeats: string | null | undefined): number[] {
  if (!repeats) return []
  return normalizeDays(
    repeats
      .split(',')
      .map((day) => DAY_NAME_TO_INDEX[day.trim()])
      .filter((day) => day !== undefined)
  )
}

/**
 * Read a rule from whatever a task carries: the structured field when present,
 * otherwise the legacy string.
 */
export function toRepeatRule(source: {
  repeatRule?: unknown
  repeats?: string | null
}): RepeatRule {
  const raw = source.repeatRule

  if (raw && typeof raw === 'object') {
    const rule = raw as Record<string, unknown>

    if (rule.kind === 'daily') {
      return { kind: 'daily', interval: clampInterval(rule.interval) }
    }

    if (rule.kind === 'weekly') {
      const days = normalizeDays(rule.days)
      if (days.length > 0) {
        return { kind: 'weekly', days, interval: clampInterval(rule.interval) }
      }
    }

    if (rule.kind === 'monthly') {
      const dayOfMonth = Math.trunc(Number(rule.dayOfMonth))
      if (dayOfMonth >= 1 && dayOfMonth <= 31) return { kind: 'monthly', dayOfMonth }
    }

    if (rule.kind === 'none') return NO_REPEAT
  }

  const legacyDays = parseLegacyRepeats(source.repeats)
  return legacyDays.length > 0 ? { kind: 'weekly', days: legacyDays, interval: 1 } : NO_REPEAT
}

/**
 * Legacy string for a rule, or undefined when it cannot be expressed as one.
 * Kept so the .ics export and any older client keep behaving.
 */
export function toLegacyRepeats(rule: RepeatRule): string | undefined {
  if (rule.kind === 'weekly') {
    return rule.days.map((day) => DAY_NAMES[day]).join(', ')
  }
  if (rule.kind === 'daily') {
    return DAY_NAMES.join(', ')
  }
  return undefined
}

export function isRepeating(rule: RepeatRule): boolean {
  return rule.kind !== 'none'
}


function startOfDay(date: Date): Date {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

/** Whole days between two local dates, ignoring the time of day. */
function daysBetween(from: Date, to: Date): number {
  const millisPerDay = 24 * 60 * 60 * 1000
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / millisPerDay)
}

/**
 * Next time this rule fires strictly after `after`, in local time.
 *
 * `anchor` is the day the schedule counts intervals from — the task's due date
 * when it has one, so "every 2 weeks" lands on the weeks the user meant.
 * Returns null for non-repeating rules.
 */
export function nextRepeatOccurrence(
  rule: RepeatRule,
  time: { hour: number; minute: number },
  after: Date,
  anchor?: Date
): Date | null {
  if (rule.kind === 'none') return null

  const anchorDay = startOfDay(anchor && !Number.isNaN(anchor.getTime()) ? anchor : after)

  // A month can move the target by up to 31 days; a 52-week interval by more,
  // so search a generous window rather than assuming a fixed horizon.
  const horizon = rule.kind === 'monthly' ? 400 : rule.kind === 'weekly' ? rule.interval * 7 + 7 : rule.interval + 1

  for (let offset = 0; offset <= horizon; offset++) {
    const candidate = new Date(after)
    candidate.setDate(candidate.getDate() + offset)
    candidate.setHours(time.hour, time.minute, 0, 0)

    if (candidate.getTime() <= after.getTime()) continue
    if (matchesRule(rule, candidate, anchorDay)) return candidate
  }

  return null
}

/**
 * Whether this rule fires on a given calendar date, ignoring the time of day.
 * Used to paint repeat markers on the calendar.
 */
export function ruleOccursOnDate(rule: RepeatRule, date: Date, anchor?: Date): boolean {
  if (rule.kind === 'none') return false
  const anchorDay = startOfDay(anchor && !Number.isNaN(anchor.getTime()) ? anchor : date)
  return matchesRule(rule, date, anchorDay)
}

function matchesRule(rule: RepeatRule, candidate: Date, anchorDay: Date): boolean {
  switch (rule.kind) {
    case 'none':
      return false

    case 'daily': {
      if (rule.interval === 1) return true
      const elapsed = daysBetween(anchorDay, candidate)
      return elapsed >= 0 && elapsed % rule.interval === 0
    }

    case 'weekly': {
      if (!rule.days.includes(candidate.getDay())) return false
      if (rule.interval === 1) return true
      // Count interval in whole weeks from the anchor's week, not raw days,
      // so every day selected inside a matching week fires.
      const weeks = Math.floor(daysBetween(startOfWeek(anchorDay), candidate) / 7)
      return weeks >= 0 && weeks % rule.interval === 0
    }

    case 'monthly': {
      const lastDayOfMonth = new Date(
        candidate.getFullYear(),
        candidate.getMonth() + 1,
        0
      ).getDate()
      // Clamp so "day 31" still fires in short months.
      return candidate.getDate() === Math.min(rule.dayOfMonth, lastDayOfMonth)
    }
  }
}

function startOfWeek(date: Date): Date {
  const copy = startOfDay(date)
  copy.setDate(copy.getDate() - copy.getDay())
  return copy
}
