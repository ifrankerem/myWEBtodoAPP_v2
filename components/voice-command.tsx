"use client"

// In-app voice control for the tasks screen.
//
// The speech plugin streams the words it is still hearing, so "Yeni görev
// kahve" arrives before the user has finished saying "kahve al". Running every
// partial would create a task per fragment and toast that half a sentence made
// no sense. The hook keeps the words, this component waits until the sentence
// settles — either the words stop changing, or the plugin says the turn ended —
// and only then turns it into an intent with the parser from `lib/voice-intent`
// and hands it to the page, which owns the task handlers. Nothing here touches
// storage.

import { useCallback, useEffect, useRef, useState } from "react"
import { Capacitor } from "@capacitor/core"
import { SpeechRecognition } from "@capacitor-community/speech-recognition"
import { Mic } from "lucide-react"
import { toast } from "sonner"
import { XpDialog, XpMessage } from "@/components/xp-ui"
import { parseVoiceCommand, type VoiceIntent } from "@/lib/voice-intent"
import type { Task } from "@/lib/task"

/** The plugin registers itself under this name. */
const PLUGIN = "SpeechRecognition"

/** Turkish is the language the parser reads. */
const LANGUAGE = "tr-TR"

/** How long the transcript must hold still before it counts as the whole command. */
const SETTLE_MS = 900

const UNKNOWN = "Sesli komut anlaşılmadı"
const AMBIGUOUS_UPDATE = "Hangi görev olduğunu belirt"

function errorText(error: unknown): string {
  if (error instanceof Error && error.message !== "") return error.message
  return UNKNOWN
}

function firstMatch(matches: string[] | undefined): string {
  return (matches?.[0] ?? "").trim()
}

/** RECORD_AUDIO on Android, the microphone on iOS, asked for on first use. */
async function ensurePermission(): Promise<boolean> {
  const current = await SpeechRecognition.checkPermissions()
  if (current?.speechRecognition === "granted") return true

  const asked = await SpeechRecognition.requestPermissions()
  return asked?.speechRecognition === "granted"
}

/**
 * Wraps the speech plugin. `supported` is false on the web, where the button
 * stays hidden; `transcript` holds the words spoken so far and `settled` counts
 * the turns the plugin reported as finished.
 */
export function useSpeech(): {
  supported: boolean
  listening: boolean
  transcript: string
  error: string | null
  settled: number
  start: () => Promise<void>
  stop: () => void
} {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [settled, setSettled] = useState(0)
  const listenerRef = useRef<{ remove: () => Promise<void> } | null>(null)

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable(PLUGIN)) return

    let alive = true
    void SpeechRecognition.available()
      .then((result) => {
        if (alive) setSupported(result?.available === true)
      })
      .catch(() => {
        if (alive) setSupported(false)
      })

    return () => {
      alive = false
    }
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setTranscript("")

    try {
      if (!(await ensurePermission())) throw new Error("Mikrofon izni verilmedi")

      const partials = await SpeechRecognition.addListener("partialResults", (data) => {
        setTranscript(firstMatch(data?.matches))
      })

      // With `partialResults` the plugin resolves `start()` straight away and
      // keeps sending words, so the state that ends the turn is the plugin's.
      const state = await SpeechRecognition.addListener("listeningState", (data) => {
        setListening(data?.status === "started")
        if (data?.status === "stopped") setSettled((turns) => turns + 1)
      })
      listenerRef.current = {
        remove: async () => {
          await Promise.all([partials.remove(), state.remove()])
        },
      }

      setListening(true)
      const result = await SpeechRecognition.start({
        language: LANGUAGE,
        partialResults: true,
        popup: false,
        maxResults: 1,
      })

      // Without partial results the sentence arrives here instead. This device
      // resolves nothing at all when partials are on, so the fields are read
      // as if they may be missing.
      const spoken = firstMatch(result?.matches)
      if (spoken !== "") {
        setTranscript(spoken)
        setListening(false)
      }
    } catch (err) {
      setListening(false)
      setError(errorText(err))
    }
  }, [])

  const stop = useCallback(() => {
    const listener = listenerRef.current
    listenerRef.current = null
    void listener?.remove()

    // The last words stay: the plugin ends the turn right after this, and the
    // settle logic runs what was heard.
    setListening(false)
    void Promise.resolve(SpeechRecognition.stop()).catch(() => undefined)
  }, [])

  return { supported, listening, transcript, error, settled, start, stop }
}

type ConfirmIntent = Extract<VoiceIntent, { action: "confirm" }>

