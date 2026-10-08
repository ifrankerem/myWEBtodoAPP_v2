import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import VoiceCommand, { useSpeech } from '@/components/voice-command'
import type { Task } from '@/lib/task'
import type { VoiceIntent } from '@/lib/voice-intent'

/* ------------------------------------------------------------------ *
 * Plugin mock: @capacitor-community/speech-recognition
 *
 * The real plugin has no "transcript" event — the final utterance is the
 * value `start()` resolves with (`{ matches: string[] }`). Both that value and
 * a `partialResults` event carry the spoken text, so the tests deliver it on
 * whichever channel the component listens to.
 * ------------------------------------------------------------------ */
const speech = vi.hoisted(() => {
  const listeners = new Map<string, Set<(data: unknown) => void>>()
  return {
    listeners,
    available: vi.fn(),
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    getSupportedLanguages: vi.fn(),
    isListening: vi.fn(),
    removeAllListeners: vi.fn(),
    addListener: vi.fn(),
    emit(event: string, data: unknown) {
      listeners.get(event)?.forEach((listener) => listener(data))
    },
    reset() {
      listeners.clear()
    },
  }
})

vi.mock('@capacitor-community/speech-recognition', () => ({
  SpeechRecognition: speech,
}))

/* Native platform detection, so `supported` is true under jsdom. */
const platform = vi.hoisted(() => ({ native: true }))

vi.mock('@capacitor/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@capacitor/core')>()
  return {
    ...actual,
    Capacitor: {
      ...actual.Capacitor,
      isNativePlatform: () => platform.native,
      isPluginAvailable: () => platform.native,
      getPlatform: () => (platform.native ? 'android' : 'web'),
    },
  }
})

/* Toasts: the app has no sonner call sites yet, so this is the only way to see one. */
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    custom: vi.fn(),
    promise: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
    remove: vi.fn(),
  })
)

vi.mock('sonner', () => ({ Toaster: () => null, toast }))

/* The worker call: a spy whose answer each test sets, and a pending promise it
   can hold open to inspect the balloon while it waits. */
const remote = vi.hoisted(() => ({
  askRemoteIntent: vi.fn(),
  defaultGetToken: async () => 'tok',
  hold: false,
  release: null as null | (() => void),
}))

vi.mock('@/lib/voice-remote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/voice-remote')>()
  return {
    ...actual,
    voiceIntentUrl: () => process.env.NEXT_PUBLIC_VOICE_INTENT_URL ?? null,
    askRemoteIntent: remote.askRemoteIntent,
  }
})

/** Make the remote answer `intent` once it is called. */
function remoteAnswers(intent: VoiceIntent) {
  remote.askRemoteIntent.mockResolvedValue(intent)
}

/** Make the remote stay unanswered until `release()` is called with `intent`. */
function remoteHolds(intent: VoiceIntent) {
  remote.askRemoteIntent.mockImplementation(
    () =>
      new Promise<VoiceIntent>((resolve) => {
        remote.release = () => resolve(intent)
      })
  )
}

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */
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
const T7 = task('T7', 'Diş hekimi randevusu', '2026-10-15')
const T8 = task('T8', 'Spor salonuna git', '2026-10-16')
const T9 = task('T9', 'Doğum günü hediyesi al', '2026-10-17')
const T10 = task('T10', 'Berber randevusu', '2026-10-18')

const TASKS = [T1, T2, T7, T8, T9, T10]

const MIC = 'Sesli komut'

function setup(
  overrides: {
    visible?: boolean
    tasks?: Task[]
    execute?: (intent: VoiceIntent) => Promise<string>
    getToken?: (() => Promise<string | null>) | null
  } = {}
) {
  const execute = overrides.execute ?? vi.fn(async () => 'Tamamlandı')
  const getToken = overrides.getToken === undefined ? remote.defaultGetToken : overrides.getToken
  const view = render(
    <VoiceCommand
      tasks={overrides.tasks ?? TASKS}
      execute={execute}
      visible={overrides.visible ?? true}
      {...(getToken === null ? {} : { getToken })}
    />
  )
  return { execute, view }
}

