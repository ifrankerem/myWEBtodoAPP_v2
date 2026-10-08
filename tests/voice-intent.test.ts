import { describe, expect, it } from 'vitest'

import type { Task } from '@/lib/task'
import { parseVoiceCommand, type VoiceIntent } from '@/lib/voice-intent'

// Wednesday 2026-10-07, built from local parts so no timezone can shift the day.
const TODAY = new Date(2026, 9, 7)

const CREATED = new Date(2026, 1, 2, 9, 0, 0)

function task(id: string, title: string, dueDate: string): Task {
  return {
    id,
    title,
    type: 'text',
    completed: false,
    createdDate: CREATED,
    lastEditedDate: CREATED,
    dueDate,
  }
}

const T1 = task('T1', 'Süt al', '2026-10-05')
const T2 = task('T2', 'Kart al Aleyna', '2026-10-06')
const T3 = task('T3', 'Lab raporunu teslim et', '2026-10-07')
const T4 = task('T4', 'Annemi ara', '2026-10-08')
const T5 = task('T5', 'Elektrik faturasını öde', '2026-10-09')
// Issue case 14 shifts T7's due date by a week: 2026-10-15 + 7 = 2026-10-22.
const T7 = task('T7', 'Diş hekimi randevusu', '2026-10-15')
const T8 = task('T8', 'Spor salonuna git', '2026-10-16')
const T9 = task('T9', 'Doğum günü hediyesi al', '2026-10-17')
const T10 = task('T10', 'Berber randevusu', '2026-10-18')

const ALL = [T1, T2, T3, T4, T5, T7, T8, T9, T10]

function parse(text: string, tasks: Task[] = ALL): VoiceIntent {
  return parseVoiceCommand(text, tasks, TODAY)
}

describe('parseVoiceCommand create', () => {
  // Issue case 1
  it('case 1: takes the title after the marker and adds nothing else', () => {
    expect(parse('Yeni görev: kahve al')).toEqual({ action: 'create', title: 'kahve al' })
  })

  // Issue case 2
  it('case 2: strips the weekday as a due date', () => {
    expect(parse('Görev ekle: cumartesi çöp çıkar')).toEqual({
      action: 'create',
      title: 'çöp çıkar',
      dueDate: '2026-10-10',
    })
  })

  // Issue case 3
  it('case 3: reads "mesajı at" as title text, not as a reschedule verb', () => {
    expect(parse("Yarın için görev ekle, ablama doğum günü mesajı at")).toEqual({
      action: 'create',
      title: 'ablama doğum günü mesajı at',
      dueDate: '2026-10-08',
    })
  })

  // Issue case 4
  it('case 4: reads weekday, morning time and the alarmlı marker', () => {
    expect(parse("Pazartesi sabah 9'a alarmlı görev kur, ilaç iç")).toEqual({
      action: 'create',
      title: 'ilaç iç',
      dueDate: '2026-10-12',
      alarm: '09:00',
    })
  })

  // Issue case 5
  it('case 5: reads "her gün" as a daily repeat and keeps the digits in the title', () => {
    expect(parse('Her gün tekrar eden görev: 50 şınav çek')).toEqual({
      action: 'create',
      title: '50 şınav çek',
      repeat: 'daily',
    })
  })

  // Issue case 6
  it('case 6: reads "hafta içi" as a weekday repeat', () => {
    expect(parse('Hafta içi tekrar eden görev: vitamin al')).toEqual({
      action: 'create',
      title: 'vitamin al',
      repeat: 'weekdays',
    })
  })

  it('falls back to unknown when the marker leaves no title', () => {
    expect(parse('Yeni görev')).toEqual({ action: 'unknown' })
  })

  it('adds a week to the named weekday after "gelecek"', () => {
    const intent = parse('Gelecek çarşamba için görev ekle, kahve al') as Extract<
      VoiceIntent,
      { action: 'create' }
    >
    expect(intent.action).toBe('create')
    expect(intent.dueDate).toBe('2026-10-14')
  })
})

