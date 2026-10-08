import { describe, expect, it } from 'vitest'

import type { Task } from '@/lib/task'
import { matchTaskTitles, normalizeTr, type TitleMatch } from '@/lib/voice-match'

// Pinned fixtures: fixed dates, no clock, no locale.
const CREATED = new Date('2026-01-02T09:00:00.000Z')
const DUE = '2026-01-03'

function task(id: string, title: string): Task {
  return {
    id,
    title,
    type: 'text',
    completed: false,
    createdDate: CREATED,
    lastEditedDate: CREATED,
    dueDate: DUE,
  }
}

const T1 = task('T1', 'Süt al')
const T2 = task('T2', 'Kart al Aleyna')
const T3 = task('T3', 'Lab raporunu teslim et')
const T4 = task('T4', 'Annemi ara')
const T5 = task('T5', 'Elektrik faturasını öde')
const T7 = task('T7', 'Diş hekimi randevusu')
const T8 = task('T8', 'Spor salonuna git')
const T10 = task('T10', 'Berber randevusu')

const ALL = [T1, T2, T3, T4, T5, T7, T8, T10]

function ids(matches: TitleMatch[]): string[] {
  return matches.map((match) => match.task.id)
}

describe('normalizeTr', () => {
  // Issue case 1
  it('case 1: lower-cases Turkish letters and drops the apostrophe', () => {
    expect(normalizeTr("SÜT AL'I")).toBe('süt alı')
  })

  // Issue case 2
  it('case 2: strips sentence punctuation and lower-cases', () => {
    expect(normalizeTr("Kart al Aleyna'yı sil!")).toBe('kart al aleynayı sil')
  })

  it('keeps digits and drops the other punctuation characters', () => {
    expect(normalizeTr('Süt al, (sütlü) [2lt] - "hemen"')).toBe('süt al sütlü 2lt hemen')
    expect(normalizeTr('50 Şınav!')).toBe('50 şınav')
  })

  it('collapses whitespace runs and trims', () => {
    expect(normalizeTr('  Süt   al  ')).toBe('süt al')
  })

  it('lower-cases every Turkish letter, I to dotless ı', () => {
    expect(normalizeTr('İğ Şş Ââ Öö Üü Çç')).toBe('iğ şş ââ öö üü çç')
    expect(normalizeTr('IŞIK')).toBe('ışık')
  })
})

describe('matchTaskTitles', () => {
  // Issue case 3
  it('case 3: ranks the exact title first when the command carries a stopword', () => {
    const matches = matchTaskTitles('Süt al görevini sil', [T1, T2])
    expect(matches[0]).toEqual({ task: T1, score: 1 })
  })

  // Issue case 4
  it('case 4: ranks the exact title first when the title carries a suffix', () => {
    const matches = matchTaskTitles("Kart al Aleyna'yı sil", [T1, T2])
    expect(matches[0]).toEqual({ task: T2, score: 1 })
  })

  // Issue case 5
  it('case 5: matches every word of the title for a score of 1', () => {
    const matches = matchTaskTitles('Annemi ara yaptım', [T4])
    expect(matches).toHaveLength(1)
    expect(matches[0].task).toBe(T4)
    expect(matches[0].score).toBe(1)
  })

  // Issue case 6
  it('case 6: partial overlap still scores at least half', () => {
    const matches = matchTaskTitles('Elektrik faturası bitti', [T5])
    expect(matches).toHaveLength(1)
    expect(matches[0].task).toBe(T5)
    expect(matches[0].score).toBeGreaterThanOrEqual(0.5)
  })

  // Issue case 7
  it('case 7: returns both randevusu tasks, sorted by score descending', () => {
    const matches = matchTaskTitles('Randevu görevini sil', [T7, T10])
    expect(matches).toHaveLength(2)
    expect(ids(matches)).toEqual(['T10', 'T7'])
    expect(matches[0].score).toBeGreaterThan(0)
    expect(matches[1].score).toBeGreaterThan(0)
    expect(matches[0].score).toBeGreaterThan(matches[1].score)
  })

  // Issue case 8
  it('case 8: short title words do not match long command words', () => {
    expect(matchTaskTitles('Alışveriş görevini sil', ALL)).toEqual([])
  })

  // Issue case 9
  it('case 9: a case suffix on the last title word is tolerated', () => {
    const matches = matchTaskTitles('Süt alı sil', [T1])
    expect(matches).toHaveLength(1)
    expect(matches[0].task).toBe(T1)
    expect(matches[0].score).toBe(1)
  })

  // Issue case 10
  it('case 10: an empty or whitespace-only command matches nothing', () => {
    expect(matchTaskTitles('', [T1])).toEqual([])
    expect(matchTaskTitles('   ', [T1])).toEqual([])
  })

  it('tolerates the Turkish case suffixes on the last word', () => {
    for (const command of ['Süt al sil', 'Süt alı sil', 'Süt ali sil', 'Süt alıı sil']) {
      const matches = matchTaskTitles(command, [T1])
      expect(matches).toHaveLength(1)
      expect(matches[0].score).toBe(1)
    }
  })

  it('matches a title word only through non-command stopwords', () => {
    expect(matchTaskTitles('sil', [task('TS', 'Sil')])).toEqual([])
  })

  it('scores a partial overlap below a full-title match', () => {
    const matches = matchTaskTitles('Kart süt', [T1])
    expect(matches).toHaveLength(1)
    expect(matches[0].task).toBe(T1)
    expect(matches[0].score).toBeCloseTo(0.5)
    expect(matches[0].score).toBeLessThan(1)
  })

  it('keeps the original task order when scores tie', () => {
    const x = task('X', 'Kart süt')
    const y = task('Y', 'Süt kart')
    expect(ids(matchTaskTitles('Süt', [x, y]))).toEqual(['X', 'Y'])
    expect(ids(matchTaskTitles('Süt', [y, x]))).toEqual(['Y', 'X'])
  })
})

describe('matchTaskTitles natural Turkish', () => {
  const A = task('A', 'ses kaydi ekleme')

  // Issue case 14
  it('case 14: finds a task through a spoken command with dotted and dotless ı', () => {
    const matches = matchTaskTitles('ses kaydı ekleme notunu siler misin', [A])

    expect(matches).toHaveLength(1)
    expect(matches[0].task).toBe(A)
    expect(matches[0].score).toBe(1)
  })

  // Behaviour rule 4: filler words are stopwords, so they never match a title.
  it('never matches a filler word as a title word', () => {
    expect(matchTaskTitles('bir', [task('F', 'Bir')])).toEqual([])
    expect(matchTaskTitles('lütfen', [task('L', 'Lütfen')])).toEqual([])
  })

  // Behaviour rule 4: a filler around the words of a title does not break it.
  it('matches a title that a filler word sits around', () => {
    const matches = matchTaskTitles('lütfen süt al', [T1])

    expect(matches).toHaveLength(1)
    expect(matches[0].task).toBe(T1)
    expect(matches[0].score).toBe(1)
  })
})