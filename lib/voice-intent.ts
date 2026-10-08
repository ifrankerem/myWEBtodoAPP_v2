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
import { matchTaskTitles, VOICE_FILLERS } from '@/lib/voice-match'

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

/**
 * Delete verbs as people say them: `sil`, `siler`, `silebilir`, `silelim`,
 * `silermisin`. Only the listed tails count, so `silgi` and `silah` stay nouns.
 */
const DELETE_STEMS = ['sil', 'kaldır']
const DELETE_TAILS = ['', 'er', 'ebilir', 'abilir', 'elim', 'in', 'ir']
const DELETE_PHRASES = [
  ['iptal', 'et'],
  ['yok', 'et'],
]

const COMPLETE_VERBS = [
  'tamamla',
  'tamamlandı',
  'tamamladım',
  'tamamlayabilir',
  'bitir',
  'bitirdim',
  'bitti',
  'yaptım',
  'hallettim',
]

/** The ending a finished verb takes: `kahve aldım` for the task `kahve al`. */
const PAST_TENSE_TAILS = ['dım', 'dim', 'dum', 'düm', 'tım', 'tim', 'tum', 'tüm']

/** The question tail, which turns a verb into a polite ask. */
const QUESTION_TAILS = ['misin', 'musun', 'müsün']

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
  ['hatırlat'],
  ['ekle'],
  ['oluştur'],
]

/**
 * The verbal noun of a create marker names a task, not an action: "ses kaydı
 * ekleme notu" is a note about adding a recording, and "ekleme" there must not
 * turn the sentence into a create.
 */
const NOT_A_MARKER = ['ekleme', 'oluşturma', 'görevi']

/**
 * Create markers as people say them, stem plus the tails Turkish adds:
 * "ekle", "ekler", "ekleyebilir", "ekleyin", "oluşturur musun". Only these tails
 * count, so the nouns above stay out.
 */
const CREATE_STEMS = ['ekle', 'oluştur', 'hatırlat', 'kur']
const CREATE_TAILS = [
  '',
  'r',
  'ur',
  'ler',
  'yebilir',
  'abilir',
  'yin',
  'ylim',
  'sun',
  'sin',
  'sen',
  'yeyim',
]

const LIST_WORDS = ['göster', 'listele', 'görevlerim', 'hangi', 'hangileri', 'neler', 'ne', 'var']

/** "saat 9 da", "yarın da": the case suffix belongs to the time or date. */
const DETACHED_SUFFIXES = ['da', 'de', 'ta', 'te', 'a', 'e', 'ya', 'ye', 'dan', 'den']

/** "bana ... diye hatırlat": the dative opening of a reminder. */
const REMINDER_OPENERS = ['bana', 'benim']

/** "süt almayı hatırlat": the accusative of a verbal noun, minus the noun. */
const REMINDER_SUFFIXES = ['mayı', 'meyi']

const REPEATS: Array<{ words: string[]; repeat: VoiceRepeat }> = [
  { words: ['her', 'gün'], repeat: 'daily' },
  { words: ['hafta', 'içi'], repeat: 'weekdays' },
]

/**
 * A clock time as the recognizer writes it: `9:00`, `9.00`, `21:30`, `21.30`,
 * each with an optional Turkish case suffix fused on (`9.00da`, `9:00'de` →
 * `9:00de`). A bare number is a count, not a clock.
 */
const CLOCK = /^(\d{1,2})[:.](\d{2})[a-zçğıöşü]*$/

/** An hour with whatever Turkish case suffix follows it: `9`, `9a`, `9de`. */
const HOUR_WORD = /^(\d{1,2})[a-zçğıöşü]*$/

/** Turkish number words for the hours 1–12, as in "saat dokuzda". */
const HOUR_NAMES: Record<string, number> = {
  bir: 1,
  iki: 2,
  üç: 3,
  dört: 4,
  beş: 5,
  altı: 6,
  yedi: 7,
  sekiz: 8,
  dokuz: 9,
  on: 10,
  onbir: 11,
  oniki: 12,
}

/** Hours a part of the day shifts by: "akşam 8" is 20:00, "sabah 9" is 09:00. */
const PART_OF_DAY: Record<string, number> = {
  sabah: 0,
  öğlen: 0,
  akşam: 12,
  gece: 12,
}

// ---------------------------------------------------------------------------
// Words

