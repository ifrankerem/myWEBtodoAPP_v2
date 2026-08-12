// Timezone-aware re-arming of repeating alarms.
//
// The client stores an absolute `fireAt` plus the IANA timezone the alarm was
// created in. After a repeating alarm fires the worker computes the next
// occurrence itself, so repeats keep working even if the user never reopens
// the app.

const DAY_NAME_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

const WEEKDAY_FORMAT_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

export function parseRepeatDays(repeats: string | null | undefined): number[] {
  if (!repeats) return []
  const days = repeats
    .split(',')
    .map((day) => day.trim())
    .map((day) => DAY_NAME_TO_INDEX[day])
    .filter((index): index is number => index !== undefined)
  return Array.from(new Set(days)).sort((a, b) => a - b)
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
    weekday: WEEKDAY_FORMAT_TO_INDEX[map.weekday] ?? 0,
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
  const refined = naive - timeZoneOffsetMs(firstGuess, tz)
  return refined
}

/**
 * Next occurrence of a repeating alarm, strictly after `after`.
 * Returns null when the alarm does not repeat or cannot be parsed.
 */
export function getNextRepeatFireAt(
  alarm: { alarm: string; repeats: string | null; tz: string | null },
  after: number
): number | null {
  const repeatDays = parseRepeatDays(alarm.repeats)
  if (repeatDays.length === 0) return null

  const time = parseAlarmTime(alarm.alarm)
  if (!time) return null

  const tz = safeTimeZone(alarm.tz)
  const startOfSearch = getZonedParts(after, tz)

  for (let offset = 0; offset <= 8; offset++) {
    // Step day-by-day in the target timezone via UTC arithmetic on the date parts.
    const dayCursor = new Date(
      Date.UTC(startOfSearch.year, startOfSearch.month - 1, startOfSearch.day + offset)
    )
    const candidate = zonedTimeToEpoch(
      dayCursor.getUTCFullYear(),
      dayCursor.getUTCMonth() + 1,
      dayCursor.getUTCDate(),
      time.hour,
      time.minute,
      tz
    )

    if (candidate <= after) continue
    if (!repeatDays.includes(getZonedParts(candidate, tz).weekday)) continue
    return candidate
  }

  return null
}
