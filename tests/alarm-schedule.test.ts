import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { alarmDocId, getNextFireAt } from '@/lib/alarm-schedule'

describe('getNextFireAt', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Wednesday
    vi.setSystemTime(new Date('2026-08-05T10:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns today for a one-shot alarm still ahead of now', () => {
    const fireAt = getNextFireAt({ id: 't', title: 'x', alarm: '10:30', dueDate: '2026-08-05' })
    expect(fireAt).toBe(new Date('2026-08-05T10:30:00').getTime())
  })

  it('returns null for a one-shot alarm that already passed', () => {
    expect(getNextFireAt({ id: 't', title: 'x', alarm: '09:30', dueDate: '2026-08-05' })).toBeNull()
  })

  it('returns null for completed tasks', () => {
    expect(
      getNextFireAt({ id: 't', title: 'x', alarm: '23:30', dueDate: '2026-08-05', completed: true })
    ).toBeNull()
  })

  it('picks today when a legacy repeat day matches and the time is still ahead', () => {
    const fireAt = getNextFireAt({ id: 't', title: 'x', alarm: '18:00', repeats: 'Wed, Fri' })
    expect(fireAt).toBe(new Date('2026-08-05T18:00:00').getTime())
  })

  it('rolls over to the next matching weekday when today has passed', () => {
    const fireAt = getNextFireAt({ id: 't', title: 'x', alarm: '08:00', repeats: 'Wed, Fri' })
    expect(fireAt).toBe(new Date('2026-08-07T08:00:00').getTime())
  })

  it('wraps into next week when the only repeat day is earlier in the week', () => {
    const fireAt = getNextFireAt({ id: 't', title: 'x', alarm: '08:00', repeats: 'Mon' })
    expect(fireAt).toBe(new Date('2026-08-10T08:00:00').getTime())
  })

  it('honours a structured daily rule', () => {
    const fireAt = getNextFireAt({
      id: 't',
      title: 'x',
      alarm: '08:00',
      repeatRule: { kind: 'daily', interval: 1 },
    })
    expect(fireAt).toBe(new Date('2026-08-06T08:00:00').getTime())
  })

  it('anchors a multi-week interval on the due date', () => {
    const fireAt = getNextFireAt({
      id: 't',
      title: 'x',
      alarm: '08:00',
      dueDate: '2026-08-05',
      repeatRule: { kind: 'weekly', days: [3], interval: 2 },
    })
    expect(fireAt).toBe(new Date('2026-08-19T08:00:00').getTime())
  })

  it('honours a structured monthly rule', () => {
    const fireAt = getNextFireAt({
      id: 't',
      title: 'x',
      alarm: '08:00',
      repeatRule: { kind: 'monthly', dayOfMonth: 20 },
    })
    expect(fireAt).toBe(new Date('2026-08-20T08:00:00').getTime())
  })

  it('prefers the structured rule over the legacy string', () => {
    const fireAt = getNextFireAt({
      id: 't',
      title: 'x',
      alarm: '08:00',
      repeats: 'Mon',
      repeatRule: { kind: 'daily', interval: 1 },
    })
    expect(fireAt).toBe(new Date('2026-08-06T08:00:00').getTime())
  })

  it('rejects alarms with an unparseable time', () => {
    expect(getNextFireAt({ id: 't', title: 'x', alarm: '7:30 PM' })).toBeNull()
    expect(getNextFireAt({ id: 't', title: 'x', alarm: '25:00' })).toBeNull()
  })
})

describe('alarmDocId', () => {
  it('matches the id shape the Firestore rules enforce', () => {
    expect(alarmDocId('user1', 'task9')).toBe('user1__task9')
  })
})