function micButton() {
  return screen.getByRole('button', { name: MIC })
}

/** Queue the utterance the plugin resolves `start()` with, before the tap. */
function sayOnStart(text: string) {
  speech.start.mockResolvedValue({ matches: [text] })
}

/**
 * Feed a partial result once the component is listening.
 *
 * The wait is bounded: a component that reads only start()'s result never
 * subscribes to partial results, and the emit is harmless for it.
 */
async function sayPartial(text: string) {
  for (let attempt = 0; attempt < 50 && !speech.listeners.has('partialResults'); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  // Inside act, so the component has the new words before the test starts
  // waiting: the settle window starts from this moment.
  await act(async () => {
    speech.emit('partialResults', { matches: [text] })
  })
}

/**
 * Leave recognition open, the way a real utterance stays open until it ends.
 * A start() that resolves at once would take the button out of its listening
 * state before the second tap, so the listening-state tests keep it pending.
 */
function keepListening() {
  speech.start.mockReturnValue(new Promise(() => {}))
}

function toastMessages(): string[] {
  const calls = [
    toast,
    toast.success,
    toast.error,
    toast.info,
    toast.warning,
    toast.custom,
  ].flatMap((fn) => fn.mock.calls)

  return calls
    .map((call) => {
      const first = call[0]
      if (typeof first === 'string') return first
      if (first && typeof first === 'object') {
        const { message, title } = first as { message?: string; title?: string }
        return message ?? title ?? ''
      }
      return ''
    })
    .filter(Boolean)
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

/** Let real time pass, so the settle window can open or close. */
async function wait(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

/** Toasts that report a command the parser did not understand. */
function unknownToasts(): string[] {
  return toastMessages().filter((message) => message.includes('anlaşılmadı'))
}

/** Feed the growing words of one sentence, the way the plugin streams them. */
async function speakParts(texts: string[], gapMs = 60) {
  for (const text of texts) {
    await sayPartial(text)
    await wait(gapMs)
  }
  await flush()
}

beforeEach(() => {
  platform.native = true
  remote.release = null
  remote.defaultGetToken = async () => 'tok'
  remote.askRemoteIntent.mockReset()
  remoteAnswers({ action: 'unknown' })
  vi.stubEnv('NEXT_PUBLIC_VOICE_INTENT_URL', 'https://w.example/voice-intent')
  speech.reset()
  speech.available.mockReset().mockResolvedValue({ available: true })
  speech.checkPermissions.mockReset().mockResolvedValue({ speechRecognition: 'granted' })
  speech.requestPermissions.mockReset().mockResolvedValue({ speechRecognition: 'granted' })
  speech.start.mockReset().mockResolvedValue({ matches: [] })
  speech.stop.mockReset().mockResolvedValue(undefined)
  speech.removeAllListeners.mockReset().mockResolvedValue(undefined)
  speech.addListener.mockReset().mockImplementation((event: string, listener: (data: unknown) => void) => {
    const group = speech.listeners.get(event) ?? new Set<(data: unknown) => void>()
    group.add(listener)
    speech.listeners.set(event, group)
    return Promise.resolve({
      remove: async () => {
        group.delete(listener)
      },
    })
  })
  for (const fn of [toast, toast.success, toast.error, toast.info, toast.warning, toast.custom]) {
    fn.mockClear()
  }
})

describe('VoiceCommand button', () => {
  // Issue case 1
  it('case 1: renders the mic button while the tasks screen is visible', async () => {
    setup()
    expect(await screen.findByRole('button', { name: MIC })).toBeInTheDocument()
  })

  // Issue case 2
  it('case 2: renders nothing while not visible', async () => {
    setup({ visible: false })
    await flush()
    expect(screen.queryByRole('button', { name: MIC })).not.toBeInTheDocument()
  })

  it('hides the button when the platform is not native', async () => {
    platform.native = false
    setup()
    await flush()
    expect(screen.queryByRole('button', { name: MIC })).not.toBeInTheDocument()
  })

  // Issue case 3
  it('case 3: starts listening with the Turkish recognition options', async () => {
    const user = userEvent.setup()
    setup()

    await user.click(await screen.findByRole('button', { name: MIC }))

    await waitFor(() =>
      expect(speech.start).toHaveBeenCalledWith(
        expect.objectContaining({ language: 'tr-TR', partialResults: true, popup: false })
      )
    )
  })

  // Issue case 7
  it('case 7: stops the recognizer on the second tap', async () => {
    const user = userEvent.setup()
    setup()
    keepListening()
    const mic = await screen.findByRole('button', { name: MIC })

    await user.click(mic)
    await waitFor(() => expect(speech.start).toHaveBeenCalledTimes(1))

    await user.click(mic)
    await waitFor(() => expect(speech.stop).toHaveBeenCalled())
    expect(speech.start).toHaveBeenCalledTimes(1)
  })

  it('shows the live partial transcript while listening', async () => {
    const user = userEvent.setup()
    setup()
    keepListening()

    await user.click(await screen.findByRole('button', { name: MIC }))
    await sayPartial('Yeni görev: kahve')

    expect(await screen.findByText(/yeni görev: kahve/i)).toBeInTheDocument()
  })

  it('stops the recognizer when the screen hides and when it unmounts', async () => {
    const user = userEvent.setup()
    const { view } = setup()
    keepListening()
    await user.click(await screen.findByRole('button', { name: MIC }))
    await waitFor(() => expect(speech.start).toHaveBeenCalledTimes(1))

    view.rerender(<VoiceCommand tasks={TASKS} execute={vi.fn()} visible={false} />)
    await waitFor(() => expect(speech.stop).toHaveBeenCalled())

    view.rerender(<VoiceCommand tasks={TASKS} execute={vi.fn()} visible />)
    await user.click(micButton())
    await waitFor(() => expect(speech.start).toHaveBeenCalledTimes(2))

    view.unmount()
    await waitFor(() => expect(speech.stop).toHaveBeenCalledTimes(2))
  })
})

describe('VoiceCommand intents', () => {
  // Issue case 4
  it('case 4: executes a create intent from the transcript', async () => {
    const user = userEvent.setup()
    const execute = vi.fn(async () => 'Görev eklendi: kahve al')
    setup({ execute })
    sayOnStart('Yeni görev: kahve al')

    await user.click(await screen.findByRole('button', { name: MIC }))
    await sayPartial('Yeni görev: kahve al')

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1))
    expect(execute).toHaveBeenCalledWith({ action: 'create', title: 'kahve al' })
  })

  // Issue case 5
  it('case 5: asks which task when two candidates match, then executes the picked one', async () => {
    const user = userEvent.setup()
    const execute = vi.fn(async () => 'Silindi: Berber randevusu')
    setup({ execute })
    sayOnStart('Randevu görevini sil')

    await user.click(await screen.findByRole('button', { name: MIC }))
    await sayPartial('Randevu görevini sil')

    const dialog = await screen.findByRole('dialog', { name: 'Sesli Komut' })
    expect(within(dialog).getByRole('button', { name: /berber randevusu/i })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /diş hekimi randevusu/i })).toBeInTheDocument()
    expect(execute).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: /berber randevusu/i }))

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1))
    expect(execute).toHaveBeenCalledWith({ action: 'delete', task: T10 })
  })

  it('closes the confirmation dialog with Vazgeç and deletes nothing', async () => {
    const user = userEvent.setup()
    const execute = vi.fn(async () => 'Silindi: Berber randevusu')
    setup({ execute })
    sayOnStart('Randevu görevini sil')

    await user.click(await screen.findByRole('button', { name: MIC }))
    await sayPartial('Randevu görevini sil')
    const dialog = await screen.findByRole('dialog', { name: 'Sesli Komut' })

    await user.click(within(dialog).getByRole('button', { name: /vazgeç/i }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Sesli Komut' })).not.toBeInTheDocument()
    )
    expect(execute).not.toHaveBeenCalled()
  })

  // Issue case 6
  it('case 6: reports an unrecognized command without executing anything', async () => {
    const user = userEvent.setup()
    const execute = vi.fn(async () => 'Tamamlandı')
    setup({ execute })
    sayOnStart('Bugün hava nasıl?')

    await user.click(await screen.findByRole('button', { name: MIC }))
    await sayPartial('Bugün hava nasıl?')

    await waitFor(() =>
      expect(toastMessages().some((message) => message.includes('anlaşılmadı'))).toBe(true)
    )
    expect(execute).not.toHaveBeenCalled()
  })
})

