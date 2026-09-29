// Alarms the worker decided were too late to deliver.
//
// The worker skips anything more than an hour overdue rather than firing a
// stale notification, but silently dropping it would mean the user never finds
// out. It writes them here instead, and the app reports them on next open.

import { collection, deleteDoc, getDocs, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { getDbInstance } from './firebase'

export interface MissedAlarm {
  id: string
  taskId: string
  title: string
  /** When the alarm should have fired. */
  fireAt: number
  /** When the worker noticed it was too late. */
  noticedAt: number
}

function missedAlarmsCollection(uid: string) {
  return collection(getDbInstance(), 'users', uid, 'missedAlarms')
}

function toMissedAlarm(id: string, data: Record<string, unknown>): MissedAlarm | null {
  const fireAt = typeof data.fireAt === 'number' ? data.fireAt : null
  if (fireAt === null) return null

  return {
    id,
    taskId: typeof data.taskId === 'string' ? data.taskId : '',
    title: typeof data.title === 'string' ? data.title : 'Task',
    fireAt,
    noticedAt: typeof data.noticedAt === 'number' ? data.noticedAt : fireAt,
  }
}

/** Watch for missed alarms, newest first. */
export function subscribeToMissedAlarms(
  uid: string,
  onChange: (missed: MissedAlarm[]) => void
): Unsubscribe {
  return onSnapshot(
    missedAlarmsCollection(uid),
    (snapshot) => {
      const missed = snapshot.docs
        .map((entry) => toMissedAlarm(entry.id, entry.data()))
        .filter((entry): entry is MissedAlarm => entry !== null)
        .sort((a, b) => b.fireAt - a.fireAt)

      onChange(missed)
    },
    (error) => {
      console.error('Missed alarm subscription failed:', error)
      onChange([])
    }
  )
}

/** Clear the list once the user has seen it. */
export async function dismissMissedAlarms(uid: string): Promise<void> {
  if (!uid) return
  const snapshot = await getDocs(missedAlarmsCollection(uid))
  await Promise.all(snapshot.docs.map((entry) => deleteDoc(entry.ref)))
}
