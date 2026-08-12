// Cron worker that delivers task alarms as Web Push notifications.
//
// Runs once a minute, picks up every `alarms` document whose `fireAt` has
// passed, pushes it to each of that user's registered devices, then re-arms
// repeating alarms for their next occurrence.

import { FirestoreClient, documentId, readFields } from './firestore'
import { getNextRepeatFireAt } from './schedule'
import { sendWebPush, type PushSubscriptionKeys, type VapidKeys } from './webpush'

export interface Env {
  FIREBASE_SERVICE_ACCOUNT: string
  FIREBASE_PROJECT_ID?: string
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_KEY: string
  VAPID_SUBJECT: string
  APP_URL?: string
  TRIGGER_SECRET?: string
}

/** Cap per run so one bad batch cannot blow the worker's CPU budget. */
const MAX_ALARMS_PER_RUN = 200

/**
 * Alarms more than an hour late are skipped rather than delivered — a stale
 * "7:00 wake up" arriving at 14:00 is noise. They still get re-armed.
 */
const MAX_LATENESS_MS = 60 * 60 * 1000

interface AlarmRecord {
  id: string
  uid: string
  taskId: string
  title: string
  body: string
  alarm: string
  repeats: string | null
  tz: string | null
  fireAt: number
}

interface RunSummary {
  due: number
  sent: number
  failed: number
  skippedLate: number
  prunedSubscriptions: number
  errors: string[]
}

function toAlarmRecord(name: string, fields: Record<string, unknown>): AlarmRecord | null {
  const uid = typeof fields.uid === 'string' ? fields.uid : null
  const alarm = typeof fields.alarm === 'string' ? fields.alarm : null
  const fireAt = typeof fields.fireAt === 'number' ? fields.fireAt : null
  if (!uid || !alarm || fireAt === null) return null

  const title = typeof fields.title === 'string' ? fields.title : 'Task'

  return {
    id: documentId(name),
    uid,
    taskId: typeof fields.taskId === 'string' ? fields.taskId : '',
    title,
    body: typeof fields.body === 'string' && fields.body ? fields.body : title,
    alarm,
    repeats: typeof fields.repeats === 'string' ? fields.repeats : null,
    tz: typeof fields.tz === 'string' ? fields.tz : null,
    fireAt,
  }
}

function toSubscription(
  name: string,
  fields: Record<string, unknown>
): (PushSubscriptionKeys & { id: string }) | null {
  const endpoint = fields.endpoint
  const p256dh = fields.p256dh
  const auth = fields.auth
  if (typeof endpoint !== 'string' || typeof p256dh !== 'string' || typeof auth !== 'string') {
    return null
  }
  return { id: documentId(name), endpoint, p256dh, auth }
}

export async function runAlarmSweep(env: Env, now = Date.now()): Promise<RunSummary> {
  const summary: RunSummary = {
    due: 0,
    sent: 0,
    failed: 0,
    skippedLate: 0,
    prunedSubscriptions: 0,
    errors: [],
  }

  const vapid: VapidKeys = {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT,
  }

  if (!vapid.publicKey || !vapid.privateKey || !vapid.subject) {
    throw new Error('VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT must all be set')
  }

  const firestore = new FirestoreClient(env.FIREBASE_SERVICE_ACCOUNT, env.FIREBASE_PROJECT_ID)
  const documents = await firestore.queryDueAlarms(now, MAX_ALARMS_PER_RUN)

  const alarms = documents
    .map((doc) => toAlarmRecord(doc.name, readFields(doc.fields)))
    .filter((alarm): alarm is AlarmRecord => alarm !== null)

  summary.due = alarms.length
  if (alarms.length === 0) return summary

  // One subscription fetch per user, not per alarm.
  const subscriptionsByUid = new Map<string, Array<PushSubscriptionKeys & { id: string }>>()
  for (const uid of new Set(alarms.map((alarm) => alarm.uid))) {
    try {
      const documents = await firestore.listPushSubscriptions(uid)
      subscriptionsByUid.set(
        uid,
        documents
          .map((doc) => toSubscription(doc.name, readFields(doc.fields)))
          .filter((sub): sub is PushSubscriptionKeys & { id: string } => sub !== null)
      )
    } catch (error) {
      subscriptionsByUid.set(uid, [])
      summary.errors.push(`subscriptions ${uid}: ${(error as Error).message}`)
    }
  }

  const deadSubscriptions = new Set<string>()
  const appUrl = env.APP_URL || '/'

  for (const alarm of alarms) {
    const late = now - alarm.fireAt > MAX_LATENESS_MS

    if (late) {
      summary.skippedLate++
    } else {
      const subscriptions = subscriptionsByUid.get(alarm.uid) ?? []

      for (const subscription of subscriptions) {
        if (deadSubscriptions.has(`${alarm.uid}/${subscription.id}`)) continue

        const result = await sendWebPush(
          subscription,
          {
            title: '🔔 ALARM',
            body: alarm.body,
            tag: alarm.taskId || alarm.id,
            taskId: alarm.taskId,
            fireAt: alarm.fireAt,
            url: appUrl,
          },
          vapid
        )

        if (result.ok) {
          summary.sent++
          continue
        }

        summary.failed++
        summary.errors.push(`push ${alarm.id} (${result.status}): ${result.error}`)

        if (result.gone) {
          deadSubscriptions.add(`${alarm.uid}/${subscription.id}`)
          try {
            await firestore.deletePushSubscription(alarm.uid, subscription.id)
            summary.prunedSubscriptions++
          } catch {
            // Pruning is best-effort; the next run will retry.
          }
        }
      }
    }

    // Re-arm regardless of send outcome so a delivery failure cannot wedge the
    // alarm into firing on every subsequent run.
    const nextFireAt = getNextRepeatFireAt(alarm, Math.max(now, alarm.fireAt))

    try {
      if (nextFireAt !== null) {
        await firestore.updateAlarm(alarm.id, { fireAt: nextFireAt, lastSentAt: now })
      } else {
        await firestore.updateAlarm(alarm.id, { active: false, lastSentAt: now })
      }
    } catch (error) {
      summary.errors.push(`rearm ${alarm.id}: ${(error as Error).message}`)
    }
  }

  return summary
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      runAlarmSweep(env)
        .then((summary) => {
          console.log('alarm sweep', JSON.stringify(summary))
        })
        .catch((error: unknown) => {
          console.error('alarm sweep failed', error)
        })
    )
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/health') {
      return Response.json({ ok: true, time: new Date().toISOString() })
    }

    // Manual trigger for testing. Disabled unless TRIGGER_SECRET is configured.
    if (url.pathname === '/run') {
      if (!env.TRIGGER_SECRET) {
        return new Response('Manual trigger disabled', { status: 404 })
      }
      if (request.headers.get('authorization') !== `Bearer ${env.TRIGGER_SECRET}`) {
        return new Response('Unauthorized', { status: 401 })
      }

      try {
        return Response.json(await runAlarmSweep(env))
      } catch (error) {
        return Response.json({ error: (error as Error).message }, { status: 500 })
      }
    }

    return new Response('task-alarm-worker', { status: 200 })
  },
}
