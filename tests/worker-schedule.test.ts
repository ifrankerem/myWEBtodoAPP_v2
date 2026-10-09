import { describe, expect, it } from 'vitest'

import { getNextRepeatFireAt, toRepeatRule, zonedTimeToEpoch } from '../worker/src/schedule'

// Istanbul is a fixed UTC+3 with no DST, which keeps these expectations readable.
const IST = 'Europe/Istanbul'
const AUG_5_0800_IST = Date.UTC(2026, 7, 5, 5, 0) // Wednesday 08:00 Istanbul

describe('zonedTimeToEpoch', () => {
  it('resolves a wall-clock time in a fixed-offset zone', () => {
    expect(zonedTimeToEpoch(2026, 8, 5, 8, 0, IST)).toBe(AUG_5_0800_IST)
  })

  it('resolves the correct offset on both sides of a DST change', () => {
    // Europe/Berlin is UTC+1 in winter and UTC+2 in summer.
    expect(zonedTimeToEpoch(2026, 1, 15, 7, 0, 'Europe/Berlin')).toBe(Date.UTC(2026, 0, 15, 6, 0))
    expect(zonedTimeToEpoch(2026, 7, 15, 7, 0, 'Europe/Berlin')).toBe(Date.UTC(2026, 6, 15, 5, 0))
  })
})

describe('toRepeatRule', () => {
  it('reads the structured rule when present', () => {
    expect(toRepeatRule({ repeatRule: { kind: 'daily', interval: 2 } })).toEqual({
      kind: 'daily',
      interval: 2,
    })
  })

  it('falls back to the legacy string', () => {
    expect(toRepeatRule({ repeats: 'Mon, Wed' })).toEqual({
      kind: 'weekly',
      days: [1, 3],
      interval: 1,
    })
  })

  it('reports no repeat for empty or malformed input', () => {
    expect(toRepeatRule({})).toEqual({ kind: 'none' })
    expect(toRepeatRule({ repeatRule: { kind: 'weekly', days: [] } })).toEqual({ kind: 'none' })
  })

  it('honours an explicit none even when a legacy string is still on the row', () => {
    // A row written before repeatRule existed carries both. The client reads
    // this as one-shot, so the worker must too: otherwise it re-arms the alarm
    // forever and pushes it again every minute.
    expect(toRepeatRule({ repeatRule: { kind: 'none' }, repeats: 'Mon, Wed' })).toEqual({ kind: 'none' })
    expect(
      getNextRepeatFireAt(
        { alarm: '08:00', repeats: 'Mon, Wed', repeatRule: { kind: 'none' }, tz: IST },
        AUG_5_0800_IST,
      ),
    ).toBeNull()
  })
})

describe('getNextRepeatFireAt', () => {
  it('returns the same day when the alarm is still ahead in the user timezone', () => {
    const next = getNextRepeatFireAt(
      { alarm: '08:00', repeats: 'Wed, Fri', tz: IST },
      Date.UTC(2026, 7, 5, 0, 0) // 03:00 Istanbul, Wednesday
    )
    expect(next).toBe(AUG_5_0800_IST)
  })

  it('advances to the next matching weekday after firing', () => {
    const next = getNextRepeatFireAt(
      { alarm: '08:00', repeats: 'Wed, Fri', tz: IST },
      AUG_5_0800_IST
    )
    expect(next).toBe(Date.UTC(2026, 7, 7, 5, 0)) // Friday 08:00 Istanbul
  })

  it('wraps to the following week for a single repeat day', () => {
    const next = getNextRepeatFireAt({ alarm: '08:00', repeats: 'Wed', tz: IST }, AUG_5_0800_IST)
    expect(next).toBe(Date.UTC(2026, 7, 12, 5, 0))
  })

  it('keeps the local wall-clock time across a DST transition', () => {
    // Berlin leaves DST on 2026-10-25, so Monday 07:00 shifts from UTC+2 to UTC+1.
    const next = getNextRepeatFireAt(
      { alarm: '07:00', repeats: 'Mon', tz: 'Europe/Berlin' },
      Date.UTC(2026, 9, 19, 5, 0)
    )
    expect(next).toBe(Date.UTC(2026, 9, 26, 6, 0))
  })

  it('advances a daily rule by its interval from the due date', () => {
    const next = getNextRepeatFireAt(
      {
        alarm: '08:00',
        repeatRule: { kind: 'daily', interval: 3 },
        dueDate: '2026-08-05',
        tz: IST,
      },
      AUG_5_0800_IST
    )
    expect(next).toBe(Date.UTC(2026, 7, 8, 5, 0))
  })

  it('fires every day for a daily interval of one', () => {
    const next = getNextRepeatFireAt(
      { alarm: '08:00', repeatRule: { kind: 'daily', interval: 1 }, tz: IST },
      AUG_5_0800_IST
    )
    expect(next).toBe(Date.UTC(2026, 7, 6, 5, 0))
  })

  it('skips the off week for a two-week interval', () => {
    const next = getNextRepeatFireAt(
      {
        alarm: '08:00',
        repeatRule: { kind: 'weekly', days: [3], interval: 2 },
        dueDate: '2026-08-05',
        tz: IST,
      },
      AUG_5_0800_IST
    )
    expect(next).toBe(Date.UTC(2026, 7, 19, 5, 0))
  })

  it('advances a monthly rule to the next month', () => {
    const next = getNextRepeatFireAt(
      { alarm: '08:00', repeatRule: { kind: 'monthly', dayOfMonth: 5 }, tz: IST },
      AUG_5_0800_IST
    )
    expect(next).toBe(Date.UTC(2026, 8, 5, 5, 0))
  })

  it('clamps a monthly day past the end of a short month', () => {
    const next = getNextRepeatFireAt(
      { alarm: '08:00', repeatRule: { kind: 'monthly', dayOfMonth: 31 }, tz: IST },
      Date.UTC(2027, 0, 31, 6, 0) // 31 Jan 2027, 09:00 Istanbul
    )
    expect(next).toBe(Date.UTC(2027, 1, 28, 5, 0))
  })

  it('falls back to UTC semantics for an unknown zone', () => {
    expect(
      getNextRepeatFireAt({ alarm: '08:00', repeats: 'Wed', tz: 'Mars/Olympus' }, Date.UTC(2026, 7, 5, 0, 0))
    ).toBe(Date.UTC(2026, 7, 5, 8, 0))
  })

  it('returns null for non-repeating or malformed alarms', () => {
    expect(getNextRepeatFireAt({ alarm: '08:00', repeats: null, tz: 'UTC' }, Date.now())).toBeNull()
    expect(
      getNextRepeatFireAt({ alarm: 'not-a-time', repeats: 'Mon', tz: 'UTC' }, Date.now())
    ).toBeNull()
  })
})