describe('parseVoiceCommand complete and delete', () => {
  // Issue case 7
  it('case 7: completes the task the command wraps', () => {
    expect(parse('Süt al görevini tamamladım')).toEqual({ action: 'complete', task: T1 })
  })

  // Issue case 8
  it('case 8: completes on a single partial match', () => {
    expect(parse('Elektrik faturası bitti')).toEqual({ action: 'complete', task: T5 })
  })

  // Issue case 9
  it('case 9: deletes the task the command wraps', () => {
    expect(parse('Süt al görevini sil')).toEqual({ action: 'delete', task: T1 })
  })

  // Issue case 10
  it('case 10: deletes a title with a spoken case suffix', () => {
    expect(parse("Kart al Aleyna'yı sil")).toEqual({ action: 'delete', task: T2 })
  })

  // Issue case 11
  it('case 11: deletes nothing when no title matches', () => {
    expect(parse('Alışveriş görevini sil')).toEqual({ action: 'unknown' })
  })

  // Issue case 12
  it('case 12: asks which randevusu when two candidates score differently', () => {
    expect(parse('Randevu görevini sil')).toEqual({
      action: 'confirm',
      candidates: [T10, T7],
      wanted: 'delete',
    })
  })
})

describe('parseVoiceCommand update', () => {
  // Issue case 13
  it('case 13: postpones to the named weekday', () => {
    expect(parse('Lab raporunu teslim et görevini cumaya ertele')).toEqual({
      action: 'update',
      task: T3,
      updates: { dueDate: '2026-10-09' },
    })
  })

  // Issue case 14
  it('case 14: postpones by a week from the task’s own due date', () => {
    expect(parse('Diş hekimi randevusunu bir hafta ileri al')).toEqual({
      action: 'update',
      task: T7,
      updates: { dueDate: '2026-10-22' },
    })
  })

  // Issue case 15
  it('case 15: sets the alarm from a spoken clock time', () => {
    expect(parse('Annemi ara görevinin alarmını 20:00 yap')).toEqual({
      action: 'update',
      task: T4,
      updates: { alarm: '20:00' },
    })
  })

  // Issue case 16
  it('case 16: zero-pads the hour of an added alarm', () => {
    expect(parse('Diş hekimi randevusuna alarm ekle, saat 8:30')).toEqual({
      action: 'update',
      task: T7,
      updates: { alarm: '08:30' },
    })
  })

  // Issue case 17
  it('case 17: renames the task to the words before "yap"', () => {
    expect(parse('Süt al görevinin adını iki paket süt al yap')).toEqual({
      action: 'update',
      task: T1,
      updates: { title: 'iki paket süt al' },
    })
  })

  it('reads an evening hour-only alarm', () => {
    const intent = parse("Annemi ara görevinin alarmını akşam 8 yap") as Extract<
      VoiceIntent,
      { action: 'update' }
    >
    expect(intent.action).toBe('update')
    expect(intent.updates).toEqual({ alarm: '20:00' })
  })

  it('reads a morning hour-only alarm with the genitive apostrophe', () => {
    const intent = parse("Annemi ara görevinin alarmını sabah 9'a yap") as Extract<
      VoiceIntent,
      { action: 'update' }
    >
    expect(intent.action).toBe('update')
    expect(intent.updates).toEqual({ alarm: '09:00' })
  })
})

describe('parseVoiceCommand list', () => {
  // Issue case 18
  it('case 18: lists the current week from Monday to Sunday', () => {
    expect(parse('Bu hafta hangi görevlerim var?')).toEqual({
      action: 'list',
      from: '2026-10-05',
      to: '2026-10-11',
    })
  })

  // Issue case 19
  it('case 19: lists tomorrow as a single day', () => {
    expect(parse('Yarınki görevlerimi göster')).toEqual({
      action: 'list',
      from: '2026-10-08',
      to: '2026-10-08',
    })
  })

  // Issue case 20
  it('case 20: lists only the tasks that carry an alarm', () => {
    expect(parse('Alarmlı görevlerim hangileri?')).toEqual({
      action: 'list',
      hasAlarm: true,
    })
  })

  it('adds no filter to a bare list command', () => {
    expect(parse('Görevlerim')).toEqual({ action: 'list' })
  })
})

