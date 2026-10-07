// Matching a spoken Turkish command against task titles.
//
// Speech recognition hands back the way a person talks, not the way a title is
// typed: "Kart al Aleyna'yı sil" carries a command word, a case suffix and an
// apostrophe that the title "Kart al Aleyna" does not have. This module strips
// that noise and scores how well a title sits inside a command, so the voice
// intent parser can rank candidates instead of guessing.
//
// Everything here is pure — no clock, no ambient locale, no randomness — so
// the same command always ranks the same tasks in the same order.

import type { Task } from '@/lib/task'

/**
 * Speech punctuation, dropped rather than replaced by a space: Turkish writes
 * the genitive with an apostrophe (`al'ı`), so removing the mark keeps the
 * word whole. Digits and the spaces between words survive.
 */
const PUNCTUATION = /[.,!?;:'"()[\]\-]/g

/** Words a command wraps the title in — they name the action, not the task. */
const COMMAND_WORDS = [
  'sil',
  'kaldır',
  'iptal',
  'tamamla',
  'tamamladım',
  'bitti',
  'bitirdim',
  'yaptım',
  'ekle',
  'görev',
  'görevi',
  'görevin',
  'görevini',
  'görevlerim',
]

/** Normalized so the set cannot drift from `normalizeTr` by a dotted/dotless typo. */
const STOPWORDS = new Set(COMMAND_WORDS.map((word) => normalizeTr(word)))

/**
 * Below four characters a prefix says nothing: `al` is the start of `alışveriş`,
 * `git` of `gitir`, `et` of `etekle`. Long enough, a shared opening is a
 * recognisable word (`randevusu` / `randevuyu`).
 */
const MIN_PREFIX_WORD = 4
const MIN_COMMON_PREFIX = 5

/** A case suffix on the last title word: `alı` for `al`, `aleynayı` for `aleyna`. */
const MAX_CASE_SUFFIX = 3

export interface TitleMatch {
  task: Task
  score: number
}

/**
 * Lower-case with Turkish casing (`I` → `ı`, `İ` → `i`), drop speech
 * punctuation, and squeeze the whitespace runs recognition leaves behind.
 */
export function normalizeTr(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(PUNCTUATION, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitWords(text: string): string[] {
  const normalized = normalizeTr(text)
  return normalized === '' ? [] : normalized.split(' ')
}

function commonPrefixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length)
  let shared = 0
  while (shared < limit && a[shared] === b[shared]) shared += 1
  return shared
}

/**
 * Whether two normalized words can be the same word as spoken and as typed.
 * Command words never match: a task called "Sil" must not match the command
 * that asks for something else to be deleted.
 */
function wordsMatch(a: string, b: string): boolean {
  if (STOPWORDS.has(a) || STOPWORDS.has(b)) return false
  if (a === b) return true

  const shorter = a.length < b.length ? a : b
  const longer = a.length < b.length ? b : a
  if (shorter.length >= MIN_PREFIX_WORD && longer.startsWith(shorter)) return true

  return commonPrefixLength(a, b) >= MIN_COMMON_PREFIX
}

/**
 * Whether the command word is the title word plus a Turkish case suffix. The
 * window's last word is the only place this applies, because only the last word
 * of a spoken title takes one (`süt alı`, never `sütü al`).
 */
function extendsTitleWord(commandWord: string, titleWord: string): boolean {
  if (!commandWord.startsWith(titleWord)) return false
  const suffixLength = commandWord.length - titleWord.length
  return suffixLength > 0 && suffixLength <= MAX_CASE_SUFFIX
}

/**
 * Whether the whole title shows up, in order and side by side, somewhere in the
 * command: "kart al aleynayı sil" contains "Kart al Aleyna" plus a suffix.
 */
function hasFullTitleWindow(titleWords: string[], commandWords: string[]): boolean {
  const lastWord = titleWords.length - 1
  if (lastWord < 0 || titleWords.length > commandWords.length) return false

  for (let start = 0; start + titleWords.length <= commandWords.length; start += 1) {
    let fits = true

    for (let index = 0; index < titleWords.length; index += 1) {
      const titleWord = titleWords[index]
      const commandWord = commandWords[start + index]
      const matched =
        index === lastWord
          ? wordsMatch(titleWord, commandWord) || extendsTitleWord(commandWord, titleWord)
          : wordsMatch(titleWord, commandWord)

      if (!matched) {
        fits = false
        break
      }
    }

    if (fits) return true
  }

  return false
}

/** 1 for a title found whole in the command, else the share of its words that match. */
function scoreTitle(titleWords: string[], commandWords: string[]): number {
  if (hasFullTitleWindow(titleWords, commandWords)) return 1

  const matched = titleWords.filter((titleWord) =>
    commandWords.some((commandWord) => wordsMatch(titleWord, commandWord))
  ).length

  return matched / titleWords.length
}

/**
 * Rank tasks by how well their title matches a spoken command, best first.
 * Only matches (score above zero) come back, and tasks that score the same keep
 * the order they arrived in.
 */
export function matchTaskTitles(command: string, tasks: Task[]): TitleMatch[] {
  const commandWords = splitWords(command)
  if (commandWords.length === 0) return []

  const ranked: Array<{ match: TitleMatch; position: number }> = []

  for (let position = 0; position < tasks.length; position += 1) {
    const task = tasks[position]
    const titleWords = splitWords(task.title)
    if (titleWords.length === 0) continue

    const score = scoreTitle(titleWords, commandWords)
    if (score > 0) ranked.push({ match: { task, score }, position })
  }

  ranked.sort((a, b) => b.match.score - a.match.score || a.position - b.position)

  return ranked.map((entry) => entry.match)
}
