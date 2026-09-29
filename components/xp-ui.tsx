"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { useTheme } from "next-themes"
import { XpIcon, type XpIconName } from "@/components/xp-icons"
import type { Task } from "@/lib/task"
export { SCHEMES } from "@/lib/themes"

/* =====================================================================
   Window controls. The page provides these; a screen rendered on its own
   (tests, previews) gets harmless defaults.
   ===================================================================== */
interface WindowControls {
  windowed: boolean
  onMinimize?: () => void
  onClose?: () => void
  onToggleWindowed?: () => void
}

const WindowControlsContext = createContext<WindowControls>({ windowed: false })
export const WindowControlsProvider = WindowControlsContext.Provider

interface XpWindowProps {
  title: string
  icon: XpIconName
  /** "window" shows minimize/maximize/close; "dialog" only a close button. */
  kind?: "window" | "dialog"
  onDialogClose?: () => void
  children: ReactNode
  label?: string
}

export function XpWindow({ title, icon, kind = "window", onDialogClose, children, label }: XpWindowProps) {
  const controls = useContext(WindowControlsContext)
  return (
    <section
      className={`xp-window${controls.windowed && kind === "window" ? " is-windowed" : ""}`}
      data-xp-window
      aria-label={label ?? title}
    >
      <XpTitlebar
        title={title}
        icon={icon}
        buttons={
          kind === "window" ? (
            <>
              <button type="button" className="xp-ctl is-min" aria-label="Minimize" onClick={controls.onMinimize} />
              <button
                type="button"
                className={`xp-ctl ${controls.windowed ? "is-max" : "is-restore"}`}
                aria-label={controls.windowed ? "Maximize" : "Restore down"}
                onClick={controls.onToggleWindowed}
              />
              <button type="button" className="xp-ctl is-close" aria-label="Close" onClick={controls.onClose} />
            </>
          ) : (
            <button type="button" className="xp-ctl is-close" aria-label="Close" onClick={onDialogClose} />
          )
        }
      />
      {children}
    </section>
  )
}

export function XpTitlebar({ title, icon, buttons }: { title: string; icon: XpIconName; buttons?: ReactNode }) {
  return (
    <div className="xp-titlebar">
      <XpIcon name={icon} size={18} />
      <span className="xp-titlebar-text">{title}</span>
      {buttons && <div className="xp-ctls">{buttons}</div>}
    </div>
  )
}

export function XpToolbar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="xp-toolbar" role="toolbar" aria-label={label}>
      {children}
    </div>
  )
}

interface ToolButtonProps {
  icon: XpIconName
  label?: string
  onClick?: () => void
  disabled?: boolean
  pressed?: boolean
  danger?: boolean
  ariaLabel?: string
}

