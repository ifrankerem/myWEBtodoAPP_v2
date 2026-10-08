// Asking the Worker to read a sentence the on-device rules could not.
//
// `lib/voice-intent.ts` decides a spoken command with rules: fast, private and
// free, but a sentence phrased in a way the rules do not cover comes back
// `unknown`. This asks the Worker's model for that sentence instead, and only
// then.
//
// The answer is treated as a suggestion, never as a command: a delete or a
// complete the model guessed at comes back as a confirmation for the user to
// tap, because a wrong answer here would otherwise delete the wrong task. Every
// call is bounded — no URL, no token, a slow worker or a body that is not an
// intent all end in `unknown`, and nothing here throws.

import type { Task } from '@/lib/task'
import type { VoiceIntent } from '@/lib/voice-intent'

/**
 * Long enough for the model to answer, short enough that a worker which never
 * replies does not leave the user looking at "Düşünüyorum…" forever. A real round
 * trip is the token, the network and the model: ~3.2 s on the model alone with a
 * long task list, and the 6 s this used to wait for cut it off mid-answer.
 */
export const REMOTE_TIMEOUT_MS = 10000

/** Where the Worker's voice endpoint lives, or null when it is not configured. */
export function voiceIntentUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_VOICE_INTENT_URL?.trim()
  return url === undefined || url === '' ? null : url
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function trimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/** The date the Worker should reason from, in the user's own timezone. */
function toDateString(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * The Worker's answer as an intent, with every task id looked up in the list the
 * request sent. An id the app does not have is not a task to act on.
 */
export function toVoiceIntent(remote: unknown, tasks: Task[]): VoiceIntent {
  if (!isRecord(remote)) return { action: 'unknown' }

  const find = (id: unknown): Task | undefined =>
    typeof id === 'string' ? tasks.find((task) => task.id === id) : undefined

  switch (remote.action) {
    case 'create': {
      const title = trimmedString(remote.title)
      if (title === undefined) return { action: 'unknown' }

      const intent: VoiceIntent = { action: 'create', title }
      const dueDate = trimmedString(remote.dueDate)
      const alarm = trimmedString(remote.alarm)
      if (dueDate !== undefined) intent.dueDate = dueDate
      if (alarm !== undefined) intent.alarm = alarm
      return intent
    }

    case 'delete':
    case 'complete': {
      const task = find(remote.taskId)
      if (!task) return { action: 'unknown' }
      // The model guessed which task was meant; the user has not agreed yet.
      return { action: 'confirm', candidates: [task], wanted: remote.action }
    }

    case 'update': {
      const task = find(remote.taskId)
      if (!task) return { action: 'unknown' }

      const updates: { title?: string; dueDate?: string; alarm?: string } = {}
      const title = trimmedString(remote.title)
      const dueDate = trimmedString(remote.dueDate)
      const alarm = trimmedString(remote.alarm)
      if (title !== undefined) updates.title = title
      if (dueDate !== undefined) updates.dueDate = dueDate
      if (alarm !== undefined) updates.alarm = alarm
      if (Object.keys(updates).length === 0) return { action: 'unknown' }

      return { action: 'update', task, updates }
    }

    case 'confirm': {
      if (remote.wanted !== 'delete' && remote.wanted !== 'complete' && remote.wanted !== 'update') {
        return { action: 'unknown' }
      }
      if (!Array.isArray(remote.candidates)) return { action: 'unknown' }

      const candidates = remote.candidates
        .map((id) => find(id))
        .filter((task): task is Task => task !== undefined)
      if (candidates.length === 0) return { action: 'unknown' }

      return { action: 'confirm', wanted: remote.wanted, candidates }
    }

    case 'list': {
      const intent: { action: 'list'; from?: string; to?: string } = { action: 'list' }
      const from = trimmedString(remote.from)
      const to = trimmedString(remote.to)
      if (from !== undefined) intent.from = from
      if (to !== undefined) intent.to = to
      return intent
    }

    default:
      return { action: 'unknown' }
  }
}

/**
 * What the Worker makes of `text`, or `unknown` for every reason it might not
 * answer: no endpoint configured, nobody signed in, no sentence, a slow worker,
 * an error status, a body that is not an intent. It never throws, because a
 * failed suggestion is not worth interrupting the user for.
 */
export async function askRemoteIntent(
  text: string,
  tasks: Task[],
  today: Date,
  getToken: () => Promise<string | null>,
  options?: { url?: string | null; fetchImpl?: typeof fetch; signal?: AbortSignal }
): Promise<VoiceIntent> {
  const url = options?.url === undefined ? voiceIntentUrl() : options.url
  if (!url || text.trim() === '') return { action: 'unknown' }

  let token: string | null
  try {
    token = await getToken()
  } catch {
    return { action: 'unknown' }
  }
  if (!token) return { action: 'unknown' }

  const doFetch = options?.fetchImpl ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS)
  // The caller may already be going away, and the timer must not outlive the call.
  const onCallerAbort = (): void => controller.abort()
  options?.signal?.addEventListener('abort', onCallerAbort)

  try {
    const response = await doFetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        tasks: tasks.map(({ id, title }) => ({ id, title })),
        today: toDateString(today),
      }),
      signal: controller.signal,
    })

    if (response.status !== 200) return { action: 'unknown' }
    return toVoiceIntent(await response.json(), tasks)
  } catch {
    return { action: 'unknown' }
  } finally {
    clearTimeout(timer)
    options?.signal?.removeEventListener('abort', onCallerAbort)
  }
}
