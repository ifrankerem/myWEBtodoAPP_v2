"use client"

// In-app voice control for the tasks screen.
//
// The speech plugin only reports the words it is still hearing: there is no
// "the sentence is over" event, so the last thing it says is the command. The
// hook keeps that text, the component turns it into an intent with the parser
// from `lib/voice-intent`, and hands the intent to the page, which owns the
// task handlers. Nothing here touches storage.

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
  if (current.speechRecognition === "granted") return true

  const asked = await SpeechRecognition.requestPermissions()
  return asked.speechRecognition === "granted"
}

/**
 * Wraps the speech plugin. `supported` is false on the web, where the button
 * stays hidden; `transcript` holds the words spoken so far.
 */
export function useSpeech(): {
  supported: boolean
  listening: boolean
  transcript: string
  error: string | null
  start: () => Promise<void>
  stop: () => void
} {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [error, setError] = useState<string | null>(null)
  const listenerRef = useRef<{ remove: () => Promise<void> } | null>(null)

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable(PLUGIN)) return

    let alive = true
    void SpeechRecognition.available()
      .then((result) => {
        if (alive) setSupported(result.available === true)
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
        setTranscript(firstMatch(data.matches))
      })

      // With `partialResults` the plugin resolves `start()` straight away and
      // keeps sending words, so the state that ends the turn is the plugin's.
      const state = await SpeechRecognition.addListener("listeningState", (data) => {
        setListening(data.status === "started")
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

      // Without partial results the sentence arrives here instead.
      const spoken = firstMatch(result.matches)
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

    setListening(false)
    setTranscript("")
    void Promise.resolve(SpeechRecognition.stop()).catch(() => undefined)
  }, [])

  return { supported, listening, transcript, error, start, stop }
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

  // The parser needs the task list as it is when the words were spoken, and
  // the effect below must not re-run for a list that changed afterwards.
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks

  // One utterance, one command: the plugin delivers the same sentence twice,
  // once as its result and once as the last partial.
  const handledRef = useRef("")

  useEffect(() => {
    if (!error) return
    toast.error(error)
  }, [error])

  useEffect(() => {
    const spoken = transcript.trim()
    if (spoken === "") {
      handledRef.current = ""
      return
    }
    if (spoken === handledRef.current) return
    handledRef.current = spoken

    const intent = parseVoiceCommand(spoken, tasksRef.current, new Date())

    if (intent.action === "unknown") {
      toast.error(UNKNOWN)
      return
    }

    if (intent.action === "confirm") {
      setPending(intent)
      return
    }

    void execute(intent).then((message) => toast.success(message))
  }, [transcript, execute])

  // Walking away from the screen leaves no recognizer running behind it.
  const listeningRef = useRef(listening)
  listeningRef.current = listening

  useEffect(() => {
    if (visible || !listeningRef.current) return
    stop()
  }, [visible, stop])

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
