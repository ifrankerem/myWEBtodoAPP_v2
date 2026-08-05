import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}))

import { startForegroundReminder, stopAllForegroundReminders } from '@/lib/web-notifications'

describe('foreground reminder alert', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-05T10:00:00'))
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: class NotificationMock {
        static permission = 'denied'
      },
    })
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: class AudioContextMock {
        state = 'running'
        currentTime = 0
        destination = {}
        createOscillator() {
          return { connect: vi.fn(), frequency: { value: 0 }, type: 'sine', start: vi.fn(), stop: vi.fn() }
        }
        createGain() {
          return { connect: vi.fn(), gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } }
        }
      },
    })
  })

  afterEach(() => {
    stopAllForegroundReminders()
    vi.useRealTimers()
  })

  it('renders an XP alert with task text and never interprets task markup as HTML', async () => {
    startForegroundReminder({
      id: 'task-1',
      title: '<img src=x alt="injected">',
      alarm: '10:01',
      dueDate: '2026-08-05',
    })

    await vi.advanceTimersByTimeAsync(60_000)

    const alert = document.querySelector('[role="alert"]')
    expect(alert).toHaveClass('xp-alarm-toast')
    expect(alert).toHaveTextContent('<img src=x alt="injected">')
    expect(alert?.querySelector('img')).toBeNull()
  })
})
