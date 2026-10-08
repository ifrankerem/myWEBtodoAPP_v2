import { describe, expect, it, vi } from 'vitest'

import type { Task } from '@/lib/task'
import {
  REMOTE_TIMEOUT_MS,
  askRemoteIntent,
  toVoiceIntent,
  voiceIntentUrl,
} from '@/lib/voice-remote'
import type { VoiceIntent } from '@/lib/voice-intent'

// Friday 2026-10-09, midday, built from local parts so no timezone shifts it.
const TODAY = new Date(2026, 9, 9, 12, 0, 0)

function task(id: string, title: string): Task {
  return {
    id,
    title,
    type: 'text',
    completed: false,
    createdDate: new Date(2026, 1, 2, 9, 0, 0),
    lastEditedDate: new Date(2026, 1, 2, 9, 0, 0),
    dueDate: '2026-10-05',
  }
}

const B = task('B', 'kahve al')
const E = task('E', 'Diş hekimi randevusu')
const F = task('F', 'Berber randevusu')

const TASKS = [B, E, F]
const URL = 'https://worker.example/voice-intent'

const token = async () => 'tok'

/** A fetch that answers `body` and records what it was called with. */
function fakeFetch(body: unknown, init: { status?: number } = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const impl = vi.fn(async (input: unknown, options?: RequestInit) => {
    calls.push({ url: String(input), init: options ?? {} })
    return new Response(JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  return { impl, calls }
}

function ask(
  text: string,
  fetchImpl: unknown,
  options: { getToken?: () => Promise<string | null> } = {}
): Promise<VoiceIntent> {
  return askRemoteIntent(text, TASKS, TODAY, options.getToken ?? token, {
    url: URL,
    fetchImpl: fetchImpl as typeof fetch,
  })
}

describe('voiceIntentUrl', () => {
  it('reads the endpoint from the environment and is empty without one', () => {
    vi.stubEnv('NEXT_PUBLIC_VOICE_INTENT_URL', URL)
    expect(voiceIntentUrl()).toBe(URL)

    vi.stubEnv('NEXT_PUBLIC_VOICE_INTENT_URL', '')
    expect(voiceIntentUrl()).toBeNull()

    vi.unstubAllEnvs()
  })
})

describe('askRemoteIntent', () => {
  // Issue case 1
  it('case 1: asks nothing without a url or without a token', async () => {
    const noUrl = fakeFetch({ action: 'list' })
    await expect(
      askRemoteIntent('şu kahve olayını listeden kaldır', TASKS, TODAY, token, {
        url: null,
        fetchImpl: noUrl.impl as unknown as typeof fetch,
      })
    ).resolves.toEqual({ action: 'unknown' })
    expect(noUrl.impl).not.toHaveBeenCalled()

    const noToken = fakeFetch({ action: 'list' })
    await expect(
      askRemoteIntent('şu kahve olayını listeden kaldır', TASKS, TODAY, async () => null, {
        url: URL,
        fetchImpl: noToken.impl as unknown as typeof fetch,
      })
    ).resolves.toEqual({ action: 'unknown' })
    expect(noToken.impl).not.toHaveBeenCalled()
  })

  it('case 1: asks nothing when the token throws or the sentence is blank', async () => {
    const throwing = fakeFetch({ action: 'list' })
    await expect(
      askRemoteIntent('şu kahve olayını listeden kaldır', TASKS, TODAY, async () => {
        throw new Error('signed out')
      }, { url: URL, fetchImpl: throwing.impl as unknown as typeof fetch })
    ).resolves.toEqual({ action: 'unknown' })
    expect(throwing.impl).not.toHaveBeenCalled()

    const blank = fakeFetch({ action: 'list' })
    await expect(
      askRemoteIntent('   ', TASKS, TODAY, token, {
        url: URL,
        fetchImpl: blank.impl as unknown as typeof fetch,
      })
    ).resolves.toEqual({ action: 'unknown' })
    expect(blank.impl).not.toHaveBeenCalled()
  })

  // Issue case 2
  it('case 2: posts the sentence, the task ids and titles, and today', async () => {
    const { impl, calls } = fakeFetch({ action: 'unknown' })

    await ask('şu kahve olayını listeden kaldır', impl)

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(URL)
    expect(calls[0].init.method).toBe('POST')

    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer tok')
    expect(headers['Content-Type']).toBe('application/json')

    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      text: 'şu kahve olayını listeden kaldır',
      tasks: [
        { id: 'B', title: 'kahve al' },
        { id: 'E', title: 'Diş hekimi randevusu' },
        { id: 'F', title: 'Berber randevusu' },
      ],
      today: '2026-10-09',
    })
  })

  // Issue case 3
  it('case 3: asks before deleting, so a guessed task becomes a confirmation', async () => {
    const { impl } = fakeFetch({ action: 'delete', taskId: 'B' })

    await expect(ask('x', impl)).resolves.toEqual({
      action: 'confirm',
      candidates: [B],
      wanted: 'delete',
    })
  })

  // Issue case 4
  it('case 4: maps an update onto the task it names', async () => {
    const { impl } = fakeFetch({ action: 'update', taskId: 'F', dueDate: '2026-10-10' })

    await expect(ask('x', impl)).resolves.toEqual({
      action: 'update',
      task: F,
      updates: { dueDate: '2026-10-10' },
    })
  })

  // Issue case 5
  it('case 5: keeps a confirmation with every candidate it named', async () => {
    const { impl } = fakeFetch({ action: 'confirm', wanted: 'delete', candidates: ['E', 'F'] })

    await expect(ask('x', impl)).resolves.toEqual({
      action: 'confirm',
      wanted: 'delete',
      candidates: [E, F],
    })
  })

  // Issue case 6
  it('case 6: passes a create through with the fields the worker sent', async () => {
    const { impl } = fakeFetch({ action: 'create', title: 'ekmek al', dueDate: '2026-10-10' })

    await expect(ask('x', impl)).resolves.toEqual({
      action: 'create',
      title: 'ekmek al',
      dueDate: '2026-10-10',
    })
  })

  // Issue case 7
  it('case 7: refuses a task id that is not in the list', async () => {
    const { impl } = fakeFetch({ action: 'delete', taskId: 'Z' })

    await expect(ask('x', impl)).resolves.toEqual({
      action: 'unknown',
    })
  })

  // Issue case 8
  it('case 8: gives up on an error status, a network error or a body it cannot read', async () => {
    for (const status of [401, 502]) {
      const { impl } = fakeFetch({ action: 'list' }, { status })
      await expect(ask('x', impl)).resolves.toEqual({
        action: 'unknown',
      })
    }

    const broken = vi.fn(async () => {
      throw new Error('network down')
    })
    await expect(ask('x', broken)).resolves.toEqual({
      action: 'unknown',
    })

    const garbage = vi.fn(async () => new Response('not json', { status: 200 }))
    await expect(ask('x', garbage)).resolves.toEqual({
      action: 'unknown',
    })
  })

  // Issue case 8
  it('case 8: gives up when the worker never answers', async () => {
    vi.useFakeTimers()
    try {
      const pending = vi.fn(
        (_input: unknown, options?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
          })
      )

      const answer = askRemoteIntent('x', TASKS, TODAY, token, {
        url: URL,
        fetchImpl: pending as unknown as typeof fetch,
      })
      const settled = vi.fn()
      answer.then(settled, settled)

      await vi.advanceTimersByTimeAsync(REMOTE_TIMEOUT_MS + 100)

      await expect(answer).resolves.toEqual({ action: 'unknown' })
      expect(settled).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('toVoiceIntent', () => {
  // Issue case 3
  it('case 3: never applies a guessed delete or complete without the user tapping', () => {
    expect(toVoiceIntent({ action: 'complete', taskId: 'B' }, TASKS)).toEqual({
      action: 'confirm',
      candidates: [B],
      wanted: 'complete',
    })
  })

  it('reads a list with its range and drops a malformed object', () => {
    expect(toVoiceIntent({ action: 'list', from: '2026-10-09' }, TASKS)).toEqual({
      action: 'list',
      from: '2026-10-09',
    })
    expect(toVoiceIntent({ action: 'fly' }, TASKS)).toEqual({ action: 'unknown' })
    expect(toVoiceIntent(null, TASKS)).toEqual({ action: 'unknown' })
    expect(toVoiceIntent({ action: 'confirm', wanted: 'delete', candidates: ['Z'] }, TASKS)).toEqual({
      action: 'unknown',
    })
  })
})