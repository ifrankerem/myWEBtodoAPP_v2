"use client"

import type { Screen } from "@/lib/task"
import { XpIcon, type XpIconName } from "@/components/xp-icons"

interface StartMenuProps {
  email: string
  currentScreen: Screen
  counts: { open: number; dueThisWeek: number; done: number }
  onNavigate: (screen: Screen) => void
  onNewTask: () => void
  onShowReminders: () => void
  onLogOff: () => void
  onClose: () => void
}

const pinned: Array<{ screen: Screen; label: string; icon: XpIconName; detail: (c: StartMenuProps["counts"]) => string }> = [
  { screen: "tasks", label: "My Tasks", icon: "folderTasks", detail: (c) => `${c.open} open` },
  { screen: "calendar", label: "Calendar", icon: "calendar", detail: (c) => `${c.dueThisWeek} due this week` },
  { screen: "completed", label: "Completed", icon: "folderDone", detail: (c) => `${c.done} done` },
]

/** Replaces the old sliding drawer: opens upward from the taskbar's start button. */
export default function StartMenu({
  email,
  currentScreen,
  counts,
  onNavigate,
  onNewTask,
  onShowReminders,
  onLogOff,
  onClose,
}: StartMenuProps) {
  return (
    <>
      <button type="button" className="xp-scrim" aria-label="Close start menu" onClick={onClose} />
      <nav className="xp-startmenu" aria-label="Start menu">
        <div className="xp-sm-head">
          <span className="xp-sm-pic"><XpIcon name="user" size={44} /></span>
          <b>{email}</b>
        </div>
        <div className="xp-orange-line" />
        <div className="xp-sm-body">
          <div className="xp-sm-left">
            {pinned.map(({ screen, label, icon, detail }) => (
              <button
                key={screen}
                type="button"
                className="xp-sm-item"
                aria-current={currentScreen === screen ? "page" : undefined}
                onClick={() => onNavigate(screen)}
              >
                <XpIcon name={icon} size={32} />
                <span><b>{label}</b><small>{detail(counts)}</small></span>
              </button>
            ))}
            <div className="xp-sm-sep" />
            <button type="button" className="xp-sm-item" onClick={onNewTask}>
              <XpIcon name="newTask" size={32} />
              <span><b>New Task</b><small>Add a task or reminder</small></span>
            </button>
          </div>
          <div className="xp-sm-right">
            <button type="button" className="xp-sm-item" onClick={() => onNavigate("settings")}>
              <XpIcon name="gear" size={24} />Settings
            </button>
            <button type="button" className="xp-sm-item" onClick={onShowReminders}>
              <XpIcon name="bell" size={24} />Reminders
            </button>
            <button type="button" className="xp-sm-item" onClick={() => onNavigate("settings")}>
              <XpIcon name="monitor" size={24} />Appearance
            </button>
            <button type="button" className="xp-sm-item" onClick={() => onNavigate("settings")}>
              <XpIcon name="floppy" size={24} />Back Up Tasks
            </button>
          </div>
        </div>
        <div className="xp-sm-foot">
          <button type="button" onClick={onLogOff}><XpIcon name="logoff" size={26} />Log Off</button>
        </div>
      </nav>
    </>
  )
}