export function XpToolButton({ icon, label, onClick, disabled, pressed, danger, ariaLabel }: ToolButtonProps) {
  return (
    <button
      type="button"
      className={`xp-tbtn${danger ? " is-danger" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={ariaLabel}
    >
      <XpIcon name={icon} size={24} />
      {label && <span>{label}</span>}
    </button>
  )
}

export const XpToolSeparator = () => <span className="xp-tsep" aria-hidden="true" />

export function XpStatusBar({ children }: { children: ReactNode }) {
  return <footer className="xp-statusbar">{children}</footer>
}

export function XpSynced() {
  return (
    <span className="xp-sb">
      <XpIcon name="sync" size={14} /> Synced
    </span>
  )
}

/* =====================================================================
   Dialogs
   ===================================================================== */
interface XpDialogProps {
  title: string
  icon: XpIconName
  onClose?: () => void
  children: ReactNode
  buttons?: ReactNode
  maxWidth?: number
  role?: "dialog" | "alertdialog"
}

export function XpDialog({ title, icon, onClose, children, buttons, maxWidth, role = "dialog" }: XpDialogProps) {
  useEffect(() => {
    if (!onClose) return
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div className="xp-modal">
      <div className="xp-dialog" role={role} aria-modal="true" aria-label={title} style={maxWidth ? { maxWidth } : undefined}>
        <XpTitlebar
          title={title}
          icon={icon}
          buttons={onClose && <button type="button" className="xp-ctl is-close" aria-label="Close" onClick={onClose} />}
        />
        {children}
        {buttons && <div className="xp-dialog-buttons">{buttons}</div>}
      </div>
    </div>
  )
}

export function XpMessage({ icon, children }: { icon: XpIconName; children: ReactNode }) {
  return (
    <div className="xp-dialog-body">
      <XpIcon name={icon} size={36} />
      <div>{children}</div>
    </div>
  )
}

/** The Explorer file-copy dialog, used while a new task is saved. */
export function XpCopyDialog({ title }: { title: string }) {
  return (
    <XpDialog title="Saving…" icon="newTask">
      <div className="xp-copy-anim" aria-hidden="true">
        <span className="is-from"><XpIcon name="folder" size={40} /></span>
        <span className="is-paper"><XpIcon name="doc" size={26} /></span>
        <span className="is-to"><XpIcon name="folderTasks" size={40} /></span>
      </div>
      <div className="xp-copy-text" role="status">
        <b>Saving “{title}”</b>
        <small>From “New Task” to “My Tasks”</small>
      </div>
      <div className="xp-copy-bar">
        <div className="xp-progress is-running"><i /></div>
      </div>
      <div className="xp-dialog-buttons">
        <button type="button" className="xp-btn" disabled>Cancel</button>
      </div>
    </XpDialog>
  )
}

export function XpBalloon({
  title,
  children,
  onOpen,
  onClose,
}: {
  title: string
  children: ReactNode
  onOpen?: () => void
  onClose: () => void
}) {
  return (
    <div
      className="xp-balloon"
      role="status"
      onClick={onOpen}
      onKeyDown={(event) => event.key === "Enter" && onOpen?.()}
      tabIndex={onOpen ? 0 : undefined}
    >
      <button
        type="button"
        className="xp-balloon-x"
        aria-label="Close"
        onClick={(event) => {
          event.stopPropagation()
          onClose()
        }}
      >
        ×
      </button>
      <div className="xp-balloon-title"><XpIcon name="bell" size={16} />{title}</div>
      <div>{children}</div>
    </div>
  )
}

export function XpCheckbox({
  checked,
  onChange,
  children,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <label className="xp-cb">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
      {children}
    </label>
  )
}

/* =====================================================================
   Task thumbnail: document icon or photo, with alarm/repeat/done badges.
   ===================================================================== */
export function XpTaskThumb({ task, size, repeating }: { task: Task; size: number; repeating: boolean }) {
  const badge: XpIconName | null = task.completed ? null : task.alarm ? "clock" : repeating ? "sync" : null
  return (
    <span className={`xp-thumb${task.photo ? " is-photo" : ""}`} style={{ ["--s" as string]: `${size}px` }}>
      {task.photo ? <img src={task.photo} alt="" /> : <XpIcon name="doc" size={size} />}
      {badge && <span className="xp-badge"><XpIcon name={badge} size={14} /></span>}
      {task.completed && <span className="xp-badge is-ok"><XpIcon name="check" size={14} /></span>}
    </span>
  )
}

/* =====================================================================
   Color schemes
   ===================================================================== */
export function useScheme() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const changeScheme = (next: string) => {
    if (next === theme) return
    if (prefersReducedMotion()) {
      setTheme(next)
      return
    }
    // A short white flash, like XP repainting after "Apply".
    const flash = document.createElement("div")
    flash.className = "xp-flash"
    document.body.appendChild(flash)
    window.setTimeout(() => setTheme(next), 170)
    window.setTimeout(() => flash.remove(), 520)
  }

  return { scheme: mounted ? theme ?? "system" : "system", changeScheme }
}

/* =====================================================================
   Motion helpers (Web Animations API, positions in viewport pixels)
   ===================================================================== */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

type Box = { x: number; y: number; w: number; h: number }
const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
}

/** XP's window-open "zoom rectangle": a titlebar-colored outline moves between two boxes. */
export async function animateGhost(from: Element | Box, to: Element | Box, duration = 230): Promise<void> {
  if (prefersReducedMotion() || typeof document.body.animate !== "function") return
  const a = from instanceof Element ? boxOf(from) : from
  const b = to instanceof Element ? boxOf(to) : to
  const ghost = document.createElement("div")
  ghost.className = "xp-ghost"
  document.body.appendChild(ghost)
  const frame = (box: Box) => ({ left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` })
  const animation = ghost.animate([frame(a), frame(b)], { duration, easing: "cubic-bezier(.3,.7,.3,1)", fill: "forwards" })
  await animation.finished.catch(() => undefined)
  ghost.remove()
}

/** Copy of `source` flies in an arc onto `target`. */
export async function animateFly(source: Element | null, target: Element | null): Promise<void> {
  if (!source || !target || prefersReducedMotion() || typeof document.body.animate !== "function") return
  const a = boxOf(source)
  const b = boxOf(target)
  const clone = document.createElement("div")
  clone.className = "xp-fly"
  clone.innerHTML = source.innerHTML
  Object.assign(clone.style, { left: `${a.x}px`, top: `${a.y}px`, width: `${a.w}px`, height: `${a.h}px` })
  document.body.appendChild(clone)
  const dx = b.x + b.w / 2 - (a.x + a.w / 2)
  const dy = b.y + b.h / 2 - (a.y + a.h / 2)
  const animation = clone.animate(
    [
      { transform: "translate(0,0) scale(1) rotate(0)", opacity: 1 },
      { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 130}px) scale(.9) rotate(-14deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(.22) rotate(-32deg)`, opacity: 0.35 },
    ],
    { duration: 700, easing: "cubic-bezier(.45,0,.55,1)", fill: "forwards" },
  )
  await animation.finished.catch(() => undefined)
  clone.remove()
}

export const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, prefersReducedMotion() ? 0 : ms))

/** Lets the taskbar's start button bounce when a task lands in Completed. */
export const START_BUMP_EVENT = "xp:start-bump"
