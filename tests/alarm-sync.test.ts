import { beforeEach, describe, expect, it, vi } from 'vitest'

const firestore = vi.hoisted(() => ({
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  setDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({ kind: 'collection' })),
  doc: vi.fn(() => ({ kind: 'doc' })),
  getDocs: firestore.getDocs,
  setDoc: firestore.setDoc,
  deleteDoc: firestore.deleteDoc,
  query: vi.fn((value) => value),
  where: vi.fn(),
}))

vi.mock('@/lib/firebase', () => ({
  getDbInstance: vi.fn(() => ({ kind: 'db' })),
}))

import type { AlarmTaskInput } from '@/lib/alarm-schedule'

/** The sync keeps its last-seen list in module scope, so each case gets its own. */
async function freshModule() {
  vi.resetModules()
  return import('@/lib/alarm-sync')
}

function task(overrides: Partial<AlarmTaskInput> = {}): AlarmTaskInput {
  return { id: 'task-1', title: 'Standup', completed: false, alarm: '08:00', ...overrides }
}

describe('alarm schedule sync', () => {
  beforeEach(() => {
    firestore.getDocs.mockClear()
    firestore.setDoc.mockClear()
    firestore.deleteDoc.mockClear()
    firestore.getDocs.mockResolvedValue({ docs: [] })
  })

  it('reads the alarm collection once per real change, not per snapshot', async () => {
    const { syncAlarmSchedule } = await freshModule()

    await syncAlarmSchedule('user-1', [task()])
    const readsAfterFirst = firestore.getDocs.mock.calls.length

    // The same list again, as a snapshot for an unrelated write delivers it.
    await syncAlarmSchedule('user-1', [task()])
    await syncAlarmSchedule('user-1', [task()])

    expect(firestore.getDocs.mock.calls.length).toBe(readsAfterFirst)
  })

  it('syncs again when an alarm-relevant field changes', async () => {
    const { syncAlarmSchedule } = await freshModule()

    await syncAlarmSchedule('user-1', [task()])
    const readsAfterFirst = firestore.getDocs.mock.calls.length

    await syncAlarmSchedule('user-1', [task({ alarm: '09:00' })])

    expect(firestore.getDocs.mock.calls.length).toBeGreaterThan(readsAfterFirst)
  })

  it('does not carry a signature across a sign-out', async () => {
    const { syncAlarmSchedule } = await freshModule()

    await syncAlarmSchedule('user-1', [task()])

    // The module outlives the session; the next user's first sync must run.
    await syncAlarmSchedule('user-2', [task()])

    expect(firestore.getDocs).toHaveBeenCalledTimes(2)
  })

  it('serialises overlapping syncs so two runs never write together', async () => {
    const { syncAlarmSchedule } = await freshModule()

    let releaseFirst = () => {}
    firestore.getDocs.mockImplementationOnce(
      () => new Promise((resolve) => {
        releaseFirst = () => resolve({ docs: [] })
      }),
    )

    const first = syncAlarmSchedule('user-1', [task()])
    // A second snapshot lands while the first read is still in flight.
    const second = syncAlarmSchedule('user-1', [task({ alarm: '09:00' })])

    await vi.waitFor(() => expect(firestore.getDocs).toHaveBeenCalledTimes(1))
    releaseFirst()
    await Promise.all([first, second])
    await vi.waitFor(() => expect(firestore.getDocs).toHaveBeenCalledTimes(2))
  })

  it('drops a single task alarm', async () => {
    const { clearAlarmSchedule } = await freshModule()

    await clearAlarmSchedule('user-1', 'task-1')

    expect(firestore.deleteDoc).toHaveBeenCalled()
  })
})
