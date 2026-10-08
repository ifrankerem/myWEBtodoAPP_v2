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

function setup(overrides: { visible?: boolean; execute?: (intent: VoiceIntent) => Promise<string> } = {}) {
  const execute = overrides.execute ?? vi.fn(async () => 'Tamamlandı')
  const view = render(
    <VoiceCommand tasks={TASKS} execute={execute} visible={overrides.visible ?? true} />
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
  speech.emit('partialResults', { matches: [text] })
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

  // Issue case 2
  it('case 2: runs on the stopped turn, without waiting out the settle window', async () => {
    const execute = vi.fn(async () => 'Görev eklendi: kahve al')
    await startListening(execute)

    await sayPartial(SENTENCE)
    await flush()
    expect(execute).not.toHaveBeenCalled()

    await act(async () => {
      speech.emit('listeningState', { status: 'stopped' })
    })

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1), { timeout: 300 })
    expect(execute).toHaveBeenCalledWith({ action: 'create', title: 'kahve al' })
  })

  // Issue case 3
  it('case 3: runs once when the settle window opens after the stopped turn', async () => {
    const execute = vi.fn(async () => 'Görev eklendi: kahve al')
    await startListening(execute)

    await sayPartial(SENTENCE)
    await flush()
    expect(execute).not.toHaveBeenCalled()

    await act(async () => {
      speech.emit('listeningState', { status: 'stopped' })
    })
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1), { timeout: 300 })

    await wait(1200)
    expect(execute).toHaveBeenCalledTimes(1)
  })

  // Issue case 4
  it('case 4: reports an unknown sentence once, when the turn ends', async () => {
    const execute = vi.fn(async () => 'Tamamlandı')
    await startListening(execute)

    await sayPartial('Yeni')
    await flush()
    expect(unknownToasts()).toHaveLength(0)

    await act(async () => {
      speech.emit('listeningState', { status: 'stopped' })
    })
    await waitFor(() => expect(unknownToasts()).toHaveLength(1), { timeout: 300 })
    expect(execute).not.toHaveBeenCalled()

    await wait(1200)
    expect(unknownToasts()).toHaveLength(1)
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
})