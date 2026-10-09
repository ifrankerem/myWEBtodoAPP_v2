import { describe, expect, it } from 'vitest'

import { parseLegacyRepeats, toRepeatRule } from '@/lib/repeat-rule'
import { parseAlarmTime } from '@/lib/task-dates'
import {
  parseLegacyRepeats as workerParseLegacyRepeats,
  toRepeatRule as workerToRepeatRule,
  parseAlarmTime as workerParseAlarmTime,
} from '../worker/src/schedule'

// The app and the worker each carry their own copy of the repeat-rule parsing.
// The app resolves occurrences against the device clock and the worker against
// the alarm's IANA timezone, so those engines must stay separate — but the rules
// they read cannot.
//
// They drifted once already: the worker's copy fell through to the legacy
// weekday string on a row carrying both fields, so an alarm the app called
// one-shot was re-armed forever and pushed again every minute. These cases are
// the regression test for that, and any future divergence fails here rather
// than in production.
//
// Upgrade path if the copies drift again: the worker is a separate package with
// no runtime dependencies, so it deliberately does not import from the app.
// If that trade stops being worth it, move the parsing into a shared module
// both sides import and delete this file.

describe('repeat rule parsing agrees between app and worker', () => {
  const ruleCases: Array<[string, Record<string, unknown>]> = [
    ['a daily rule', { repeatRule: { kind: 'daily', interval: 2 } }],
    ['a weekly rule', { repeatRule: { kind: 'weekly', days: [1, 3, 5], interval: 1 } }],
    ['a weekly rule with an interval', { repeatRule: { kind: 'weekly', days: [2], interval: 3 } }],
    ['a monthly rule', { repeatRule: { kind: 'monthly', dayOfMonth: 9 } }],
    ['a legacy string', { repeats: 'Mon, Wed, Fri' }],
    ['an unsorted legacy string', { repeats: 'Fri, Mon, Mon, Wed' }],
    ['a legacy string with junk', { repeats: 'Mon, Funday' }],
    ['nothing at all', {}],
    ['an empty repeatRule', { repeatRule: null }],
    ['an unknown kind', { repeatRule: { kind: 'yearly' } }],
    ['a weekly rule with no days', { repeatRule: { kind: 'weekly', days: [] } }],
    ['a weekly rule with junk days', { repeatRule: { kind: 'weekly', days: [1, 9, -2, 'x', null] } }],
    ['a monthly rule off the calendar', { repeatRule: { kind: 'monthly', dayOfMonth: 40 } }],
    ['a zero interval', { repeatRule: { kind: 'daily', interval: 0 } }],
    ['a negative interval', { repeatRule: { kind: 'daily', interval: -5 } }],
    ['an absurd interval', { repeatRule: { kind: 'daily', interval: 1e9 } }],
    ['a non-numeric interval', { repeatRule: { kind: 'daily', interval: 'abc' } }],
    // The row that caused the bug: written before repeatRule existed, so it
    // carries both fields. One-shot must mean one-shot to both readers.
    ['an explicit none over a legacy string', { repeatRule: { kind: 'none' }, repeats: 'Mon, Wed' }],
    ['an explicit none with no legacy string', { repeatRule: { kind: 'none' } }],
    ['a structured rule beside a legacy string', { repeatRule: { kind: 'daily', interval: 1 }, repeats: 'Mon' }],
  ]

  for (const [name, source] of ruleCases) {
    it(`reads ${name} the same way`, () => {
      expect(workerToRepeatRule(source)).toEqual(toRepeatRule(source))
    })
  }

  it('reads legacy weekday strings the same way', () => {
    for (const text of ['Mon, Wed', 'Fri, Mon, Mon, Wed', 'Mon, Funday', '', 'Sun', 'Bogus']) {
      expect(workerParseLegacyRepeats(text)).toEqual(parseLegacyRepeats(text))
    }
  })

  it('reads alarm clock times the same way', () => {
    for (const time of ['08:00', '9:00', '23:59', '00:00', '24:00', '8:60', 'abc', '']) {
      expect(workerParseAlarmTime(time)).toEqual(parseAlarmTime(time))
    }
  })
})
