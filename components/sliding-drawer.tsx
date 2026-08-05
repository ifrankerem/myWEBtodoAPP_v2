"use client"

import type { Screen } from "@/app/page"
import { Calendar, CheckCircle2, Cloud, ListTodo, Settings } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { ThemeToggle } from "@/components/xp-ui"

interface SlidingDrawerProps {
  isOpen: boolean
  currentScreen: Screen
  onNavigate: (screen: Screen) => void
}

const navigation: Array<{ screen: Screen; label: string; icon: typeof ListTodo }> = [
  { screen: "tasks", label: "My Tasks", icon: ListTodo },
  { screen: "calendar", label: "Calendar", icon: Calendar },
  { screen: "completed", label: "Completed", icon: CheckCircle2 },
  { screen: "settings", label: "Settings", icon: Settings },
]

export default function SlidingDrawer({ isOpen, currentScreen, onNavigate }: SlidingDrawerProps) {
  const { user } = useAuth()

  return (
    <aside
      className={`xp-drawer${isOpen ? " xp-drawer-open" : ""}`}
      aria-label="Task Manager navigation"
      aria-hidden={!isOpen}
      inert={!isOpen}
    >
      <div className="xp-titlebar">
        <div className="xp-titlebar-caption">
          <span className="xp-app-icon" aria-hidden="true"><ListTodo /></span>
          <span>Task Manager</span>
        </div>
        <ThemeToggle showLabel={false} />
      </div>

      <div className="xp-drawer-account">
        <div className="xp-user-icon" aria-hidden="true">
          {user?.email?.charAt(0).toUpperCase() || "?"}
        </div>
        <div className="min-w-0">
          <strong className="block truncate">{user?.email || "Local user"}</strong>
          <span className="xp-sync-label"><Cloud /> Synced</span>
        </div>
      </div>

      <nav className="xp-task-pane">
        <div className="xp-task-pane-heading">Task Manager</div>
        <div className="xp-task-pane-body">
          {navigation.map(({ screen, label, icon: Icon }) => (
            <button
              key={screen}
              type="button"
              className="xp-drawer-link"
              aria-current={currentScreen === screen ? "page" : undefined}
              onClick={() => onNavigate(screen)}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </nav>

      <div className="xp-drawer-footer">
        <ThemeToggle />
        <span>v2.0.0</span>
      </div>
    </aside>
  )
}
