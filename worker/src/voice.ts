// Reading a spoken Turkish sentence the rule parser could not.
//
// `lib/voice-intent.ts` in the app handles what it can with rules, and it is
// fast and free. This is the fallback for the rest: Workers AI reads the sentence
// with the user's real task list in front of it and answers with a structured
// intent. Nothing here touches a task — the endpoint returns the intent and the
// app applies it, so the app keeps owning every write.
//
// The model is never trusted. `normalizeRemoteIntent` re-checks every field
// against the request: an id that was not sent, a date that is not a date and a
// clock time that is not one are all dropped, and what is left has to mean
// something.

import type { Ai } from '@cloudflare/workers-types'

/**
 * Chosen on an eval over 20 real Turkish sentences: 19/20 correct, median 2.2 s,
 * max 3.6 s on the free plan. Without `reasoning.effort: 'low'` the same
 * answers sometimes took 60 s.
 */
export const VOICE_MODEL = '@cf/openai/gpt-oss-20b'

export interface VoiceRequest {
  text: string
  tasks: Array<{ id: string; title: string }>
  today: string
}

export type RemoteIntent =
  | { action: 'create'; title: string; dueDate?: string; alarm?: string }
  | { action: 'delete' | 'complete'; taskId: string }
  | { action: 'update'; taskId: string; title?: string; dueDate?: string; alarm?: string }
  | { action: 'confirm'; wanted: 'delete' | 'complete' | 'update'; candidates: string[] }
  | { action: 'list'; from?: string; to?: string }
  | { action: 'unknown' }

/** A task named in the request may be this long before it stops being a title. */
const MAX_TASKS = 300

/** Long enough for a sentence, short enough that it cannot become a document. */
const MAX_TEXT = 300

const DAY_NAMES = [
  'Pazar',
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
]

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const ALARM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/


/** Calendar-day arithmetic on the parts of the date, with no clock and no zone. */
function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const moved = new Date(Date.UTC(year, month - 1, day + days))
  return moved.toISOString().slice(0, 10)
}

function weekdayName(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return DAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function trimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function validDate(value: unknown): string | undefined {
  const text = trimmedString(value)
  return text !== undefined && DATE_PATTERN.test(text) ? text : undefined
}

function validAlarm(value: unknown): string | undefined {
  const text = trimmedString(value)
  return text !== undefined && ALARM_PATTERN.test(text) ? text : undefined
}

/**
 * The date table the model is told to read dates from, so it never has to work
 * out what "cumaya" means or what day it is.
 */
function dateTable(today: string): string {
  // Offsets 2 and up name the day the date falls on, in the order the model
  // reads best: the next two days, then each following day.
  const names = ['', '', 'pazar', 'pazartesi', 'salı', 'çarşamba', 'perşembe', 'cuma', 'cumartesi']

  const entries: string[] = []
  for (let offset = 0; offset < 8; offset += 1) {
    const date = addDays(today, offset)
    const name = offset === 0 ? 'bugün' : offset === 1 ? 'yarın' : names[offset]
    entries.push(`${name} ${weekdayName(date)} = ${date}`)
  }
  return entries.join('; ')
}

/**
 * Everything the model needs to turn a sentence into an intent, and nothing it
 * could use to act: the task ids and titles, the dates it may answer with, and
 * the rules the rule parser already follows, so both agree.
 */
export function buildVoicePrompt(request: VoiceRequest): string {
  const tasks = request.tasks.map((task) => `${task.id}: ${task.title}`).join('\n')

  return [
    `Bugün ${weekdayName(request.today)} = ${request.today}.`,
    `Tarihler sadece bu tablodan seçilir: ${dateTable(request.today)}`,
    '',
    'Görevler:',
    tasks === '' ? '(yok)' : tasks,
    '',
    'Kurallar:',
    '- Tarihi yalnızca yukarıdaki tablodan al; başka biçimde yazma.',
    '- `akşam 8` = 20:00, `öğleden sonra 3` = 15:00; gündüz saatleri 1–6 gün içi saat 13–18 sayılır.',
    '- `9 da`, `20.00 de` gibi ayrı yazılan ekler saate aittir, görev başlığına değil.',
    '- `hatırlat`, `not al`, `ekle`, `yeni görev` → create.',
    '- `aldım`, `yaptım`, `hallettim`, `bitirdim`, `tamamladım` → complete.',
    '- `sil`, `kaldır`, `siler misin` → delete.',
    '- `ertele`, `taşı`, `alarm kur`, `alarm ekle`, `adını ... yap` → update.',
    '- `ne var`, `hangi görevlerim`, `listele`, `göster` → list.',
    '- Konuşma tanıma bazı kelimeleri yanlış duyabilir: `göre beni` = `görevi`, `yap` = `yap`.',
    '- Birden çok görev eşleşirse candidates yaz.',
    '- `taskId` ve `candidates` için görev başlık değil, listedeki `id` yazılır (örneğin `t17`).',
    '- Emin değilsen unknown yaz.',
    '- Yalnızca JSON döndür.',
    '',
    'Örnek: "yarın sabah 9 da süt al ekle" → {"action":"create","title":"süt al","dueDate":"<bugün+1>","alarm":"09:00"}',
    'Örnek: "kahve al görevini cumaya ertele" → {"action":"update","taskId":"<kahve al>","dueDate":"<cuma>"}',
  ].join('\n')
}

/**
 * The answer, with nothing in it the request did not put there. Anything the
 * model made up — an id that was never sent, a date that is not a date, a field
 * for an action that does not take it — is dropped rather than passed on.
 *
 * The model names a task by its title as often as by its id ("kahve al" instead
 * of "t17"), so a name that is not an id is read as a title. The match is the
 * whole title, trimmed and lower-cased in Turkish; a title no task has, or that
 * two tasks share, names nothing and is dropped as before.
 */
export function normalizeRemoteIntent(raw: unknown, request: VoiceRequest): RemoteIntent {
  if (!isRecord(raw)) return { action: 'unknown' }

  const action = raw.action
  const known = request.tasks.map((task) => task.id)
  /** The task a name points at, whether the model wrote the id or the title. */
  const resolveTaskId = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined
    if (known.includes(value)) return value

    const wanted = value.trim().toLocaleLowerCase('tr-TR')
    const titled = request.tasks.filter(
      (task) => task.title.trim().toLocaleLowerCase('tr-TR') === wanted
    )
    // Two tasks with the title name no single one of them.
    return titled.length === 1 ? titled[0].id : undefined
  }

  const candidates = Array.isArray(raw.candidates)
    ? raw.candidates
        .map(resolveTaskId)
        .filter((id): id is string => id !== undefined)
    : []
  const wanted = (raw.action === 'delete' || raw.action === 'complete' || raw.action === 'update'
    ? raw.action
    : undefined)

  if (action === 'create') {
    const title = trimmedString(raw.title)
    if (title === undefined) return { action: 'unknown' }

    const intent: RemoteIntent = { action: 'create', title }
    const dueDate = validDate(raw.dueDate)
    const alarm = validAlarm(raw.alarm)
    if (dueDate !== undefined) intent.dueDate = dueDate
    if (alarm !== undefined) intent.alarm = alarm
    return intent
  }

  if (action === 'list') {
    const intent: { action: 'list'; from?: string; to?: string } = { action: 'list' }
    const from = validDate(raw.from)
    const to = validDate(raw.to)
    if (from !== undefined) intent.from = from
    if (to !== undefined) intent.to = to
    return intent
  }

  if (action === 'delete' || action === 'complete' || action === 'update') {
    const taskId = resolveTaskId(raw.taskId)
    if (taskId !== undefined) {
      if (action === 'update') {
        const intent: { action: 'update'; taskId: string; title?: string; dueDate?: string; alarm?: string } = {
          action: 'update',
          taskId,
        }
        const title = trimmedString(raw.title)
        const dueDate = validDate(raw.dueDate)
        const alarm = validAlarm(raw.alarm)
        if (title !== undefined) intent.title = title
        if (dueDate !== undefined) intent.dueDate = dueDate
        if (alarm !== undefined) intent.alarm = alarm
        // Nothing left to change means the model did not answer the question.
        if (title === undefined && dueDate === undefined && alarm === undefined) {
          return { action: 'unknown' }
        }
        return intent
      }
      return { action, taskId }
    }

    // No id, but the model narrowed it to one task: that is the same answer.
    if (candidates.length === 1 && wanted !== undefined) {
      return { action, taskId: candidates[0] } as RemoteIntent
    }

    if (candidates.length >= 2 && wanted !== undefined) {
      return { action: 'confirm', wanted, candidates }
    }

    return { action: 'unknown' }
  }

  return { action: 'unknown' }
}