describe('useSpeech', () => {
  // Issue case 8
  it('case 8: recovers from a recognition error and stays stopped', async () => {
    speech.requestPermissions.mockResolvedValue({ speechRecognition: 'granted' })
    speech.start.mockRejectedValue(new Error('no speech service'))

    const { result } = renderHook(() => useSpeech())
    await act(async () => {
      await result.current.start().catch(() => undefined)
    })

    expect(result.current.listening).toBe(false)
  })

  it('case 8: toasts the recognition error instead of crashing the screen', async () => {
    const user = userEvent.setup()
    const execute = vi.fn(async () => 'Tamamlandı')
    setup({ execute })
    speech.requestPermissions.mockResolvedValue({ speechRecognition: 'granted' })
    speech.start.mockRejectedValue(new Error('no speech service'))

    await user.click(await screen.findByRole('button', { name: MIC }))

    await waitFor(() => expect(toastMessages().length).toBeGreaterThan(0))
    expect(execute).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: MIC })).toBeInTheDocument()
  })

  it('counts every finished turn in the settled counter', async () => {
    const { result } = renderHook(() => useSpeech())
    const settled = () => (result.current as { settled?: number }).settled

    await act(async () => {
      await result.current.start()
    })
    expect(settled()).toBe(0)

    await act(async () => {
      speech.emit('listeningState', { status: 'stopped' })
    })
    expect(settled()).toBe(1)

    await act(async () => {
      speech.emit('listeningState', { status: 'stopped' })
    })
    expect(settled()).toBe(2)
  })
})

