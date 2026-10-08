import { describe, expect, it, vi } from 'vitest'

import {
  VOICE_MODEL,
  buildVoicePrompt,
  normalizeRemoteIntent,
  resolveVoiceIntent,
  type VoiceRequest,
} from '../worker/src/voice'

const TODAY = '2026-10-09'

const TASKS: VoiceRequest['tasks'] = [
  { id: 'A', title: 'ses kaydi ekleme' },
  { id: 'B', title: 'kahve al' },
  { id: 'E', title: 'Diş hekimi randevusu' },
  { id: 'F', title: 'Berber randevusu' },
]

function request(overrides: Partial<VoiceRequest> = {}): VoiceRequest {
  return { text: 'Yarın akşam 8 toplantı ekle', tasks: TASKS, today: TODAY, ...overrides }
}

/** A fake `Ai` whose `run` answers with `answer` and records its arguments. */
function fakeAi(answer: unknown) {
  const calls: unknown[][] = []
  return {
    calls,
    run: vi.fn(async (...args: unknown[]) => {
      calls.push(args)
      return answer
    }),
  }
}

describe('buildVoicePrompt', () => {
  // Issue case 1
  it('case 1: carries the date table, the tasks and today', () => {
    const prompt = buildVoicePrompt(request())

    expect(prompt).toContain('yarın Cumartesi = 2026-10-10')
    expect(prompt).toContain('B: kahve al')
    expect(prompt).toContain('2026-10-09')
  })

  // Issue case 6: the rule is pinned to the wording the issue names — the
  // prompt has to say `id` and "başlık değil" for taskId and candidates alike.
  // The sentences carrying it are collected first, so the worker is free to
  // split the rule over a line or two.
  it('case 6: tells the model to answer with the id and never the title', () => {
    const prompt = buildVoicePrompt(request())

    const rule = prompt
      .split('\n')
      .filter((line) => line.includes('başlık değil'))
      .join(' ')

    expect(rule, 'prompt never says the title is not what it wants').not.toBe('')
    expect(rule).toMatch(/\bid\b/i)
    expect(rule).toMatch(/taskId/i)
    expect(rule).toMatch(/candidates/i)
  })
})

describe('normalizeRemoteIntent: a title where an id was expected', () => {
  const A = { id: 'A', title: 'ses kaydi ekleme' }
  const B = { id: 'B', title: 'kahve al' }
  const C = { id: 'C', title: 'ekler kahve al' }
  const D = { id: 'D', title: 'Kahve Al' }

  const with_ = (...tasks: VoiceRequest['tasks']): Partial<VoiceRequest> => ({ tasks })

  // Issue case 1
  it('case 1: reads a taskId that names the task by its title', () => {
    expect(
      normalizeRemoteIntent({ action: 'delete', taskId: 'kahve al' }, request(with_(A, B, C)))
    ).toEqual({ action: 'delete', taskId: 'B' })
  })

  // Issue case 2
  it('case 2: compares a title trimmed and in Turkish lower case', () => {
    expect(
      normalizeRemoteIntent({ action: 'delete', taskId: '  KAHVE AL ' }, request(with_(A, B, C)))
    ).toEqual({ action: 'delete', taskId: 'B' })
  })

  // Issue case 3
  it('case 3: drops a title that two tasks share', () => {
    expect(
      normalizeRemoteIntent({ action: 'delete', taskId: 'kahve al' }, request(with_(A, B, C, D)))
    ).toEqual({ action: 'unknown' })
  })

  // Issue case 4
  it('case 4: reads every candidate that named a task by its title', () => {
    expect(
      normalizeRemoteIntent(
        { action: 'delete', candidates: ['kahve al', 'ekler kahve al'] },
        request(with_(A, B, C))
      )
    ).toEqual({ action: 'confirm', wanted: 'delete', candidates: ['B', 'C'] })
  })

  // Issue case 5
  it('case 5: does not match a title only half said', () => {
    expect(
      normalizeRemoteIntent({ action: 'delete', taskId: 'kahve' }, request(with_(A, B, C)))
    ).toEqual({ action: 'unknown' })
  })
})

