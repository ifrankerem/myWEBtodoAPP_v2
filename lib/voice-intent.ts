// Turning a spoken Turkish command into an intent.
//
// Voice input arrives as one sentence the way a person says it, so this parser
// works on words instead of a grammar: find the verb the user meant, then read
// the date, clock time, repeat and title around it. What comes out is the same
// strings the screens already store, so a parsed command can be applied to a
// task without a second translation step.
//
// Everything derives from the `today` the caller passes in — no clock, no
// ambient locale — so the same command parses the same way on any machine.

import type { Task } from '@/lib/task'
import { matchTaskTitles } from '@/lib/voice-match'

export type VoiceRepeat = 'daily' | 'weekdays'

export type VoiceIntent =
  | { action: 'create'; title: string; dueDate?: string; alarm?: string; repeat?: VoiceRepeat }
  | { action: 'complete'; task: Task }
  | { action: 'delete'; task: Task }
  | { action: 'update'; task: Task; updates: { title?: string; dueDate?: string; alarm?: string } }
  | { action: 'list'; from?: string; to?: string; hasAlarm?: true }
  | { action: 'confirm'; candidates: Task[]; wanted: 'delete' | 'complete' | 'update' }
  | { action: 'unknown' }

/** One whitespace-delimited piece of the command, with its comparable form. */
interface Token {
  raw: string
  key: string
}

/** Where a phrase sits in the token list, and how many tokens it covers. */
interface Span {
  start: number
  length: number
}

interface DateSpan extends Span {
  date: string
}

interface TimeSpan extends Span {
  time: string
}

type CreateIntent = Extract<VoiceIntent, { action: 'create' }>
type UpdateIntent = Extract<VoiceIntent, { action: 'update' }>
type ListIntent = Extract<VoiceIntent, { action: 'list' }>

/** Turkish case suffixes are short; a longer tail is a different word. */
const MAX_SUFFIX = 3

/** A title that clears this share of its words is acted on without asking. */
const DIRECT_SCORE = 0.5

/** How many titles to offer when more than one of them could be meant. */
const MAX_CANDIDATES = 3

/** Weekday names mapped to `Date#getDay`, so Monday is 1 and Sunday is 0. */
const WEEKDAY_DAYS: Record<string, number> = {
  pazartesi: 1,
  salı: 2,
  çarşamba: 3,
  perşembe: 4,
  cuma: 5,
  cumartesi: 6,
  pazar: 0,
}

const DELETE_VERBS = ['sil', 'kaldır']
const DELETE_PHRASES = [
  ['iptal', 'et'],
  ['yok', 'et'],
]

const COMPLETE_VERBS = ['tamamla', 'tamamladım', 'bitir', 'bitirdim', 'bitti', 'yaptım']

const UPDATE_VERBS = ['ertele', 'taşı', 'değiştir', 'yap']
const UPDATE_PHRASES = [
  ['alarm', 'ekle'],
  ['alarm', 'kur'],
  ['bir', 'hafta', 'ileri'],
  ['bir', 'hafta', 'sonra'],
]

const RENAME_VERBS = ['adını', 'adini', 'ismini', 'ismi']
const MAKE_VERB = 'yap'

const CREATE_MARKERS = [
  ['tekrar', 'eden', 'görev'],
  ['yeni', 'görev'],
  ['görev', 'ekle'],
  ['görev', 'oluştur'],
  ['görev', 'kur'],
  ['ekle'],
  ['oluştur'],
]

const LIST_WORDS = ['göster', 'listele', 'görevlerim', 'hangi', 'hangileri', 'neler']

const REPEATS: Array<{ words: string[]; repeat: VoiceRepeat }> = [
  { words: ['her', 'gün'], repeat: 'daily' },
  { words: ['hafta', 'içi'], repeat: 'weekdays' },
]

/** `20:00`, and nothing else — a bare number is a count, not a clock. */
const CLOCK = /^(\d{1,2}):(\d{2})$/

/** An hour with whatever Turkish case suffix follows it: `9`, `9a`, `9de`. */
const HOUR_WORD = /^(\d{1,2})[a-zçğıöşü]*$/

// ---------------------------------------------------------------------------
// Words