describe('VoiceCommand settle', () => {
  const SENTENCE = 'Yeni görev kahve al'

  async function startListening(execute: (intent: VoiceIntent) => Promise<string>) {
    const user = userEvent.setup()
    setup({ execute })
    keepListening()
    await user.click(await screen.findByRole('button', { name: MIC }))
  }

  // Issue case 1
  it('case 1: runs the finished sentence once, never the half-heard ones', async () => {
    const execute = vi.fn(async () => 'Görev eklendi: kahve al')
    await startListening(execute)

    await speakParts(['Yeni', 'Yeni görev', 'Yeni görev kahve', SENTENCE])

    expect(execute).not.toHaveBeenCalled()
    expect(unknownToasts()).toHaveLength(0)

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1), { timeout: 2500 })
    expect(execute).toHaveBeenCalledWith({ action: 'create', title: 'kahve al' })
    expect(unknownToasts()).toHaveLength(0)
  })

  // Issue case 2, revised: on a device `stopped` arrives before the last words.
  it('case 2: runs only the words that settle after the turn ended', async () => {
    const execute = vi.fn(async () => 'Görev eklendi: deneme görevi')
    await startListening(execute)

    await sayPartial('Yeni görev')
    await flush()
    expect(execute).not.toHaveBeenCalled()

    await act(async () => {
      speech.emit('listeningState', { status: 'stopped' })
    })
    await flush()
    expect(execute).not.toHaveBeenCalled()
    expect(unknownToasts()).toHaveLength(0)

    await speakParts(['Yeni görev deneme', 'Yeni görev deneme görevi'], 40)
    expect(execute).not.toHaveBeenCalled()
    expect(unknownToasts()).toHaveLength(0)

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1), { timeout: 2500 })
    expect(execute).toHaveBeenCalledWith({ action: 'create', title: 'deneme görevi' })
    expect(unknownToasts()).toHaveLength(0)
  })

  // Issue case 3, revised: a turn runs one command, whatever arrives later.
  it('case 3: ignores a later partial once the turn already ran', async () => {
    const execute = vi.fn(async () => 'Görev eklendi: deneme görevi')
    await startListening(execute)

    await sayPartial('Yeni görev deneme görevi')
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1), { timeout: 2500 })

    // Later in the same turn, after the turn's own settle window has passed.
    await wait(600)
    await sayPartial('Yeni görev deneme görevi.')
    await wait(1000)
    expect(execute).toHaveBeenCalledTimes(1)
  })

  // Issue case 4, revised: the unknown sentence waits for the settle window too.
  it('case 4: reports an unknown sentence once, after the settle window', async () => {
    const execute = vi.fn(async () => 'Tamamlandı')
    await startListening(execute)

    await sayPartial('Yeni')
    await flush()
    expect(unknownToasts()).toHaveLength(0)

    await act(async () => {
      speech.emit('listeningState', { status: 'stopped' })
    })
    await flush()
    expect(unknownToasts()).toHaveLength(0)

    await waitFor(() => expect(unknownToasts()).toHaveLength(1), { timeout: 2500 })
    expect(execute).not.toHaveBeenCalled()

    await wait(1000)
    expect(unknownToasts()).toHaveLength(1)
    expect(execute).not.toHaveBeenCalled()
  })

  // Issue case 5
  it('case 5: runs the sentence when start() resolves nothing', async () => {
    const execute = vi.fn(async () => 'Görev eklendi: kahve al')
    const user = userEvent.setup()
    setup({ execute })
    speech.start.mockResolvedValue(undefined)

    await user.click(await screen.findByRole('button', { name: MIC }))
    await sayPartial(SENTENCE)

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1), { timeout: 2500 })
    expect(execute).toHaveBeenCalledWith({ action: 'create', title: 'kahve al' })
    expect(toastMessages().some((message) => message.includes('Cannot read'))).toBe(false)
  })

  // Issue case 6
  it('case 6: runs nothing when the screen goes away mid-sentence', async () => {
    const execute = vi.fn(async () => 'Görev eklendi: kahve al')
    const user = userEvent.setup()
    const { view } = setup({ execute })
    keepListening()

    await user.click(await screen.findByRole('button', { name: MIC }))
    await sayPartial(SENTENCE)
    await flush()
    expect(execute).not.toHaveBeenCalled()

    view.unmount()
    await wait(1200)
    expect(execute).not.toHaveBeenCalled()
  })

  // Issue case 6, the other half of "the screen is gone"
  it('case 6b: runs nothing when the screen is hidden mid-sentence', async () => {
    const execute = vi.fn(async () => 'Görev eklendi: kahve')
    const user = userEvent.setup()
    const { view } = setup({ execute })
    keepListening()

    await user.click(await screen.findByRole('button', { name: MIC }))
    await sayPartial('Yeni görev kahve')
    await flush()
    expect(execute).not.toHaveBeenCalled()

    view.rerender(<VoiceCommand tasks={TASKS} execute={execute} visible={false} />)

    await wait(1200)
    expect(execute).not.toHaveBeenCalled()
    expect(unknownToasts()).toHaveLength(0)
  })

  // Issue case 8
  it('case 8: runs the same sentence again in a second turn', async () => {
    const execute = vi.fn(async () => 'Görev eklendi: kahve al')
    const user = userEvent.setup()
    setup({ execute })
    keepListening()

    await user.click(await screen.findByRole('button', { name: MIC }))
    await sayPartial(SENTENCE)
    await act(async () => {
      speech.emit('listeningState', { status: 'stopped' })
    })
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1), { timeout: 2500 })

    // The plugin ended the turn, so the mic is free and opens the next one.
    await user.click(await screen.findByRole('button', { name: MIC }))
    await waitFor(() => expect(speech.start).toHaveBeenCalledTimes(2))
    await sayPartial(SENTENCE)

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(2), { timeout: 2500 })
    expect(execute).toHaveBeenNthCalledWith(1, { action: 'create', title: 'kahve al' })
    expect(execute).toHaveBeenNthCalledWith(2, { action: 'create', title: 'kahve al' })
  })
})

