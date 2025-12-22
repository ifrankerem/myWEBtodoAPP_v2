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
      className={`fixed top-0 left-0 h-full w-[75%] max-w-[280px] bg-[#121212] border-r border-[#2a2a2a] z-50 transition-transform duration-300 ease-out flex flex-col ${
        isOpen ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      {/* App Title */}
      <div className="p-6 pt-12 border-b border-[#2a2a2a]">
        <div>
          <p className="text-white font-medium text-lg">Task Manager</p>
          <p className="text-xs text-[#666] mt-1">by ifrankerem · v1.1.0</p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 p-6 space-y-2">
        <button
          onClick={() => onNavigate("tasks")}
          className={`w-full flex items-center gap-3 px-4 py-4 rounded-lg text-left transition-all ${
            currentScreen === "tasks"
              ? "bg-[#1f1f1f] text-white shadow-[0_0_15px_rgba(255,255,255,0.1)] border-l-2 border-white"
              : "text-[#888] hover:text-white hover:bg-[#1a1a1a]"
          }`}
        >
          <ListTodo className="w-5 h-5" />
          <span className="text-lg font-medium tracking-wide">TASKS</span>
        </button>
        <button
          onClick={() => onNavigate("calendar")}
          className={`w-full flex items-center gap-3 px-4 py-4 rounded-lg text-left transition-all ${
            currentScreen === "calendar"
              ? "bg-[#1f1f1f] text-white shadow-[0_0_15px_rgba(255,255,255,0.1)] border-l-2 border-white"
              : "text-[#888] hover:text-white hover:bg-[#1a1a1a]"
          }`}
        >
          <Calendar className="w-5 h-5" />
          <span className="text-lg font-medium tracking-wide">CALENDAR</span>
        </button>
        <button
          onClick={() => onNavigate("completed")}
          className={`w-full flex items-center gap-3 px-4 py-4 rounded-lg text-left transition-all ${
            currentScreen === "completed"
              ? "bg-[#1f1f1f] text-white shadow-[0_0_15px_rgba(255,255,255,0.1)] border-l-2 border-white"
              : "text-[#888] hover:text-white hover:bg-[#1a1a1a]"
          }`}
        >
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-lg font-medium tracking-wide">COMPLETED</span>
        </button>
      </div>

      {/* Settings Link at Bottom */}
      <div className="p-6 pt-0">
        <button
          onClick={() => onNavigate("settings")}
          className={`w-full flex items-center gap-3 px-4 py-4 rounded-lg text-left transition-all ${
            currentScreen === "settings"
              ? "bg-[#1f1f1f] text-white shadow-[0_0_15px_rgba(255,255,255,0.1)] border-l-2 border-white"
              : "text-[#888] hover:text-white hover:bg-[#1a1a1a]"
          }`}
        >
          <Settings className="w-5 h-5" />
          <span className="text-lg font-medium tracking-wide">SETTINGS</span>
        </button>
      </div>
    </div>
  )
}