function tokenKey(raw: string): string {
  return raw
    .toLocaleLowerCase('tr-TR')
    // Keep digits, `:` and letters. The apostrophe belongs to the word
    // (`9'a`), the sentence marks do not.
    .replace(/[.,!?;'"()[\]]/g, '')
    // A colon at the end separates what follows (`görev:`); one inside the
    // token is a clock time (`20:00`).
    .replace(/:+$/, '')
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  for (const raw of text.split(/\s+/)) {
    if (raw !== '') tokens.push({ raw, key: tokenKey(raw) })
  }
  return tokens
}

/**
 * Equality, or the word plus a short Turkish case suffix — `bitirdim` for
 * `bitir`, `cumaya` for `cuma`. Short words must match exactly, or `al` would
 * swallow half the vocabulary.
 */
function matchesWord(key: string | undefined, word: string): boolean {
  if (key === undefined) return false
  if (key === word) return true
  if (word.length < 4) return false
  const suffixLength = key.length - word.length
  return suffixLength > 0 && suffixLength <= MAX_SUFFIX && key.startsWith(word)
}

function matchesAnyWord(keys: string[], words: string[]): boolean {
  return keys.some((key) => words.some((word) => matchesWord(key, word)))
}

function phraseAt(keys: string[], start: number, words: string[]): boolean {
  return words.every((word, offset) => matchesWord(keys[start + offset], word))
}

function hasPhrase(keys: string[], words: string[]): boolean {
  for (let start = 0; start + words.length <= keys.length; start += 1) {
    if (phraseAt(keys, start, words)) return true
  }
  return false
}

/**
 * The first unclaimed place where `probe` recognizes a phrase, so an earlier
 * match — the date before the title, say — is not read twice.
 */
function findSpan<T extends Span>(
  keys: string[],
  probe: (index: number) => T | null,
  claimed: boolean[] = []
): T | null {
  for (let index = 0; index < keys.length; index += 1) {
    if (claimed[index]) continue
    const span = probe(index)
    if (span) return span
  }
  return null
}

function claim(claimed: boolean[], span: Span): void {
  for (let offset = 0; offset < span.length; offset += 1) claimed[span.start + offset] = true
}

// ---------------------------------------------------------------------------
// Dates and clock times

function toDateString(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Calendar-day arithmetic on local parts, so no timezone can move the day. */
function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  copy.setDate(copy.getDate() + days)
  return copy
}

function parseDateString(value: string | undefined): Date | null {
  if (value === undefined) return null
  const parts = value.split('-').map(Number)
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return null
  const [year, month, day] = parts
  return new Date(year, month - 1, day)
}

function weekdayOf(key: string | undefined): number | undefined {
  if (key === undefined) return undefined
  for (const [name, day] of Object.entries(WEEKDAY_DAYS)) {
    if (matchesWord(key, name)) return day
  }
  return undefined
}

/** The coming occurrence of a weekday, today counting as today. */
function nextWeekday(today: Date, weekday: number): Date {
  return addDays(today, (weekday - today.getDay() + 7) % 7)
}

function dateAt(keys: string[], index: number, today: Date): DateSpan | null {
  const key = keys[index]

  if (matchesWord(key, 'bugün')) return { start: index, length: 1, date: toDateString(today) }

  if (matchesWord(key, 'yarın')) {
    return { start: index, length: 1, date: toDateString(addDays(today, 1)) }
  }

  if (matchesWord(key, 'ertesi') && matchesWord(keys[index + 1], 'gün')) {
    return { start: index, length: 2, date: toDateString(addDays(today, 1)) }
  }

  if (matchesWord(key, 'bir') && matchesWord(keys[index + 1], 'hafta')) {
    const length = matchesWord(keys[index + 2], 'ileri') || matchesWord(keys[index + 2], 'sonra') ? 3 : 2
    return { start: index, length, date: toDateString(addDays(today, 7)) }
  }

  if (matchesWord(key, 'gelecek')) {
    const weekday = weekdayOf(keys[index + 1])
    if (weekday !== undefined) {
      return { start: index, length: 2, date: toDateString(addDays(nextWeekday(today, weekday), 7)) }
    }
  }

  const weekday = weekdayOf(key)
  if (weekday !== undefined) {
    return { start: index, length: 1, date: toDateString(nextWeekday(today, weekday)) }
  }

  return null
}

/** `for` after a date carries no meaning: "yarın için görev ekle". */
function withForSuffix(keys: string[], span: Span): Span {
  const after = span.start + span.length
  return matchesWord(keys[after], 'için') ? { start: span.start, length: span.length + 1 } : span
}

/** `bir hafta ileri` / `bir hafta sonra`: a week, from wherever it is anchored. */
function isAWeekLater(keys: string[], index: number): boolean {
  return (
    matchesWord(keys[index], 'bir') &&
    matchesWord(keys[index + 1], 'hafta') &&
    (matchesWord(keys[index + 2], 'ileri') || matchesWord(keys[index + 2], 'sonra'))
  )
}

function isDateWord(key: string | undefined): boolean {
  return matchesWord(key, 'bugün') || matchesWord(key, 'yarın') || weekdayOf(key) !== undefined
}

function pad(value: number): string {
  return `${value}`.padStart(2, '0')
}

/** `20:00` → `20:00`, `8:30` → `08:30`. Rejects anything off the clock. */
function clockAt(key: string | undefined): string | null {
  const parts = CLOCK.exec(key ?? '')
  if (!parts) return null
  const hour = Number(parts[1])
  const minute = Number(parts[2])
  if (hour > 23 || minute > 59) return null
  return `${pad(hour)}:${pad(minute)}`
}

/** `9`, `9a`, `9de` → `9`; `50` → null, because fifty o'clock is not a time. */
function hourAt(key: string | undefined): number | null {
  const parts = HOUR_WORD.exec(key ?? '')
  if (!parts) return null
  const hour = Number(parts[1])
  return hour > 23 ? null : hour
}

/**
 * A clock time, with the word that introduces it. A bare number stays part of
 * the title — "50 şınav" is not a reminder at half past midnight.
 */
function timeAt(keys: string[], index: number): TimeSpan | null {
  const key = keys[index]

  if (matchesWord(key, 'saat')) {
    const clock = clockAt(keys[index + 1])
    if (clock) return { start: index, length: 2, time: clock }
    const hour = hourAt(keys[index + 1])
    if (hour !== null) return { start: index, length: 2, time: `${pad(hour)}:00` }
    return null
  }

  const clock = clockAt(key)
  if (clock) return { start: index, length: 1, time: clock }

  const isEvening = matchesWord(key, 'akşam')
  if (isEvening || matchesWord(key, 'sabah')) {
    const hour = hourAt(keys[index + 1])
    if (hour === null) return null
    const spoken = isEvening && hour < 12 ? hour + 12 : hour
    return { start: index, length: 2, time: `${pad(spoken)}:00` }
  }

  return null
}

function repeatAt(keys: string[], index: number): (Span & { repeat: VoiceRepeat }) | null {
  for (const candidate of REPEATS) {
    if (phraseAt(keys, index, candidate.words)) {
      return { start: index, length: candidate.words.length, repeat: candidate.repeat }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Flows

function createAt(keys: string[], index: number): Span | null {
  for (const marker of CREATE_MARKERS) {
    if (phraseAt(keys, index, marker)) return { start: index, length: marker.length }
  }
  return null
}

function isUpdateCommand(keys: string[]): boolean {
  if (matchesAnyWord(keys, UPDATE_VERBS)) return true
  if (UPDATE_PHRASES.some((phrase) => hasPhrase(keys, phrase))) return true
  // `at` only reschedules next to a date — "mesajı at" sends a message.
  return keys.some((key, index) => matchesWord(key, 'at') && isDateWord(keys[index - 1]))
}

function isListCommand(keys: string[]): boolean {
  return matchesAnyWord(keys, LIST_WORDS)
}

/** The spoken title: every word the command did not spend on the parts. */
function remainingTitle(tokens: Token[], claimed: boolean[]): string {
  const words: string[] = []
  tokens.forEach((token, index) => {
    if (!claimed[index]) words.push(token.raw)
  })
  return words.join(' ').replace(/^[\s:;,]+/, '').trim()
}

function parseCreate(tokens: Token[], keys: string[], today: Date): VoiceIntent {
  const claimed = keys.map(() => false)

  const marker = findSpan(keys, (index) => createAt(keys, index))
  if (!marker) return { action: 'unknown' }
  claim(claimed, marker)

  const date = findSpan(keys, (index) => dateAt(keys, index, today), claimed)
  if (date) claim(claimed, withForSuffix(keys, date))

  const time = findSpan(keys, (index) => timeAt(keys, index), claimed)
  if (time) claim(claimed, time)

  const repeat = findSpan(keys, (index) => repeatAt(keys, index), claimed)
  if (repeat) claim(claimed, repeat)

  // "alarmlı" only says the task should ring; the clock came with `sabah 9`.
  const alarmFlag = findSpan(
    keys,
    (index) => (matchesWord(keys[index], 'alarmlı') ? { start: index, length: 1 } : null),
    claimed
  )
  if (alarmFlag) claim(claimed, alarmFlag)

  const title = remainingTitle(tokens, claimed)
  if (title === '') return { action: 'unknown' }

  const intent: CreateIntent = { action: 'create', title }
  if (date) intent.dueDate = date.date
  if (time) intent.alarm = time.time
  if (repeat) intent.repeat = repeat.repeat
  return intent
}

function parseList(keys: string[], today: Date): VoiceIntent {
  const intent: ListIntent = { action: 'list' }

  if (hasPhrase(keys, ['bu', 'hafta'])) {
    const monday = addDays(today, -((today.getDay() + 6) % 7))
    intent.from = toDateString(monday)
    intent.to = toDateString(addDays(monday, 6))
  } else if (findSpan(keys, (index) => (matchesWord(keys[index], 'yarın') ? { start: index, length: 1 } : null))) {
    const tomorrow = toDateString(addDays(today, 1))
    intent.from = tomorrow
    intent.to = tomorrow
  }

  if (findSpan(keys, (index) => (matchesWord(keys[index], 'alarmlı') ? { start: index, length: 1 } : null))) {
    intent.hasAlarm = true
  }

  return intent
}

/** `adını iki paket süt al yap` renames the task to the words before `yap`. */
function parseRename(tokens: Token[], keys: string[]): string | undefined {
  for (let index = 0; index < keys.length; index += 1) {
    if (!RENAME_VERBS.some((verb) => matchesWord(keys[index], verb))) continue

    let end = index + 1
    while (end < keys.length && !matchesWord(keys[end], MAKE_VERB)) end += 1

    const title = tokens
      .slice(index + 1, end)
      .map((token) => token.raw)
      .join(' ')
      .replace(/^[\s:;,]+/, '')
      .trim()

    return title === '' ? undefined : title
  }

  return undefined
}

function parseUpdates(tokens: Token[], keys: string[], task: Task, today: Date): UpdateIntent['updates'] {
  const updates: UpdateIntent['updates'] = {}

  const title = parseRename(tokens, keys)
  if (title !== undefined) updates.title = title

  // "bir hafta ileri" postpones from where the task already sits, not from today.
  const from = parseDateString(task.dueDate) ?? today
  const postpone = findSpan(keys, (index) => (isAWeekLater(keys, index) ? { start: index, length: 3 } : null))
  const date = postpone
    ? { start: postpone.start, length: postpone.length, date: toDateString(addDays(from, 7)) }
    : findSpan(keys, (index) => dateAt(keys, index, today))
  if (date) updates.dueDate = date.date

  const time = findSpan(keys, (index) => timeAt(keys, index))
  if (time) updates.alarm = time.time

  return updates
}

/**
 * The flow's verb plus the titles `matchTaskTitles` ranked. One title that
 * clearly wins is acted on; several that could be meant go back to the user.
 */
function resolveFlow(
  action: 'delete' | 'complete' | 'update',
  text: string,
  tasks: Task[],
  tokens: Token[],
  keys: string[],
  today: Date
): VoiceIntent {
  const matches = matchTaskTitles(text, tasks)
  if (matches.length === 0) return { action: 'unknown' }

  const certain = matches.filter((match) => match.score > DIRECT_SCORE)
  if (certain.length === 1) {
    const { task } = certain[0]
    if (action === 'update') return { action: 'update', task, updates: parseUpdates(tokens, keys, task, today) }
    return { action, task }
  }

  const candidates = matches.slice(0, MAX_CANDIDATES).map((match) => match.task)
  return { action: 'confirm', candidates, wanted: action }
}

export function parseVoiceCommand(text: string, tasks: Task[], today: Date): VoiceIntent {
  const tokens = tokenize(text)
  const keys = tokens.map((token) => token.key)
  if (keys.length === 0) return { action: 'unknown' }

  if (matchesAnyWord(keys, DELETE_VERBS) || DELETE_PHRASES.some((phrase) => hasPhrase(keys, phrase))) {
    return resolveFlow('delete', text, tasks, tokens, keys, today)
  }

  if (matchesAnyWord(keys, COMPLETE_VERBS)) {
    return resolveFlow('complete', text, tasks, tokens, keys, today)
  }

  if (isUpdateCommand(keys)) {
    return resolveFlow('update', text, tasks, tokens, keys, today)
  }

  if (findSpan(keys, (index) => createAt(keys, index))) {
    return parseCreate(tokens, keys, today)
  }

  if (isListCommand(keys)) return parseList(keys, today)

  return { action: 'unknown' }
}