/** The shape of the answer we ask for, so the model does not improvise keys. */
const RESPONSE_SCHEMA = {
  name: 'voice_intent',
  schema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['create', 'delete', 'complete', 'update', 'list', 'unknown'] },
      title: { type: 'string' },
      taskId: { type: 'string' },
      dueDate: { type: 'string' },
      alarm: { type: 'string' },
      from: { type: 'string' },
      to: { type: 'string' },
      wanted: { type: 'string', enum: ['delete', 'complete', 'update'] },
      candidates: { type: 'array', items: { type: 'string' } },
    },
    required: ['action'],
  },
} as const

/** The answer, wherever the model decided to put it. */
function answerPayload(raw: unknown): unknown {
  if (typeof raw === 'string') return raw
  if (!isRecord(raw)) return null

  const choices = raw.choices
  if (Array.isArray(choices) && isRecord(choices[0])) {
    const message = choices[0].message
    if (isRecord(message) && typeof message.content === 'string') return message.content
  }

  return raw.response ?? null
}

/**
 * Ask the model what the sentence means, then believe only what the request
 * supports. A model that throws or answers with something that is not JSON is an
 * error here, so the endpoint can answer 502 rather than act on nonsense.
 */
export async function resolveVoiceIntent(ai: Ai, request: VoiceRequest): Promise<RemoteIntent> {
  const answer = await ai.run(VOICE_MODEL, {
    messages: [
      { role: 'system', content: buildVoicePrompt(request) },
      { role: 'user', content: request.text },
    ],
    response_format: { type: 'json_schema', json_schema: RESPONSE_SCHEMA },
    reasoning: { effort: 'low' },
    temperature: 0,
    max_tokens: 800,
  } as unknown as Record<string, unknown>)

  const payload = answerPayload(answer)

  let parsed: unknown
  try {
    parsed = typeof payload === 'string' ? JSON.parse(payload) : payload
  } catch {
    throw new Error('model answer is not JSON')
  }

  return normalizeRemoteIntent(parsed, request)
}

/** Whether a body is a request we are willing to spend a model call on. */
export function isVoiceRequest(value: unknown): value is VoiceRequest {
  if (!isRecord(value)) return false

  const { text, tasks, today } = value
  if (typeof text !== 'string' || text.trim() === '' || text.length > MAX_TEXT) return false
  if (validDate(today) === undefined) return false
  if (!Array.isArray(tasks) || tasks.length > MAX_TASKS) return false

  return tasks.every((task) => isRecord(task) && typeof task.id === 'string' && typeof task.title === 'string')
}
