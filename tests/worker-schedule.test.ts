import { describe, expect, it } from 'vitest'

import { getNextRepeatFireAt, zonedTimeToEpoch } from '../worker/src/schedule'

const AUGUST_5_2026_0800_ISTANBUL = Date.UTC(2026, 7, 5, 5, 0) // UTC+3, no DST

describe('zonedTimeToEpoch', () => {
  it('resolves a wall-clock time in a fixed-offset zone', () => {
    expect(zonedTimeToEpoch(2026, 8, 5, 8, 0, 'Europe/Istanbul')).toBe(AUGUST_5_2026_0800_ISTANBUL)
  })

  it('resolves the correct offset on both sides of a DST change', () => {
    // Europe/Berlin is UTC+1 in winter and UTC+2 in summer.
    expect(zonedTimeToEpoch(2026, 1, 15, 7, 0, 'Europe/Berlin')).toBe(Date.UTC(2026, 0, 15, 6, 0))
    expect(zonedTimeToEpoch(2026, 7, 15, 7, 0, 'Europe/Berlin')).toBe(Date.UTC(2026, 6, 15, 5, 0))
  })

  it('falls back to UTC semantics for an unknown zone', () => {
    expect(getNextRepeatFireAt(
      { alarm: '08:00', repeats: 'Wed', tz: 'Mars/Olympus' },
      Date.UTC(2026, 7, 5, 0, 0)
    )).toBe(Date.UTC(2026, 7, 5, 8, 0))
  })
})

describe('getNextRepeatFireAt', () => {
  it('returns the same day when the alarm is still ahead in the user timezone', () => {
    const next = getNextRepeatFireAt(
      { alarm: '08:00', repeats: 'Wed, Fri', tz: 'Europe/Istanbul' },
      Date.UTC(2026, 7, 5, 0, 0) // 03:00 Istanbul, Wednesday
    )
    expect(next).toBe(AUGUST_5_2026_0800_ISTANBUL)
  })

  it('advances to the next matching weekday after firing', () => {
    const next = getNextRepeatFireAt(
      { alarm: '08:00', repeats: 'Wed, Fri', tz: 'Europe/Istanbul' },
      AUGUST_5_2026_0800_ISTANBUL
    )
    expect(next).toBe(Date.UTC(2026, 7, 7, 5, 0)) // Friday 08:00 Istanbul
  })

  it('wraps to the following week for a single repeat day', () => {
    const next = getNextRepeatFireAt(
      { alarm: '08:00', repeats: 'Wed', tz: 'Europe/Istanbul' },
      AUGUST_5_2026_0800_ISTANBUL
    )
    expect(next).toBe(Date.UTC(2026, 7, 12, 5, 0))
  })

  it('keeps the local wall-clock time across a DST transition', () => {
    // Berlin leaves DST on 2026-10-25, so Monday 07:00 shifts from UTC+2 to UTC+1.
    const beforeChange = getNextRepeatFireAt(
      { alarm: '07:00', repeats: 'Mon', tz: 'Europe/Berlin' },
      Date.UTC(2026, 9, 19, 5, 0)
    )
    expect(beforeChange).toBe(Date.UTC(2026, 9, 26, 6, 0))
  })

  it('returns null for non-repeating or malformed alarms', () => {
    expect(getNextRepeatFireAt({ alarm: '08:00', repeats: null, tz: 'UTC' }, Date.now())).toBeNull()
    expect(
      getNextRepeatFireAt({ alarm: 'not-a-time', repeats: 'Mon', tz: 'UTC' }, Date.now())
    ).toBeNull()
  })
})