/** Stands in for the dot of `9.00` while the sentence marks are stripped. */
const DOT_PLACEHOLDER = '<dot>'

function tokenKey(raw: string): string {
  return raw
    .toLocaleLowerCase('tr-TR')
    // The recognizer writes a clock time with a dot (`9.00`); that dot stays.
    .replace(/(\d)\.(?=\d)/g, `$1${DOT_PLACEHOLDER}`)
    // Keep digits, `:` and letters. The apostrophe belongs to the word
    // (`9'a`), the sentence marks do not.
    .replace(/[.,!?;'"()[\]]/g, '')
    .replace(/<dot>/g, '.')
    // A colon at the end separates what follows (`görev:`); one inside the
    // token is a clock time (`20:00`).
    .replace(/:+$/, '')
}

/**
 * Speech recognition writes `kaydı` where the user typed `kaydi`, and the two
 * name the same task. Folding is for comparing words only — the title keeps the
 * spelling the user said.
 */
function foldI(word: string): string {
  return word.replace(/ı/g, 'i')
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  for (const raw of text.split(/\s+/)) {
    if (raw !== '') tokens.push({ raw, key: foldI(tokenKey(raw)) })
  }
  return tokens
}

/** The keys of a stored title, for comparing it against a spoken sentence. */
function splitWords(text: string): string[] {
  return tokenize(text).map((token) => token.key)
}

/**
 * Equality, or the word plus a short Turkish case suffix — `bitirdim` for
 * `bitir`, `cumaya` for `cuma`. Short words must match exactly, or `al` would
 * swallow half the vocabulary.
 */
function matchesWord(key: string | undefined, word: string): boolean {
  if (key === undefined) return false

  // Both sides fold: keys are folded on the way in, and the tables below are
  // written in the spelling a person uses.
  const spoken = foldI(key)
  const said = foldI(word)
  if (spoken === said) return true
  if (said.length < 4) return false
  const suffixLength = spoken.length - said.length
  return suffixLength > 0 && suffixLength <= MAX_SUFFIX && spoken.startsWith(said)
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

/**
 * A case suffix spoken on its own belongs to the word before it: "yarın saat 9
 * da" is tomorrow at nine, not a title starting with "da".
 */
function withDetachedSuffix(keys: string[], span: Span): Span {
  const after = span.start + span.length
  const next = keys[after]
  if (next === undefined) return span
  return DETACHED_SUFFIXES.includes(next) ? { start: span.start, length: span.length + 1 } : span
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

/**
 * What part of the day a word names, and how many words it took to say it, or
 * undefined when it names none. "öğleden sonra" is two words.
 */
function partOfDayAt(keys: string[], index: number): { shift: number; length: number } | undefined {
  if (matchesWord(keys[index], 'öğleden') && matchesWord(keys[index + 1], 'sonra')) {
    return { shift: PART_OF_DAY.akşam, length: 2 }
  }

  for (const [word, shift] of Object.entries(PART_OF_DAY)) {
    if (matchesWord(keys[index], word)) return { shift, length: 1 }
  }
  return undefined
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
 * `dokuz`, `dokuza`, `dokuzda` → `9`; also the eleven and twelve the recognizer
 * writes as one word or as two, `on bir` and `onbir`.
 */
function hourNameAt(keys: string[], index: number): { hour: number; length: number } | null {
  const key = keys[index]
  if (key === undefined) return null

  // Strip a case suffix the way Turkish attaches it: "dokuz" + "da" → "dokuzda".
  for (const [name, hour] of Object.entries(HOUR_NAMES)) {
    const spoken = foldI(key)
    if (spoken === name || (spoken.startsWith(name) && spoken.length - name.length <= MAX_SUFFIX)) {
      return { hour, length: 1 }
    }
  }

  // "on bir" arrives as two words, and the suffix lands on the second.
  if (foldI(key) === 'on') {
    const rest = hourNameAt(keys, index + 1)
    if (rest !== null && rest.hour >= 1 && rest.hour <= 2) return { hour: 10 + rest.hour, length: 2 }
  }

  return null
}

/** The hour a token carries, as digits or as a number word, or null. */
function spokenHourAt(keys: string[], index: number): { hour: number; length: number } | null {
  const digits = hourAt(keys[index])
  if (digits !== null) return { hour: digits, length: 1 }
  return hourNameAt(keys, index)
}

/**
 * A clock time, with the words that introduce it. A bare number stays part of
 * the title — "50 şınav" is not a reminder at half past midnight, and "iki süt
 * al" is not a reminder at two either. A number word counts only after `saat` or
 * a part of the day, so the title keeps the ones that are not hours.
 */
function timeAt(keys: string[], index: number): TimeSpan | null {
  const key = keys[index]

  if (matchesWord(key, 'saat')) {
    const clock = clockAt(keys[index + 1])
    if (clock) return { start: index, length: 2, time: clock }

    const hour = spokenHourAt(keys, index + 1)
    if (hour !== null) return { start: index, length: 1 + hour.length, time: `${pad(hour.hour)}:00` }
    return null
  }

  // A part of the day belongs to the time after it: "akşam 20.00" is twenty
  // o'clock, and the word is spent with the clock rather than left in the title.
  // With a clock time the clock decides, since it already says which hour.
  const part = partOfDayAt(keys, index)
  if (part !== undefined) {
    const after = index + part.length
    const clock = clockAt(keys[after])
    if (clock) return { start: index, length: part.length + 1, time: clock }

    const hour = spokenHourAt(keys, after)
    if (hour === null) return null
    const spoken = part.shift === 12 && hour.hour < 12 ? hour.hour + 12 : hour.hour
    return { start: index, length: part.length + hour.length, time: `${pad(spoken)}:00` }
  }

  const clock = clockAt(key)
  if (clock) return { start: index, length: 1, time: clock }

  return null
}

/**
 * What a bare number word or digit counts as, right after `saat` or a part of
 * the day: `dokuzda` is nine, and nothing else is a time here.
 */
function bareTimeAt(keys: string[], index: number): TimeSpan | null {
  const key = keys[index]
  if (key === undefined) return null

  // A clock needs no help: "9.00", "9:00" and "21.30" are times wherever they
  // stand, since no title of a task contains one.
  const clock = clockAt(key)
  if (clock) return { start: index, length: 1, time: clock }

  // "9'da" arrives as "9da": a bare hour with its case suffix. A bare "9"
  // without one is a count, as in "50 şınav".
  if (HOUR_WORD.test(key) && key.length > 1) {
    const hour = hourAt(key)
    if (hour !== null) return { start: index, length: 1, time: `${pad(hour)}:00` }
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

/**
 * Whether a word asks to create: `ekle`, `ekler misin`, `ekleyebilir misin`,
 * `oluşturur musun`. Only the listed verb tails count, so the nouns above and
 * words like `ekşi` stay out.
 */
function isCreateVerb(key: string | undefined): boolean {
  if (key === undefined) return false
  if (NOT_A_MARKER.some((noun) => matchesWord(key, noun))) return false

  for (const stem of CREATE_STEMS) {
    if (!key.startsWith(stem)) continue

    const tail = key.slice(stem.length)
    for (const ending of CREATE_TAILS) {
      if (tail === ending) return true
      // A question fused onto the verb: "eklermisin", "oluştururmusun".
      const question = tail.slice(ending.length)
      if (QUESTION_TAILS.some((asked) => question === asked)) return true
    }
  }
  return false
}

function createAt(keys: string[], index: number): Span | null {
  // The question particle that may follow — "ekler misin" — is a filler word,
  // so it drops out of the title on its own and needs no span here.
  if (isCreateVerb(keys[index])) return { start: index, length: 1 }

  for (const marker of CREATE_MARKERS) {
    if (phraseAt(keys, index, marker)) return { start: index, length: marker.length }
  }
  return null
}

/**
 * Whether a word asks to delete: `sil`, `siler misin`, `silermisin`,
 * `silebilir`. Only the listed verb tails count, so `silgi`, `silah` and `silik`
 * stay nouns and can be part of a title.
 */
function isDeleteVerb(key: string | undefined): boolean {
  if (key === undefined) return false
  for (const stem of DELETE_STEMS) {
    if (!key.startsWith(stem)) continue

    const tail = key.slice(stem.length)
    for (const ending of DELETE_TAILS) {
      if (tail === ending) return true
      // A question fused onto the verb: "silermisin", "silebilirmisin".
      const question = tail.slice(ending.length)
      if (QUESTION_TAILS.some((asked) => question === asked)) return true
    }
  }
  return false
}

/**
 * The finished form of a task's own verb: "kahve aldım" for the task "kahve al".
 * The sentence is the title with its last word turned into the past tense.
 */
function isPastTenseOf(keys: string[], titleWords: string[]): boolean {
  if (titleWords.length === 0 || titleWords.length !== keys.length) return false

  const last = titleWords[titleWords.length - 1]
  const finished = PAST_TENSE_TAILS.some((tail) => last + tail === keys[keys.length - 1])
  if (!finished) return false

  return keys.slice(0, -1).every((key, index) => key === titleWords[index])
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
    if (claimed[index] || VOICE_FILLERS.includes(token.key)) return
    if (REMINDER_OPENERS.includes(token.key)) return
    words.push(token.raw)
  })

  const title = words.join(' ').replace(/^[\s:;,]+/, '').trim()

  // "süt almayı hatırlat" asks for the task "süt al": the reminder carries the
  // accusative of a verbal noun, which is not part of the name.
  const last = words.length - 1
  const ending = words[last]
  const suffix = REMINDER_SUFFIXES.find((tail) => ending !== undefined && ending.endsWith(tail))
  if (suffix === undefined || ending === undefined) return title

  words[last] = ending.slice(0, -suffix.length)
  return words.join(' ').replace(/^[\s:;,]+/, '').trim()
}

function parseCreate(tokens: Token[], keys: string[], today: Date): VoiceIntent {
  const claimed = keys.map(() => false)

  const marker = findSpan(keys, (index) => createAt(keys, index))
  if (!marker) return { action: 'unknown' }
  claim(claimed, marker)

  const date = findSpan(keys, (index) => dateAt(keys, index, today), claimed)
  if (date) claim(claimed, withDetachedSuffix(keys, withForSuffix(keys, date)))

  // Every create marker in the sentence is spent, not just the first: "yeni
  // görev ekle kahve al" holds two of them and neither belongs to the title.
  for (let marker = findSpan(keys, (index) => createAt(keys, index), claimed); marker; ) {
    claim(claimed, marker)
    marker = findSpan(keys, (index) => createAt(keys, index), claimed)
  }

  const time = findSpan(keys, (index) => timeAt(keys, index) ?? bareTimeAt(keys, index), claimed)
  if (time) claim(claimed, withDetachedSuffix(keys, time))

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

  const named = (word: string) =>
    findSpan(keys, (index) => (matchesWord(keys[index], word) ? { start: index, length: 1 } : null))

  if (hasPhrase(keys, ['bu', 'hafta'])) {
    const monday = addDays(today, -((today.getDay() + 6) % 7))
    intent.from = toDateString(monday)
    intent.to = toDateString(addDays(monday, 6))
  } else if (named('yarın')) {
    const tomorrow = toDateString(addDays(today, 1))
    intent.from = tomorrow
    intent.to = tomorrow
  } else if (named('bugün')) {
    // "bugün ne var" asks about today alone, like "yarınki görevlerim".
    intent.from = toDateString(today)
    intent.to = toDateString(today)
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

  // A delete or complete verb outranks a create marker: "ses kaydi ekleme
  // notunu siler misin" deletes the note about adding a recording, it does not
  // create a task called "ses kaydi ekleme notunu siler misin".
  if (keys.some((key) => isDeleteVerb(key)) || DELETE_PHRASES.some((phrase) => hasPhrase(keys, phrase))) {
    return resolveFlow('delete', text, tasks, tokens, keys, today)
  }

  // "kahve aldım" is the finished form of the task "kahve al", so the sentence
  // can complete a task without naming a complete verb at all.
  const finishedTask = tasks.find((task) => isPastTenseOf(keys, splitWords(task.title)))
  if (finishedTask !== undefined) return { action: 'complete', task: finishedTask }

  if (matchesAnyWord(keys, COMPLETE_VERBS)) {
    return resolveFlow('complete', text, tasks, tokens, keys, today)
  }

  if (isUpdateCommand(keys)) {
    return resolveFlow('update', text, tasks, tokens, keys, today)
  }

  if (findSpan(keys, (index) => createAt(keys, index)) || keys.some((key) => isCreateVerb(key))) {
    return parseCreate(tokens, keys, today)
  }

  if (isListCommand(keys)) return parseList(keys, today)

  return { action: 'unknown' }
}
