import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const nativeNotifications = vi.hoisted(() => ({
  schedule: vi.fn().mockResolvedValue(undefined),
  checkPermissions: vi.fn().mockResolvedValue({ display: 'granted' }),
  getPending: vi.fn().mockResolvedValue({ notifications: [] }),
  cancel: vi.fn().mockResolvedValue(undefined),
  createChannel: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}))

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: nativeNotifications,
}))

import { scheduleTaskNotification } from '@/lib/notifications'

describe('native alarm scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-05T10:00:00'))
    nativeNotifications.schedule.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('schedules a one-time alarm on its due date instead of today', async () => {
    await scheduleTaskNotification({
      id: 'task-1',
      title: 'Future task',
      alarm: '14:30',
      dueDate: '2026-08-10',
    })

    const scheduled = nativeNotifications.schedule.mock.calls[0][0].notifications[0].schedule.at as Date
    expect(scheduled.getFullYear()).toBe(2026)
    expect(scheduled.getMonth()).toBe(7)
    expect(scheduled.getDate()).toBe(10)
    expect(scheduled.getHours()).toBe(14)
    expect(scheduled.getMinutes()).toBe(30)
  })
})
