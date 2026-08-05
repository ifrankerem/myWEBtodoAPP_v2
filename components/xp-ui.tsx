"use client"

import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { ArrowLeft, ListTodo, Menu, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

interface XpHeaderProps {
  title: string
  onOpenDrawer?: () => void
  onBack?: () => void
  actions?: ReactNode
}

export function ThemeToggle({ showLabel = true }: { showLabel?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const isDark = mounted && resolvedTheme === "dark"

  return (
    <button
      type="button"
      className="xp-button xp-theme-toggle"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={mounted ? `Switch to ${isDark ? "light" : "dark"} mode` : "Change theme"}
      title={mounted ? `${isDark ? "Light" : "Dark"} mode` : "Theme"}
    >
      {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
      {showLabel && <span>{mounted ? (isDark ? "Light" : "Dark") : "Theme"}</span>}
    </button>
  )
}

export function XpHeader({ title, onOpenDrawer, onBack, actions }: XpHeaderProps) {
  return (
    <header className="xp-header">
      <div className="xp-titlebar">
        <div className="xp-titlebar-caption">
          <span className="xp-app-icon" aria-hidden="true">
            <ListTodo />
          </span>
          <span>Task Manager — {title}</span>
        </div>
        <ThemeToggle showLabel={false} />
      </div>
      <div className="xp-toolbar" role="toolbar" aria-label={`${title} commands`}>
        {onOpenDrawer && (
          <button type="button" className="xp-toolbar-button" onClick={onOpenDrawer}>
            <Menu aria-hidden="true" />
            <span>Menu</span>
          </button>
        )}
        {onBack && (
          <button type="button" className="xp-toolbar-button" onClick={onBack}>
            <ArrowLeft aria-hidden="true" />
            <span>Back</span>
          </button>
        )}
        {actions && <div className="xp-toolbar-actions">{actions}</div>}
      </div>
    </header>
  )
}

export function XpStatusBar({ children }: { children: ReactNode }) {
  return <footer className="xp-statusbar">{children}</footer>
}
