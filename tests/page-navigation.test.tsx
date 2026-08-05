import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-context', () => {
  const user = { uid: 'user-1' }
  return { useAuth: () => ({ user, loading: false }) }
})

vi.mock('@/lib/storage-idb', () => ({
  getTasks: vi.fn().mockResolvedValue([]),
  fileToBase64: vi.fn(),
}))

vi.mock('@/lib/storage-cloud', () => ({
  subscribeToTasks: vi.fn((_userId: string, callback: (tasks: unknown[]) => void) => {
    callback([])
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

vi.mock('@/components/tasks-grid-screen', () => ({
  default: ({ onOpenDrawer }: { onOpenDrawer: () => void }) => <button onClick={onOpenDrawer}>Open menu</button>,
}))
vi.mock('@/components/sliding-drawer', () => ({
  default: ({ isOpen, onNavigate }: { isOpen: boolean; onNavigate: (screen: 'calendar') => void }) => isOpen
    ? <button onClick={() => onNavigate('calendar')}>Calendar destination</button>
    : null,
}))
vi.mock('@/components/calendar-screen', () => ({
  default: ({ onAddTask }: { onAddTask: (date: string) => void }) => <button onClick={() => onAddTask('2026-08-10')}>Add from calendar</button>,
}))
vi.mock('@/components/add-task-screen', () => ({
  default: ({ onCancel }: { onCancel: () => void }) => <button onClick={onCancel}>Cancel add</button>,
}))
vi.mock('@/components/task-detail-screen', () => ({ default: () => null }))
vi.mock('@/components/settings-screen', () => ({ default: () => null }))

import Page from '@/app/page'

describe('screen history', () => {
  it('returns to Calendar when Add Task was opened from Calendar', async () => {
    const user = userEvent.setup()
    render(<Page />)

    await user.click(await screen.findByRole('button', { name: 'Open menu' }))
    await user.click(screen.getByRole('button', { name: 'Calendar destination' }))
    await user.click(screen.getByRole('button', { name: 'Add from calendar' }))
    await user.click(screen.getByRole('button', { name: 'Cancel add' }))

    expect(screen.getByRole('button', { name: 'Add from calendar' })).toBeInTheDocument()
  })
})