/** Speak one sentence and let the recognizer end the turn, so the short window applies. */
async function speak(
  text: string,
  overrides: Parameters<typeof setup>[0] = {}
) {
  const result = setup(overrides)
  const user = userEvent.setup()
  keepListening()

  await user.click(await screen.findByRole('button', { name: MIC }))
  await sayPartial(text)
  await flush()
  await act(async () => {
    speech.emit('listeningState', { status: 'stopped' })
  })

  return { ...result, user }
}

describe('VoiceCommand remote fallback', () => {
  const KAHVE = task('B', 'kahve al', '2026-10-05')

  const UNREADABLE = 'şu kahve olayını listeden kaldır'

  // Issue case 9
  it('case 9: asks which task the worker meant before it deletes', async () => {
    const execute = vi.fn(async () => 'Silindi: kahve al')
    remoteAnswers({ action: 'confirm', candidates: [KAHVE], wanted: 'delete' })
    const { user } = await speak(UNREADABLE, { tasks: [KAHVE], execute })

    const dialog = await screen.findByRole('dialog', { name: 'Sesli Komut' }, { timeout: 2500 })
    expect(within(dialog).getByRole('button', { name: /kahve al/i })).toBeInTheDocument()
    expect(execute).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: /kahve al/i }))

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1))
    expect(execute).toHaveBeenCalledWith({ action: 'delete', task: KAHVE })
  })

  // Issue case 10
  it('case 10: says it is thinking while the worker is still answering', async () => {
    remoteHolds({ action: 'unknown' })
    await speak(UNREADABLE, { tasks: [KAHVE] })

    expect(await screen.findByText(/düşünüyorum/i, undefined, { timeout: 2500 })).toBeInTheDocument()
    expect(remote.askRemoteIntent).toHaveBeenCalledTimes(1)
  })

  // Issue case 11
  it('case 11: reports an unknown sentence once when the worker gives up too', async () => {
    const execute = vi.fn(async () => 'Tamamlandı')
    remoteAnswers({ action: 'unknown' })
    await speak(UNREADABLE, { tasks: [KAHVE], execute })

    await waitFor(() => expect(unknownToasts()).toHaveLength(1), { timeout: 2500 })
    expect(execute).not.toHaveBeenCalled()
  })

  // Issue case 12
  it('case 12: never asks the worker about a sentence the parser reads', async () => {
    const execute = vi.fn(async () => 'Görev eklendi: kahve al')
    await speak('Yeni görev kahve al', { tasks: [KAHVE], execute })

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1), { timeout: 2500 })
    expect(execute).toHaveBeenCalledWith({ action: 'create', title: 'kahve al' })
    expect(remote.askRemoteIntent).not.toHaveBeenCalled()
  })

  // Issue case 13
  it('case 13: stays on the parser alone without a token or without a url', async () => {
    await speak(UNREADABLE, { tasks: [KAHVE], getToken: null })
    await waitFor(() => expect(unknownToasts()).toHaveLength(1), { timeout: 2500 })
    expect(remote.askRemoteIntent).not.toHaveBeenCalled()

    remote.askRemoteIntent.mockClear()
    vi.stubEnv('NEXT_PUBLIC_VOICE_INTENT_URL', '')
    await speak(UNREADABLE, { tasks: [KAHVE] })
    await waitFor(() => expect(unknownToasts()).toHaveLength(2), { timeout: 2500 })
    expect(remote.askRemoteIntent).not.toHaveBeenCalled()
  })

  // Issue case 14
  it('case 14: throws the answer away when the screen is hidden while it waits', async () => {
    const execute = vi.fn(async () => 'Görev eklendi: ekmek al')
    remoteHolds({ action: 'create', title: 'ekmek al' })

    const { view } = setup({ tasks: [KAHVE], execute })
    const user = userEvent.setup()
    keepListening()
    await user.click(await screen.findByRole('button', { name: MIC }))
    await sayPartial(UNREADABLE)
    await flush()
    await act(async () => {
      speech.emit('listeningState', { status: 'stopped' })
    })

    await waitFor(() => expect(remote.askRemoteIntent).toHaveBeenCalledTimes(1), { timeout: 2500 })

    view.rerender(<VoiceCommand tasks={[KAHVE]} execute={execute} visible={false} getToken={remote.defaultGetToken} />)
    remote.release?.()

    await wait(1200)
    expect(execute).not.toHaveBeenCalled()
    expect(unknownToasts()).toHaveLength(0)
  })

  // Issue case 17 (revision round 1): the component is gone, not just hidden.
  // `visibleRef` only tracks the last render, so unmounting must still stop a
  // late answer from acting on tasks nobody can see any more.
  it('case 17: throws the answer away when the component unmounts while it waits', async () => {
    const execute = vi.fn(async () => 'Görev eklendi: ekmek al')
    remoteHolds({ action: 'create', title: 'ekmek al' })

    const { view } = setup({ tasks: [KAHVE], execute })
    const user = userEvent.setup()
    keepListening()
    await user.click(await screen.findByRole('button', { name: MIC }))
    await sayPartial(UNREADABLE)
    await flush()
    await act(async () => {
      speech.emit('listeningState', { status: 'stopped' })
    })

    await waitFor(() => expect(remote.askRemoteIntent).toHaveBeenCalledTimes(1), { timeout: 2500 })

    view.unmount()
    remote.release?.()

    await wait(400)
    expect(execute).not.toHaveBeenCalled()
    expect(toastMessages()).toHaveLength(0)
  })

  // Issue case 18 (revision round 1): an answer belongs to the turn whose
  // sentence was spoken. Once the mic opens a newer turn, the late answer is
  // dropped silently, and the new turn still runs the sentence of its own.
  it('case 18: drops a late answer when a newer turn has already started', async () => {
    const execute = vi.fn(async () => 'Görev eklendi: kahve al')
    remoteHolds({ action: 'create', title: 'ekmek al' })

    setup({ tasks: [KAHVE], execute })
    const user = userEvent.setup()
    keepListening()
    await user.click(await screen.findByRole('button', { name: MIC }))
    await sayPartial(UNREADABLE)
    await flush()
    await act(async () => {
      speech.emit('listeningState', { status: 'stopped' })
    })

    await waitFor(() => expect(remote.askRemoteIntent).toHaveBeenCalledTimes(1), { timeout: 2500 })

    // The user taps the mic again before the worker answers: a new turn opens.
    await user.click(micButton())
    await waitFor(() => expect(speech.start).toHaveBeenCalledTimes(2))

    remote.release?.()

    await wait(400)
    expect(execute).not.toHaveBeenCalled()
    expect(toastMessages()).toHaveLength(0)
    expect(screen.queryByRole('dialog', { name: 'Sesli Komut' })).not.toBeInTheDocument()

    // The new turn is untouched and still runs the sentence spoken in it.
    await sayPartial('Yeni görev kahve al')
    await act(async () => {
      speech.emit('listeningState', { status: 'stopped' })
    })

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1), { timeout: 2000 })
    expect(execute).toHaveBeenCalledWith({ action: 'create', title: 'kahve al' })
  }, 3000)
})

