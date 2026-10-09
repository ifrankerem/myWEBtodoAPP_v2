import { describe, expect, it } from 'vitest'

import {
  nextRepeatOccurrence,
  parseLegacyRepeats,
  toLegacyRepeats,
  toRepeatRule,
  type RepeatRule,
} from '@/lib/repeat-rule'

const AT_0800 = { hour: 8, minute: 0 }
// 2026-08-05 is a Wednesday.
const WED_1000 = new Date('2026-08-05T10:00:00')

describe('parseLegacyRepeats', () => {
  it('parses, de-duplicates and sorts weekday names', () => {
    expect(parseLegacyRepeats('Fri, Mon, Mon, Wed')).toEqual([1, 3, 5])
  })

  it('drops unknown names', () => {
    expect(parseLegacyRepeats('Mon, Funday')).toEqual([1])
    expect(parseLegacyRepeats(undefined)).toEqual([])
  })
})

describe('toRepeatRule', () => {
  it('falls back to the legacy string when there is no structured rule', () => {
    expect(toRepeatRule({ repeats: 'Mon, Wed' })).toEqual({
      kind: 'weekly',
      days: [1, 3],
      interval: 1,
    })
  })

  it('prefers the structured rule over the legacy string', () => {
    expect(
      toRepeatRule({ repeatRule: { kind: 'daily', interval: 3 }, repeats: 'Mon, Wed' })
    ).toEqual({ kind: 'daily', interval: 3 })
  })

  it('treats an empty or malformed rule as no repeat', () => {
    expect(toRepeatRule({})).toEqual({ kind: 'none' })
    expect(toRepeatRule({ repeatRule: { kind: 'weekly', days: [] } })).toEqual({ kind: 'none' })
    expect(toRepeatRule({ repeatRule: { kind: 'nonsense' } })).toEqual({ kind: 'none' })
  })

  it('clamps out-of-range intervals and days', () => {
    expect(toRepeatRule({ repeatRule: { kind: 'daily', interval: 0 } })).toEqual({
      kind: 'daily',
      interval: 1,
    })
    expect(toRepeatRule({ repeatRule: { kind: 'weekly', days: [1, 9, 3], interval: 2 } })).toEqual({
      kind: 'weekly',
      days: [1, 3],
      interval: 2,
    })
    expect(toRepeatRule({ repeatRule: { kind: 'monthly', dayOfMonth: 40 } })).toEqual({
      kind: 'none',
    })
  })
})

describe('toLegacyRepeats', () => {
  it('round-trips a simple weekly rule', () => {
    expect(toLegacyRepeats({ kind: 'weekly', days: [1, 3], interval: 1 })).toBe('Mon, Wed')
  })

  it('expands a daily rule to every weekday name', () => {
    expect(toLegacyRepeats({ kind: 'daily', interval: 1 })).toBe(
      'Sun, Mon, Tue, Wed, Thu, Fri, Sat'
    )
  })

  it('has no legacy form for rules the old string cannot express', () => {
    expect(toLegacyRepeats({ kind: 'monthly', dayOfMonth: 15 })).toBeUndefined()
  })
})

describe('nextRepeatOccurrence', () => {
  it('returns null when the rule does not repeat', () => {
    expect(nextRepeatOccurrence({ kind: 'none' }, AT_0800, WED_1000)).toBeNull()
  })

  it('rolls a weekly rule to the next matching day', () => {
    const rule: RepeatRule = { kind: 'weekly', days: [3, 5], interval: 1 }
    expect(nextRepeatOccurrence(rule, AT_0800, WED_1000)).toEqual(new Date('2026-08-07T08:00:00'))
  })

  it('keeps today when the weekly time has not passed yet', () => {
    const rule: RepeatRule = { kind: 'weekly', days: [3], interval: 1 }
    const early = new Date('2026-08-05T06:00:00')
    expect(nextRepeatOccurrence(rule, AT_0800, early)).toEqual(new Date('2026-08-05T08:00:00'))
  })

  it('honours a multi-week interval anchored on the due date', () => {
    const rule: RepeatRule = { kind: 'weekly', days: [3], interval: 2 }
    const anchor = new Date('2026-08-05T00:00:00')
    // The following Wednesday is an off week, so it skips to two weeks out.
    expect(nextRepeatOccurrence(rule, AT_0800, WED_1000, anchor)).toEqual(
      new Date('2026-08-19T08:00:00')
    )
  })

  it('fires every selected day inside a matching week', () => {
    const rule: RepeatRule = { kind: 'weekly', days: [1, 3], interval: 2 }
    const anchor = new Date('2026-08-03T00:00:00') // Monday of the on-week
    const afterMonday = new Date('2026-08-03T09:00:00')
    expect(nextRepeatOccurrence(rule, AT_0800, afterMonday, anchor)).toEqual(
      new Date('2026-08-05T08:00:00')
    )
  })

  it('advances a daily rule by its interval from the anchor', () => {
    const rule: RepeatRule = { kind: 'daily', interval: 3 }
    const anchor = new Date('2026-08-05T00:00:00')
    expect(nextRepeatOccurrence(rule, AT_0800, WED_1000, anchor)).toEqual(
      new Date('2026-08-08T08:00:00')
    )
  })

  it('fires every day for a daily interval of one', () => {
    expect(nextRepeatOccurrence({ kind: 'daily', interval: 1 }, AT_0800, WED_1000)).toEqual(
      new Date('2026-08-06T08:00:00')
    )
  })

  it('advances a monthly rule to the next month', () => {
    const rule: RepeatRule = { kind: 'monthly', dayOfMonth: 5 }
    expect(nextRepeatOccurrence(rule, AT_0800, WED_1000)).toEqual(
      new Date('2026-09-05T08:00:00')
    )
  })

  it('clamps a monthly day past the end of a short month', () => {
    const rule: RepeatRule = { kind: 'monthly', dayOfMonth: 31 }
    // February 2027 has 28 days, so the 31st lands on the 28th.
    const lateJanuary = new Date('2027-01-31T09:00:00')
    expect(nextRepeatOccurrence(rule, AT_0800, lateJanuary)).toEqual(
      new Date('2027-02-28T08:00:00')
    )
  })
})

