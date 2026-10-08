"use client"

// In-app voice control for the tasks screen.
//
// The speech plugin streams the words it is still hearing, so "Yeni görev
// kahve" arrives before the user has finished saying "kahve al". Running every
// partial would create a task per fragment and toast that half a sentence made
// no sense. The hook keeps the words, this component holds them still for
// SETTLE_MS and only then turns the sentence into an intent with the parser
// from `lib/voice-intent`, handing the intent to the page, which owns the task
// handlers. Nothing here touches storage.
//
// A turn starts with each tap and runs one command. That is not only tidiness:
// on this device the plugin reports the turn ended before the last words arrive
// ("stopped" comes from onEndOfSpeech, the rest from onResults), so an ended
// turn says nothing about whether the sentence is complete — only the silence
// after the words does.

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
  const { supported, listening, transcript, error, start, stop } = useSpeech()
  const [pending, setPending] = useState<ConfirmIntent | null>(null)

  // The parser needs the task list and the handler as they are when the words
  // were spoken, so neither a settling timer nor a later task list re-runs them.
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks
  const executeRef = useRef(execute)
  executeRef.current = execute

  /** Set once this turn's command ran, so the words that keep arriving are ignored. */
  const spentRef = useRef(false)
  /** Set once this turn has words of its own, which tells the plugin's result
      from a partial it streams after the turn ended. */
  const heardRef = useRef(false)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Read inside the settle effect, which must not re-run when listening flips.
  const listeningRef = useRef(listening)
  listeningRef.current = listening

  const clearSettle = useCallback(() => {
    if (settleTimerRef.current === null) return
    clearTimeout(settleTimerRef.current)
    settleTimerRef.current = null
  }, [])

  const runCommand = useCallback((spoken: string) => {
    const text = spoken.trim()
    // One turn, one command: the plugin keeps sending words after it ran.
    if (text === "" || spentRef.current) return
    spentRef.current = true

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

  /** Wait for the words to hold still, then run them; restarts on every change. */
  const armSettle = useCallback(
    (spoken: string) => {
      const timer = setTimeout(() => {
        settleTimerRef.current = null
        runCommand(spoken)
      }, SETTLE_MS)
      settleTimerRef.current = timer

      return () => {
        clearTimeout(timer)
        if (settleTimerRef.current === timer) settleTimerRef.current = null
      }
    },
    [runCommand]
  )

  useEffect(() => {
    if (!error) return
    toast.error(error)
  }, [error])

  useEffect(() => {
    const spoken = transcript.trim()

    // A new turn opens with an empty transcript, so the same words may be spoken
    // again.
    if (spoken === "") {
      spentRef.current = false
      heardRef.current = false
      return
    }

    // The turn's one command has already run.
    if (spentRef.current) return

    // Anything after the first words of a turn is the plugin still sending the
    // sentence, even when it has already reported the turn ended. Those wait.
    if (heardRef.current) return armSettle(spoken)
    heardRef.current = true

    // A plugin with nothing to stream hands the whole sentence over in start()'s
    // result instead, and there is nothing left to settle.
    if (!listeningRef.current) {
      runCommand(spoken)
      return
    }

    return armSettle(spoken)
  }, [transcript, armSettle, runCommand])

  // Walking away from the screen leaves no recognizer running behind it, and
  // nothing half-said may act on tasks the user can no longer see.
  useEffect(() => {
    if (visible) return
    // Drop the turn: `stop()` below ends listening, and the words must be spent
    // so that nothing is left for it to run.
    clearSettle()
    spentRef.current = true
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
