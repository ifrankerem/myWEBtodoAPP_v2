import { beforeEach, describe, expect, it, vi } from 'vitest'

const firestore = vi.hoisted(() => {
  const batch = {
    delete: vi.fn(),
    set: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  }

  return {
    batch,
    deleteFieldValue: Symbol('delete-field'),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    getDocs: vi.fn().mockResolvedValue({ docs: [{ ref: { id: 'existing' } }] }),
  }
})

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({ kind: 'collection' })),
  doc: vi.fn(() => ({ kind: 'doc' })),
  addDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: firestore.updateDoc,
  deleteDoc: vi.fn(),
  getDocs: firestore.getDocs,
  onSnapshot: vi.fn(),
  query: vi.fn((value) => value),
  orderBy: vi.fn(),
  writeBatch: vi.fn(() => firestore.batch),
  serverTimestamp: vi.fn(),
  deleteField: vi.fn(() => firestore.deleteFieldValue),
}))

vi.mock('@/lib/firebase', () => ({
  getDbInstance: vi.fn(() => ({ kind: 'db' })),
}))

import { saveCloudTasks, updateCloudTask } from '@/lib/storage-cloud'
import type { TaskRecord } from '@/lib/storage-idb'

const tasks: TaskRecord[] = [
  {
    id: 'a',
    title: 'First',
    completed: false,
    createdAt: '2026-08-05T10:00:00.000Z',
    updatedAt: '2026-08-05T10:00:00.000Z',
  },
  {
    id: 'b',
    title: 'Second',
    completed: false,
    createdAt: '2026-08-05T09:00:00.000Z',
    updatedAt: '2026-08-05T09:00:00.000Z',
  },
]

describe('cloud task persistence', () => {
  beforeEach(() => {
    firestore.batch.delete.mockClear()
    firestore.batch.set.mockClear()
    firestore.batch.commit.mockClear()
    firestore.updateDoc.mockClear()
  })

  it('deletes cleared optional fields instead of leaving stale Firestore values', async () => {
    await updateCloudTask('user-1', 'task-1', {
      detail: null,
      photo: null,
      alarm: null,
      repeats: null,
      dueDate: null,
    } as never)

    expect(firestore.updateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        detail: firestore.deleteFieldValue,
        photo: firestore.deleteFieldValue,
        alarm: firestore.deleteFieldValue,
        repeats: firestore.deleteFieldValue,
        dueDate: firestore.deleteFieldValue,
      }),
    )
  })

  it('persists order without deleting and recreating every task document', async () => {
    await saveCloudTasks('user-1', tasks)

    expect(firestore.batch.delete).not.toHaveBeenCalled()
    expect(firestore.batch.set).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({ id: 'a', sortOrder: 0 }),
      { merge: true },
    )
    expect(firestore.batch.set).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ id: 'b', sortOrder: 1 }),
      { merge: true },
    )
  })
})
