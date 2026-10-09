// Timezone-aware re-arming of repeating alarms.
//
// The client stores an absolute `fireAt`, the structured repeat rule, and the
// IANA timezone the alarm was created in. After a repeating alarm fires the
// worker computes the next occurrence itself, so repeats keep working even if
// the user never reopens the app.
//
// This mirrors lib/repeat-rule.ts, but every date calculation is done in the
// alarm's own timezone rather than the runtime's (which is always UTC here).
//
// The duplicated rule parsing is deliberate: this package has no runtime
// dependencies and does not import from the app. tests/repeat-rule-parity.test.ts
// keeps the two copies honest — that check exists because they drifted once and
// the worker re-armed an alarm the app considered one-shot, forever.

export type RepeatRule =
  | { kind: 'none' }
  | { kind: 'daily'; interval: number }
  | { kind: 'weekly'; days: number[]; interval: number }
  | { kind: 'monthly'; dayOfMonth: number }

const DAY_NAME_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000

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

export function parseLegacyRepeats(repeats: string | null | undefined): number[] {
  if (!repeats) return []
  return normalizeDays(
    repeats
      .split(',')
      .map((day) => DAY_NAME_TO_INDEX[day.trim()])
      .filter((day) => day !== undefined)
  )
}

/** Read the rule from an alarm document, falling back to the legacy string. */
export function toRepeatRule(source: {
  repeatRule?: unknown
  repeats?: string | null
}): RepeatRule {
  const raw = source.repeatRule

  if (raw && typeof raw === 'object') {
    const rule = raw as Record<string, unknown>

    if (rule.kind === 'daily') return { kind: 'daily', interval: clampInterval(rule.interval) }

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

    // An explicit "does not repeat" outranks the legacy string, exactly as
    // lib/repeat-rule.ts reads it: a row carrying both fields must not have the
    // worker resurrecting a weekly alarm the app considers one-shot.
    if (rule.kind === 'none') return { kind: 'none' }
  }

  const legacyDays = parseLegacyRepeats(source.repeats)
  return legacyDays.length > 0 ? { kind: 'weekly', days: legacyDays, interval: 1 } : { kind: 'none' }
}

export function parseAlarmTime(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? { hour, minute } : null
}

function safeTimeZone(tz: string | null | undefined): string {
  if (!tz) return 'UTC'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return 'UTC'
  }
}

interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  weekday: number
}

function getZonedParts(timestamp: number, tz: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  }).formatToParts(new Date(timestamp))

  const map: Record<string, string> = {}
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value
  }

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: DAY_NAME_TO_INDEX[map.weekday] ?? 0,
  }
}

/** Offset of `tz` from UTC in milliseconds at the given instant. */
function timeZoneOffsetMs(timestamp: number, tz: string): number {
  const parts = getZonedParts(timestamp, tz)
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  )
  return asUtc - Math.floor(timestamp / 1000) * 1000
}

/** Epoch ms for a wall-clock time in `tz`, resolving DST shifts. */
export function zonedTimeToEpoch(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string
): number {
  const naive = Date.UTC(year, month - 1, day, hour, minute)
  const firstGuess = naive - timeZoneOffsetMs(naive, tz)
  // A second pass corrects the guess when the offset changes across the boundary.
  return naive - timeZoneOffsetMs(firstGuess, tz)
}

/** Whole days between two calendar dates, expressed as UTC day numbers. */
function dayNumber(year: number, month: number, day: number): number {
  return Math.round(Date.UTC(year, month - 1, day) / MILLIS_PER_DAY)
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function matchesRule(
  rule: RepeatRule,
  candidate: { year: number; month: number; day: number; weekday: number },
  anchorDayNumber: number | null
): boolean {
  const candidateDayNumber = dayNumber(candidate.year, candidate.month, candidate.day)

  switch (rule.kind) {
    case 'none':
      return false

    case 'daily': {
      if (rule.interval === 1) return true
      if (anchorDayNumber === null) return true
      const elapsed = candidateDayNumber - anchorDayNumber
      return elapsed >= 0 && elapsed % rule.interval === 0
    }

    case 'weekly': {
      if (!rule.days.includes(candidate.weekday)) return false
      if (rule.interval === 1 || anchorDayNumber === null) return rule.interval === 1
      // Count whole weeks from the start of the anchor's week so every selected
      // day inside a matching week fires.
      const weeks = Math.floor((candidateDayNumber - anchorDayNumber) / 7)
      return weeks >= 0 && weeks % rule.interval === 0
    }

    case 'monthly':
      // Clamp so "day 31" still fires in short months.
      return (
        candidate.day === Math.min(rule.dayOfMonth, lastDayOfMonth(candidate.year, candidate.month))
      )
  }
}

/**
 * Next occurrence of a repeating alarm, strictly after `after`.
 * Returns null when the alarm does not repeat or cannot be parsed.
 */
export function getNextRepeatFireAt(
  alarm: {
    alarm: string
    repeats?: string | null
    repeatRule?: unknown
    dueDate?: string | null
    tz: string | null
  },
  after: number
): number | null {
  const rule = toRepeatRule(alarm)
  if (rule.kind === 'none') return null

  const time = parseAlarmTime(alarm.alarm)
  if (!time) return null

  const tz = safeTimeZone(alarm.tz)
  const start = getZonedParts(after, tz)

  // Intervals count from the due date when there is one, matching the client.
  let anchorDayNumber: number | null = null
  if (alarm.dueDate) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(alarm.dueDate)
    if (match) {
      const anchor = dayNumber(Number(match[1]), Number(match[2]), Number(match[3]))
      // Weekly intervals are measured from the start of the anchor's week.
      anchorDayNumber =
        rule.kind === 'weekly'
          ? anchor - ((new Date(anchor * MILLIS_PER_DAY).getUTCDay() + 7) % 7)
          : anchor
    }
  }

  // A monthly rule can be up to ~13 months out once intervals are involved.
  const horizon =
    rule.kind === 'monthly' ? 400 : rule.kind === 'weekly' ? rule.interval * 7 + 7 : rule.interval + 1

  for (let offset = 0; offset <= horizon; offset++) {
    const cursor = new Date(Date.UTC(start.year, start.month - 1, start.day + offset))
    const candidateDate = {
      year: cursor.getUTCFullYear(),
      month: cursor.getUTCMonth() + 1,
      day: cursor.getUTCDate(),
    }

    const candidate = zonedTimeToEpoch(
      candidateDate.year,
      candidateDate.month,
      candidateDate.day,
      time.hour,
      time.minute,
      tz
    )

    if (candidate <= after) continue
    if (!matchesRule(rule, { ...candidateDate, weekday: getZonedParts(candidate, tz).weekday }, anchorDayNumber)) {
      continue
    }
    return candidate
  }

  return null
}
