"use client"

import type { Screen } from "@/app/page"
import { Calendar, ListTodo, CheckCircle2, Settings } from "lucide-react"

interface SlidingDrawerProps {
  isOpen: boolean
  currentScreen: Screen
  onNavigate: (screen: Screen) => void
}

export default function SlidingDrawer({ isOpen, currentScreen, onNavigate }: SlidingDrawerProps) {
  return (
    <div
      className={`fixed top-0 left-0 h-full w-[75%] max-w-[280px] bg-[var(--obsidian-1)] border-r border-[var(--obsidian-border)] z-50 flex flex-col ${
        isOpen ? "translate-x-0" : "-translate-x-full"
      }`}
      style={{ transition: 'transform 0.35s var(--ease-out-expo)' }}
    >
      {/* App Title */}
      <div className="p-6 pt-12 border-b border-[var(--obsidian-border)]">
        <div>
          <p 
            className="text-[var(--metal-bright)] text-lg tracking-tight"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
          >
            Task Manager
          </p>
          <p className="text-xs text-[var(--metal-muted)] mt-1 font-light">by ifrankerem · v1.2.0</p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 p-6 space-y-2">
        <button
          onClick={() => onNavigate("tasks")}
          className={`w-full flex items-center gap-3 px-4 py-4 rounded-lg text-left transition-all duration-300 ${
            currentScreen === "tasks"
              ? "bg-[var(--obsidian-2)] text-[var(--ember)] shadow-[0_0_15px_rgba(var(--ember-rgb),0.1)] border-l-2 border-[var(--ember)]"
              : "text-[var(--metal-muted)] hover:text-[var(--metal-bright)] hover:bg-[var(--obsidian-2)]"
          }`}
        >
          <ListTodo className="w-5 h-5" />
          <span className="text-lg tracking-wide" style={{ fontFamily: 'var(--font-display)', fontWeight: currentScreen === "tasks" ? 700 : 500 }}>TASKS</span>
        </button>
        <button
          onClick={() => onNavigate("calendar")}
          className={`w-full flex items-center gap-3 px-4 py-4 rounded-lg text-left transition-all duration-300 ${
            currentScreen === "calendar"
              ? "bg-[var(--obsidian-2)] text-[var(--ember)] shadow-[0_0_15px_rgba(var(--ember-rgb),0.1)] border-l-2 border-[var(--ember)]"
              : "text-[var(--metal-muted)] hover:text-[var(--metal-bright)] hover:bg-[var(--obsidian-2)]"
          }`}
        >
          <Calendar className="w-5 h-5" />
          <span className="text-lg tracking-wide" style={{ fontFamily: 'var(--font-display)', fontWeight: currentScreen === "calendar" ? 700 : 500 }}>CALENDAR</span>
        </button>
        <button
          onClick={() => onNavigate("completed")}
          className={`w-full flex items-center gap-3 px-4 py-4 rounded-lg text-left transition-all duration-300 ${
            currentScreen === "completed"
              ? "bg-[var(--obsidian-2)] text-[var(--forge-green)] shadow-[0_0_15px_rgba(var(--forge-green-rgb),0.1)] border-l-2 border-[var(--forge-green)]"
              : "text-[var(--metal-muted)] hover:text-[var(--metal-bright)] hover:bg-[var(--obsidian-2)]"
          }`}
        >
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-lg tracking-wide" style={{ fontFamily: 'var(--font-display)', fontWeight: currentScreen === "completed" ? 700 : 500 }}>COMPLETED</span>
        </button>
      </div>

      {/* Settings Link at Bottom */}
      <div className="p-6 pt-0">
        <button
          onClick={() => onNavigate("settings")}
          className={`w-full flex items-center gap-3 px-4 py-4 rounded-lg text-left transition-all duration-300 ${
            currentScreen === "settings"
              ? "bg-[var(--obsidian-2)] text-[var(--ember)] shadow-[0_0_15px_rgba(var(--ember-rgb),0.1)] border-l-2 border-[var(--ember)]"
              : "text-[var(--metal-muted)] hover:text-[var(--metal-bright)] hover:bg-[var(--obsidian-2)]"
          }`}
        >
          <Settings className="w-5 h-5" />
          <span className="text-lg tracking-wide" style={{ fontFamily: 'var(--font-display)', fontWeight: currentScreen === "settings" ? 700 : 500 }}>SETTINGS</span>
        </button>
      </div>
    </div>
  )
}