describe('resolveVoiceIntent', () => {
  // Issue case 2
  it('case 2: reads an answer that arrives as a JSON string in response', async () => {
    const ai = fakeAi({ response: '{"action":"delete","taskId":"B"}' })

    await expect(resolveVoiceIntent(ai as never, request())).resolves.toEqual({
      action: 'delete',
      taskId: 'B',
    })
  })

  // Issue case 3
  it('case 3: reads an object under choices[0].message.content', async () => {
    const ai = fakeAi({ choices: [{ message: { content: '{"action":"delete","taskId":"B"}' } }] })

    await expect(resolveVoiceIntent(ai as never, request())).resolves.toEqual({
      action: 'delete',
      taskId: 'B',
    })
  })

  // Issue case 4
  it('case 4: drops a task id that is not in the request', async () => {
    const ai = fakeAi({ response: '{"action":"delete","taskId":"Z"}' })

    await expect(resolveVoiceIntent(ai as never, request())).resolves.toEqual({
      action: 'unknown',
    })
  })

  // Issue case 5
  it('case 5: turns two or more valid candidates into a confirmation', async () => {
    const ai = fakeAi({ response: '{"action":"delete","candidates":["E","F","Z"]}' })

    await expect(resolveVoiceIntent(ai as never, request())).resolves.toEqual({
      action: 'confirm',
      wanted: 'delete',
      candidates: ['E', 'F'],
    })
  })

  // Issue case 6
  it('case 6: reads a single candidate as the task id', async () => {
    const ai = fakeAi({ response: '{"action":"complete","candidates":["E"]}' })

    await expect(resolveVoiceIntent(ai as never, request())).resolves.toEqual({
      action: 'complete',
      taskId: 'E',
    })
  })

  // Issue case 7
  it('case 7: keeps a valid dueDate and drops an impossible alarm and stray keys', async () => {
    const ai = fakeAi({
      response: '{"action":"create","title":"  ekmek al ","dueDate":"2026-10-10","alarm":"25:00","extra":1}',
    })

    await expect(resolveVoiceIntent(ai as never, request())).resolves.toEqual({
      action: 'create',
      title: 'ekmek al',
      dueDate: '2026-10-10',
    })
  })

  // Issue case 8
  it('case 8: refuses a create with an empty title', async () => {
    const ai = fakeAi({ response: '{"action":"create","title":""}' })

    await expect(resolveVoiceIntent(ai as never, request())).resolves.toEqual({
      action: 'unknown',
    })
  })

  // Issue case 9
  it('case 9: refuses an update that changes nothing', async () => {
    const nothing = fakeAi({ response: '{"action":"update","taskId":"F"}' })
    await expect(resolveVoiceIntent(nothing as never, request())).resolves.toEqual({
      action: 'unknown',
    })

    const changed = fakeAi({ response: '{"action":"update","taskId":"F","dueDate":"2026-10-10"}' })
    await expect(resolveVoiceIntent(changed as never, request())).resolves.toEqual({
      action: 'update',
      taskId: 'F',
      dueDate: '2026-10-10',
    })
  })

  // Issue case 10
  it('case 10: rejects an answer that is not JSON', async () => {
    const ai = fakeAi({ response: 'not json' })

    await expect(resolveVoiceIntent(ai as never, request())).rejects.toThrow()
  })

  // Issue case 11
  it('case 11: calls the model with a schema, low reasoning and the spoken text', async () => {
    const ai = fakeAi({ response: '{"action":"unknown"}' })
    const input = request({ text: 'kahve al görevini cumaya ertele' })

    await resolveVoiceIntent(ai as never, input)

    expect(VOICE_MODEL).toBe('@cf/openai/gpt-oss-20b')
    expect(ai.run).toHaveBeenCalledTimes(1)

    const [model, options] = ai.run.mock.calls[0] as [string, Record<string, unknown>]
    expect(model).toBe(VOICE_MODEL)
    expect(options).toMatchObject({ reasoning: { effort: 'low' } })
    expect(options.response_format).toMatchObject({ type: 'json_schema' })

    const messages = options.messages as Array<{ role: string; content: string }>
    expect(messages.at(-1)).toEqual({
      role: 'user',
      content: 'kahve al görevini cumaya ertele',
    })
  })
})

describe('normalizeRemoteIntent', () => {
  // Issue case 10
  it('case 10: answers unknown for an action it does not know', () => {
    expect(normalizeRemoteIntent({ action: 'fly' }, request())).toEqual({ action: 'unknown' })
    expect(normalizeRemoteIntent('not json', request())).toEqual({ action: 'unknown' })
    expect(normalizeRemoteIntent(null, request())).toEqual({ action: 'unknown' })
  })

  it('keeps a list with a valid range and drops an impossible one', () => {
    expect(
      normalizeRemoteIntent({ action: 'list', from: '2026-10-09', to: '2026-10-16' }, request())
    ).toEqual({ action: 'list', from: '2026-10-09', to: '2026-10-16' })

    expect(normalizeRemoteIntent({ action: 'list', from: '9 Ekim' }, request())).toEqual({
      action: 'list',
    })
  })

  it('keeps an alarm only when it is a real clock time', () => {
    expect(normalizeRemoteIntent({ action: 'create', title: 'su iç', alarm: '20:30' }, request()))
      .toEqual({ action: 'create', title: 'su iç', alarm: '20:30' })

    expect(normalizeRemoteIntent({ action: 'create', title: 'su iç', alarm: '24:00' }, request()))
      .toEqual({ action: 'create', title: 'su iç' })
  })

  it('drops a dueDate that is not YYYY-MM-DD', () => {
    expect(normalizeRemoteIntent({ action: 'create', title: 'su iç', dueDate: '10/10/2026' }, request()))
      .toEqual({ action: 'create', title: 'su iç' })
  })
})