describe('VoiceCommand settle window', () => {
  // Issue case 15
  it('case 15: waits out a pause mid-sentence while still listening', async () => {
    const PDF = task('PDF', 'PDF biriktirme', '2026-10-05')
    const execute = vi.fn(async () => 'Silindi: PDF biriktirme')
    const user = userEvent.setup()
    setup({ tasks: [PDF], execute })
    keepListening()

    await user.click(await screen.findByRole('button', { name: MIC }))
    await sayPartial('PDF')
    await flush()
    await wait(1200)
    expect(execute).not.toHaveBeenCalled()

    await sayPartial('PDF biriktirme notunu sil')

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1), { timeout: 2000 })
    expect(execute).toHaveBeenCalledWith({ action: 'delete', task: PDF })
    expect(unknownToasts()).toHaveLength(0)
  }, 3000)

  // Issue case 16
  it('case 16: runs on the shorter window once the turn has ended', async () => {
    const execute = vi.fn(async () => 'Görev eklendi: kahve al')
    await speak('Yeni görev kahve al', { execute })

    await wait(600)
    expect(execute).not.toHaveBeenCalled()

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1), { timeout: 500 })
    expect(execute).toHaveBeenCalledWith({ action: 'create', title: 'kahve al' })
  }, 3000)
})