export default function VoiceCommand({
  tasks,
  execute,
  visible,
}: {
  tasks: Task[]
  execute: (intent: VoiceIntent) => Promise<string>
  visible: boolean
}) {
  const { supported, listening, transcript, error, settled, start, stop } = useSpeech()
  const [pending, setPending] = useState<ConfirmIntent | null>(null)

  // The parser needs the task list and the handler as they are when the words
  // were spoken, so neither a settling timer nor a later task list re-runs them.
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks
  const executeRef = useRef(execute)
  executeRef.current = execute
  const transcriptRef = useRef(transcript)
  transcriptRef.current = transcript

  /** The sentence that already ran, so one utterance never runs twice. */
  const handledRef = useRef("")
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearSettle = useCallback(() => {
    if (settleTimerRef.current === null) return
    clearTimeout(settleTimerRef.current)
    settleTimerRef.current = null
  }, [])

  const runCommand = useCallback((spoken: string) => {
    const text = spoken.trim()
    // The plugin delivers the finished sentence twice — once as start()'s
    // result and once as the last partial — and the settle window can open
    // after the turn has already ended.
    if (text === "" || text === handledRef.current) return
    handledRef.current = text

    const intent = parseVoiceCommand(text, tasksRef.current, new Date())

    if (intent.action === "unknown") {
      toast.error(UNKNOWN)
      return
    }

    if (intent.action === "confirm") {
      setPending(intent)
      return
    }

    void executeRef.current(intent).then((message) => toast.success(message))
  }, [])

  useEffect(() => {
    if (!error) return
    toast.error(error)
  }, [error])

  // The settle window. Words still arriving restart it, so the half-heard
  // sentences never reach the parser; a plugin that returns the whole utterance
  // at once has nothing to wait for.
  useEffect(() => {
    const spoken = transcript.trim()
    // A new utterance starts empty, so the same words may be spoken again.
    if (spoken === "") {
      handledRef.current = ""
      return
    }
    if (spoken === handledRef.current) return
    if (!listening) {
      runCommand(spoken)
      return
    }

    const timer = setTimeout(() => {
      settleTimerRef.current = null
      runCommand(spoken)
    }, SETTLE_MS)
    settleTimerRef.current = timer

    return () => {
      clearTimeout(timer)
      if (settleTimerRef.current === timer) settleTimerRef.current = null
    }
  }, [transcript, listening, runCommand])

  // A turn the plugin ended on its own runs at once, without waiting the window out.
  useEffect(() => {
    if (settled === 0) return
    const spoken = transcriptRef.current.trim()
    if (spoken === "") return

    clearSettle()
    runCommand(spoken)
  }, [settled, clearSettle, runCommand])

  // Walking away from the screen leaves no recognizer running behind it, and
  // nothing half-said may act on tasks the user can no longer see.
  const listeningRef = useRef(listening)
  listeningRef.current = listening

  useEffect(() => {
    if (visible) return
    clearSettle()
    handledRef.current = ""
    if (listeningRef.current) stop()
  }, [visible, stop, clearSettle])

  useEffect(() => stop, [stop])

  const pickCandidate = async (task: Task) => {
    const wanted = pending?.wanted
    setPending(null)
    if (!wanted) return

    // An update needs the words that follow the title, and those were spent on
    // naming the candidates. Ask for the task instead of guessing.
    if (wanted === "update") {
      toast.error(AMBIGUOUS_UPDATE)
      return
    }

    const intent: VoiceIntent = { action: wanted, task }
    toast.success(await execute(intent))
  }

  if (!visible || !supported) return null

  return (
    <>
      <button
        type="button"
        className="xp-btn"
        aria-label="Sesli komut"
        aria-pressed={listening}
        onClick={() => (listening ? stop() : void start())}
        style={{
          position: "fixed",
          right: 18,
          bottom: "calc(var(--xp-taskbar-h) + 18px)",
          zIndex: 45,
          minWidth: 0,
          width: 58,
          height: 58,
          padding: 0,
          borderRadius: 6,
        }}
      >
        <Mic size={28} aria-hidden="true" />
      </button>

      {listening && transcript !== "" && (
        <div
          className="xp-balloon"
          role="status"
          style={{ bottom: "calc(var(--xp-taskbar-h) + 84px)" }}
        >
          <div className="xp-balloon-title">
            <Mic size={16} aria-hidden="true" />
            Dinliyorum
          </div>
          <div>{transcript}</div>
        </div>
      )}

      {pending && (
        <XpDialog
          title="Sesli Komut"
          icon="info"
          onClose={() => setPending(null)}
          buttons={
            <button type="button" className="xp-btn is-default" onClick={() => setPending(null)}>
              Vazgeç
            </button>
          }
        >
          <XpMessage icon="info">
            <p>Bu komut hangi görevle ilgili?</p>
          </XpMessage>
          <div className="xp-dialog-buttons" style={{ justifyContent: "flex-start" }}>
            {pending.candidates.map((task) => (
              <button
                key={task.id}
                type="button"
                className="xp-btn is-wide"
                style={{ textAlign: "left" }}
                onClick={() => void pickCandidate(task)}
              >
                {task.title}
              </button>
            ))}
          </div>
        </XpDialog>
      )}
    </>
  )
}
