// Undo after completing a task has to bring the task back.
//
// `tasks-grid-screen` keeps the undo it shows in a status bar as
// `() => onToggleComplete(task.id)`, captured at the moment the checkbox was
// tapped. That function is the `handleToggleComplete` of an older render, so it
// must still find the task in the task list as it is *now*; reading the list of
// the render it was born in makes Undo complete the task a second time instead
// of restoring it.

import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { toggleCloudTaskComplete } from '@/lib/storage-cloud'

/** The subscription callback the page gave the cloud, so a test can push tasks. */
const cloud = vi.hoisted(() => ({
  emit: null as null | ((tasks: unknown[]) => void),
}))

/** Every `onToggleComplete` the grid screen has been handed, oldest first. */
const grid = vi.hoisted(() => ({
  toggles: [] as Array<(taskId: string) => Promise<void>>,
}))

vi.mock('@/lib/auth-context', () => {
  const user = { uid: 'user-1', email: 'user@example.com' }
  return { useAuth: () => ({ user, loading: false, signOut: vi.fn() }) }
})

vi.mock('@/lib/storage-idb', () => ({
  getTasks: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/storage-cloud', () => ({
  // The callback is kept rather than fired on subscribe, so each test decides
  // which task list the page sees and when.
  subscribeToTasks: vi.fn((_userId: string, callback: (tasks: unknown[]) => void) => {
    cloud.emit = callback
    return vi.fn()
  }),
  migrateLocalToCloud: vi.fn().mockResolvedValue({ migrated: 0 }),
  createCloudTask: vi.fn(),
  updateCloudTask: vi.fn(),
  deleteCloudTask: vi.fn(),
  toggleCloudTaskComplete: vi.fn(),
  saveCloudTasks: vi.fn(),
}))

vi.mock('@/lib/notifications', () => ({
  initializeNotifications: vi.fn(),
  onAlarmNotificationTap: vi.fn(() => () => {}),
  scheduleTaskNotification: vi.fn(),
  cancelTaskNotification: vi.fn(),
}))

vi.mock('@/lib/web-notifications', () => ({
  initializeForegroundReminders: vi.fn(),
  startForegroundReminder: vi.fn(),
  stopForegroundReminder: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(), exitApp: vi.fn() } }))
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: vi.fn() } }))

vi.mock('@/lib/missed-alarms', () => ({
  subscribeToMissedAlarms: vi.fn(() => () => {}),
  dismissMissedAlarms: vi.fn(),
}))
vi.mock('@/lib/push-subscription', () => ({ refreshPushSubscription: vi.fn() }))
vi.mock('@/lib/alarm-sync', () => ({ syncAlarmSchedule: vi.fn().mockResolvedValue(undefined) }))

// The stub stands in for the grid screen and remembers the handler per render,
// the way the screen itself holds on to one for its undo.
vi.mock('@/components/tasks-grid-screen', () => ({
  default: ({ onToggleComplete }: { onToggleComplete: (taskId: string) => Promise<void> }) => {
    grid.toggles.push(onToggleComplete)
    return <p>Task list</p>
  },
}))

vi.mock('@/components/start-menu', () => ({ default: () => null }))
vi.mock('@/components/calendar-screen', () => ({ default: () => null }))
vi.mock('@/components/add-task-screen', () => ({ default: () => null }))
vi.mock('@/components/task-detail-screen', () => ({ default: () => null }))
vi.mock('@/components/settings-screen', () => ({ default: () => null }))

import Page from '@/app/page'

const toggled = vi.mocked(toggleCloudTaskComplete)

/** A stored task as the cloud subscription delivers it. */
function stored(id: string, completed: boolean) {
  return {
    id,
    title: `görev ${id}`,
    completed,
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z',
  }
}

/**
 * Render the page and let the subscription deliver `tasks`. Returns the handler
 * of that render, which is the one an Undo pressed right now would call.
 */
async function showTasks(tasks: unknown[]): Promise<(taskId: string) => Promise<void>> {
  render(<Page />)
  await waitFor(() => expect(cloud.emit).not.toBeNull())

  await act(async () => {
    cloud.emit?.(tasks)
  })
  await screen.findByText('Task list')

  const current = grid.toggles.at(-1)
  expect(current).toBeTypeOf('function')
  return current as (taskId: string) => Promise<void>
}

beforeEach(() => {
  cloud.emit = null
  grid.toggles.length = 0
  toggled.mockClear()
})

describe('completing a task from the page', () => {
  // Issue case 1
  it('case 1: completes an open task', async () => {
    const onToggleComplete = await showTasks([stored('T1', false)])

    await act(async () => {
      await onToggleComplete('T1')
    })

    expect(toggled).toHaveBeenCalledTimes(1)
    expect(toggled).toHaveBeenCalledWith('user-1', 'T1', false)
  })

  // Issue case 2: Undo calls the handler captured when the task was still open.
  // It has to decide from the task list as it is now, so the task comes back.
  it('case 2: restores through the handler the undo captured before completing', async () => {
    const undo = await showTasks([stored('T1', false)])

    await act(async () => {
      await undo('T1')
    })
    toggled.mockClear()

    // The cloud reports the task completed, and the page renders again.
    const rendered = grid.toggles.length
    await act(async () => {
      cloud.emit?.([stored('T1', true)])
    })
    await waitFor(() => expect(grid.toggles.length).toBeGreaterThan(rendered))

    // The very same, now old, handler runs again: this is the Undo tap.
    await act(async () => {
      await undo('T1')
    })

    expect(toggled).toHaveBeenCalledTimes(1)
    expect(toggled).toHaveBeenCalledWith('user-1', 'T1', true)
  })

  // Issue case 3
  it('case 3: writes nothing for a task that is not there', async () => {
    const onToggleComplete = await showTasks([stored('T1', false)])

    await act(async () => {
      await onToggleComplete('NOPE')
    })

    expect(toggled).not.toHaveBeenCalled()
  })
})