describe('parseVoiceCommand unknown', () => {
  // Issue case 21
  it('case 21: does not read a question as an intent', () => {
    expect(parse('Bugün hava nasıl?')).toEqual({ action: 'unknown' })
  })

  // Issue case 22
  it('case 22: does not read ordinary speech as an intent', () => {
    expect(parse("Spotify'da Sezen Aksu çal")).toEqual({ action: 'unknown' })
  })
})

describe('parseVoiceCommand natural Turkish', () => {
  // Thursday 2026-10-08, midday, built from local parts so no timezone shifts it.
  const THURSDAY = new Date(2026, 9, 8, 12, 0, 0)

  const A = task('A', 'ses kaydi ekleme', '2026-10-08')
  const B = task('B', 'kahve al', '2026-10-08')
  const C = task('C', 'vivado indirbak', '2026-10-08')
  const D = task('D', 'Süt al', '2026-10-08')

  const ABC = [A, B, C]

  function say(text: string, tasks: Task[] = ABC): VoiceIntent {
    return parseVoiceCommand(text, tasks, THURSDAY)
  }

  // Issue case 1
  it('case 1: deletes the task whose title ends in ekleme', () => {
    expect(say('ses kaydi ekleme notunu siler misin')).toEqual({ action: 'delete', task: A })
  })

  // Issue case 2
  it('case 2: reads the same sentence with a dotted ı in kaydı', () => {
    expect(say('ses kaydı ekleme notunu siler misin')).toEqual({ action: 'delete', task: A })
  })

  // Issue case 3
  it('case 3: reads "silebilir misin" as a delete verb', () => {
    expect(say('kahve alı silebilir misin')).toEqual({ action: 'delete', task: B })
  })

  // Issue case 4
  it('case 4: reads "silermisin" as a delete verb', () => {
    expect(say('kahve al görevini silermisin')).toEqual({ action: 'delete', task: B })
  })

  // Issue case 5
  it('case 5: does not read "silgi" as a delete verb', () => {
    expect(say('silgi al ekle', [])).toEqual({ action: 'create', title: 'silgi al' })
  })

  // Issue case 6
  it('case 6: reads the past tense of the title verb as completing it', () => {
    expect(say('kahve aldım')).toEqual({ action: 'complete', task: B })
  })

  // Issue case 7
  it('case 7: completes on "tamamlandı"', () => {
    expect(say('kahve al tamamlandı')).toEqual({ action: 'complete', task: B })
  })

  // Issue case 8
  it('case 8: completes on "hallettim"', () => {
    expect(say('vivado indirbak görevini hallettim')).toEqual({ action: 'complete', task: C })
  })

  // Issue case 9
  it('case 9: reads a detached "da" as part of the time', () => {
    expect(say('yarın saat 9 da diş hekimi ekle', [])).toEqual({
      action: 'create',
      title: 'diş hekimi',
      dueDate: '2026-10-09',
      alarm: '09:00',
    })
  })

  // Issue case 10
  it('case 10: creates from "hatırlat"', () => {
    expect(say('süt almayı hatırlat', [])).toEqual({ action: 'create', title: 'süt al' })
  })

  // Issue case 11
  it('case 11: creates from "bana ... diye hatırlat" with a date', () => {
    expect(say('bana yarın ekmek al diye hatırlat', [])).toEqual({
      action: 'create',
      title: 'ekmek al',
      dueDate: '2026-10-09',
    })
  })

  // Issue case 12
  it('case 12: lists today from "bugün ne var"', () => {
    expect(say('bugün ne var', [])).toEqual({
      action: 'list',
      from: '2026-10-08',
      to: '2026-10-08',
    })
  })

  // Issue case 13
  it('case 13: ignores the "lütfen" in a delete command', () => {
    expect(say('lütfen süt al görevini sil', [D])).toEqual({ action: 'delete', task: D })
  })

  // Issue case 15
  it('case 15: keeps reading a plain create marker as a create', () => {
    expect(say('Yeni görev kahve al', [])).toEqual({ action: 'create', title: 'kahve al' })
  })

  // Behaviour rule 1: "silik" and "silah" are not delete verbs.
  it('does not read silah or silik as a delete verb', () => {
    expect(say('silah', [task('S1', 'silah', '2026-10-08')])).toEqual({ action: 'unknown' })
    expect(say('silik', [task('S2', 'silik', '2026-10-08')])).toEqual({ action: 'unknown' })
  })
})

