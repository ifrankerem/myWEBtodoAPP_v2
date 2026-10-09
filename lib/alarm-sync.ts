// Mirrors task alarms into a top-level `alarms` collection that the
// Cloudflare Worker cron can query with a single indexed read.
//
// Kept top-level (rather than under users/{uid}) so the worker can run one
// `active == true && fireAt <= now` query across every user per minute instead
// of walking each user's subcollection.

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore'
import { getDbInstance } from './firebase'
import {
  alarmDocId,
  getDeviceTimeZone,
  getNextFireAt,
  type AlarmTaskInput,
} from './alarm-schedule'
import { toRepeatRule, type RepeatRule } from './repeat-rule'

export interface AlarmDocument {
  uid: string
  taskId: string
  title: string
  body: string
  alarm: string
  /** Legacy string form, kept for older clients. */
  repeats: string | null
  /** Structured rule the worker uses to re-arm repeats. */
  repeatRule: RepeatRule
  dueDate: string | null
  tz: string
  fireAt: number
  active: boolean
  updatedAt: number
}

function alarmsCollection() {
  return collection(getDbInstance(), 'alarms')
}

function buildAlarmDocument(uid: string, task: AlarmTaskInput, fireAt: number): AlarmDocument {
  return {
    uid,
    taskId: task.id,
    title: task.title,
    body: task.detail?.trim() ? task.detail.trim().slice(0, 200) : task.title,
    alarm: task.alarm as string,
    repeats: task.repeats ?? null,
    repeatRule: toRepeatRule(task),
    dueDate: task.dueDate ?? null,
    tz: getDeviceTimeZone(),
    fireAt,
    active: true,
    updatedAt: Date.now(),
  }
}

/** Everything about a task the alarm mirror depends on. */
function alarmSignature(task: AlarmTaskInput): unknown {
  return [
    task.id,
    task.title,
    task.detail?.trim() ?? '',
    task.alarm ?? '',
    task.repeats ?? '',
    JSON.stringify(task.repeatRule ?? null),
    task.dueDate ?? '',
    task.completed === true,
  ]
}

/**
 * Reconcile the whole `alarms` collection for a user against their current
 * task list: upsert alarms that should fire, drop everything else.
 *
 * Idempotent, so it is safe to call on every Firestore snapshot.
 */
export async function syncAlarmSchedule(uid: string, tasks: AlarmTaskInput[]): Promise<void> {
  if (!uid) return

  // The snapshot callback fires for every write to the task list, and almost all
  // of them leave the schedule alone, so nothing is read until something did.
  // The uid is part of it: this module outlives a sign-out, and the next user's
  // first sync must not be skipped as "already synced".
  const signature = JSON.stringify([uid, tasks.map(alarmSignature)])
  if (signature === lastSyncedSignature) return

  // One run at a time: the callback can fire again while the read and the writes
  // of the previous run are still in the air, and two overlapping reconciles
  // both write from the same snapshot.
  const run = (syncInFlight ?? Promise.resolve()).then(() => reconcileAlarms(uid, tasks, signature))
  syncInFlight = run.catch(() => undefined)
  return run
}

let lastSyncedSignature: string | null = null
let syncInFlight: Promise<void> | null = null

async function reconcileAlarms(
  uid: string,
  tasks: AlarmTaskInput[],
  signature: string
): Promise<void> {
  const now = new Date()
  const desired = new Map<string, AlarmDocument>()

  for (const task of tasks) {
    const fireAt = getNextFireAt(task, now)
    if (fireAt === null) continue
    desired.set(alarmDocId(uid, task.id), buildAlarmDocument(uid, task, fireAt))
  }

  const existing = await getDocs(query(alarmsCollection(), where('uid', '==', uid)))
  const writes: Promise<unknown>[] = []

  for (const snapshot of existing.docs) {
    const wanted = desired.get(snapshot.id)

    if (!wanted) {
      writes.push(deleteDoc(snapshot.ref))
      continue
    }

    // The worker owns `fireAt` once an alarm has fired and been re-armed, so
    // only rewrite when the user-visible schedule actually changed.
    const current = snapshot.data() as Partial<AlarmDocument>
    const unchanged =
      current.active === true &&
      current.title === wanted.title &&
      current.body === wanted.body &&
      current.alarm === wanted.alarm &&
      (current.repeats ?? null) === wanted.repeats &&
      JSON.stringify(current.repeatRule ?? null) === JSON.stringify(wanted.repeatRule) &&
      (current.dueDate ?? null) === wanted.dueDate &&
      current.tz === wanted.tz &&
      typeof current.fireAt === 'number' &&
      current.fireAt > now.getTime()

    if (!unchanged) {
      writes.push(setDoc(snapshot.ref, wanted))
    }
    desired.delete(snapshot.id)
  }

  for (const [id, wanted] of desired) {
    writes.push(setDoc(doc(alarmsCollection(), id), wanted))
  }

  await Promise.all(writes)

  // Remembered only once the writes landed, so a failed run is retried on the
  // next snapshot rather than being skipped as "already synced".
  lastSyncedSignature = signature
}

/** Drop a single task's alarm immediately (delete / complete paths). */
export async function clearAlarmSchedule(uid: string, taskId: string): Promise<void> {
  if (!uid) return
  await deleteDoc(doc(alarmsCollection(), alarmDocId(uid, taskId)))
}