describe('parseVoiceCommand polite create markers', () => {
  // Thursday 2026-10-08, midday, built from local parts so no timezone shifts it.
  const THURSDAY = new Date(2026, 9, 8, 12, 0, 0)

  function say(text: string): VoiceIntent {
    return parseVoiceCommand(text, [], THURSDAY)
  }

  // Issue case 16
  it('case 16: spends "ekler misin" instead of keeping it in the title', () => {
    expect(say('Yeni görev ekler misin kahve al')).toEqual({
      action: 'create',
      title: 'kahve al',
    })
  })

  // Issue case 17
  it('case 17: spends every create marker word in the sentence', () => {
    expect(say('yeni görev ekle kahve al')).toEqual({ action: 'create', title: 'kahve al' })
  })

  // Issue case 18
  it('case 18: spends "ekleyebilir misin" wherever it sits', () => {
    expect(say('kahve al ekleyebilir misin')).toEqual({ action: 'create', title: 'kahve al' })
  })

  // Issue case 19
  it('case 19: spends "oluşturur musun" as a create marker', () => {
    expect(say('yeni görev oluşturur musun süt al')).toEqual({
      action: 'create',
      title: 'süt al',
    })
  })
})

describe('parseVoiceCommand spoken times', () => {
  // Friday 2026-10-09, midday, so tomorrow is 2026-10-10.
  const FRIDAY = new Date(2026, 9, 9, 12, 0, 0)

  const TOMORROW = '2026-10-10'

  function say(text: string): VoiceIntent {
    return parseVoiceCommand(text, [], FRIDAY)
  }

  // Issue case 20
  it('case 20: reads "9.00\'da" as a time and spends it', () => {
    expect(say("Yarın saat 9.00'da diş hekimi ekle")).toEqual({
      action: 'create',
      title: 'diş hekimi',
      dueDate: TOMORROW,
      alarm: '09:00',
    })
  })

  // Issue case 21
  it('case 21: reads "9:00\'da" as a time and spends it', () => {
    expect(say("yarın saat 9:00'da diş hekimi ekle")).toEqual({
      action: 'create',
      title: 'diş hekimi',
      dueDate: TOMORROW,
      alarm: '09:00',
    })
  })

  // Issue case 22
  it('case 22: reads the hour word "dokuzda" as a time', () => {
    expect(say('yarın saat dokuzda diş hekimi ekle')).toEqual({
      action: 'create',
      title: 'diş hekimi',
      dueDate: TOMORROW,
      alarm: '09:00',
    })
  })

  // Issue case 23
  it('case 23: reads a bare "9\'da" as a time', () => {
    expect(say("yarın 9'da diş hekimi ekle")).toEqual({
      action: 'create',
      title: 'diş hekimi',
      dueDate: TOMORROW,
      alarm: '09:00',
    })
  })

  // Issue case 24
  it('case 24: reads "21.30 da" with the suffix detached', () => {
    expect(say('yarın saat 21.30 da toplantı ekle')).toEqual({
      action: 'create',
      title: 'toplantı',
      dueDate: TOMORROW,
      alarm: '21:30',
    })
  })

  // Issue case 25
  it('case 25: keeps an hour word that is not a time in the title', () => {
    expect(say('iki süt al ekle')).toEqual({ action: 'create', title: 'iki süt al' })
  })
})