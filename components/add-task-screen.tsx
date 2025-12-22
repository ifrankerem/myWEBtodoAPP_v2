"use client"

import type React from "react"

import { useState } from "react"
import { Menu, ImageIcon, X, Check } from "lucide-react"
import type { Task } from "@/app/page"

interface AddTaskScreenProps {
  onSave: (task: Omit<Task, "id" | "createdDate" | "lastEditedDate">, photoFile?: File) => void
  onCancel: () => void
  onOpenDrawer: () => void
}

export default function AddTaskScreen({ onSave, onCancel, onOpenDrawer }: AddTaskScreenProps) {
  const [title, setTitle] = useState("")
  const [detail, setDetail] = useState("")
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [alarmEnabled, setAlarmEnabled] = useState(false)
  const [alarmTime, setAlarmTime] = useState("12:00")
  const [isRepetitive, setIsRepetitive] = useState(false)
  const [selectedDays, setSelectedDays] = useState<string[]>([])
  const [dueDate, setDueDate] = useState("")

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

  const toggleDay = (day: string) => {
    setSelectedDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]))
  }

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setPhotoFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        const result = reader.result as string
        setPhotoPreview(result)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSave = () => {
    const task: Omit<Task, "id" | "createdDate" | "lastEditedDate"> = {
      name: title || "Untitled Task",
      title: title || "Untitled Task",
      type: photoFile ? "picture" : "text",
      photo: photoPreview || undefined,
      detail: detail || undefined,
      alarm: alarmEnabled ? alarmTime : undefined,
      repeats: isRepetitive && selectedDays.length > 0 ? selectedDays.join(", ") : undefined,
      dueDate: dueDate || undefined,
    }
    onSave(task, photoFile || undefined)
  }

  return (
    <div className="h-screen flex flex-col bg-[#0B0B0B] relative">
      {/* Header */}
      <div className="flex items-center justify-between p-6 pb-4">
        <button onClick={onOpenDrawer} className="p-2 hover:bg-[#1a1a1a] rounded-lg transition-colors">
          <Menu className="w-6 h-6 text-[#888]" />
        </button>
        <h1 className="text-sm font-medium tracking-[0.2em] text-[#888]">ADD TASK</h1>
        <div className="w-10" />
      </div>

      {/* Form Container */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-md mx-auto border border-[#2a2a2a] rounded-2xl p-6 bg-[#0f0f0f] space-y-6">
          <div>
            <label className="block text-sm text-[#ddd] mb-3">Title:</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter task title"
              className="w-full px-4 py-3 bg-[#1a1a1a] border border-[#333] rounded-lg text-white placeholder:text-[#666] focus:border-[#555] focus:outline-none transition-colors"
            />
          </div>

          <div className="border-t border-[#222]" />

          <div>
            <label className="block text-sm text-[#ddd] mb-3">Details (optional):</label>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Enter task details"
              rows={4}
              className="w-full px-4 py-3 bg-[#1a1a1a] border border-[#333] rounded-lg text-white placeholder:text-[#666] focus:border-[#555] focus:outline-none transition-colors resize-none"
            />
          </div>

          <div className="border-t border-[#222]" />

          <div>
            <label className="block text-sm text-[#ddd] mb-3">Due Date (optional):</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-4 py-3 bg-[#1a1a1a] border border-[#333] rounded-lg text-white focus:border-[#555] focus:outline-none transition-colors [color-scheme:dark]"
            />
          </div>

          <div className="border-t border-[#222]" />

          {/* Photo */}
          <div>
            <label className="block text-sm text-[#ddd] mb-3">Photo (optional):</label>
            <div className="flex gap-3">
              <label className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#1a1a1a] border border-[#333] rounded-lg text-[#ddd] hover:border-[#555] transition-colors cursor-pointer">
                Add Photo
                <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              </label>
              <div className="w-14 h-14 bg-[#1a1a1a] border border-[#333] rounded-lg flex items-center justify-center overflow-hidden">
                {photoPreview ? (
                  <img src={photoPreview || "/placeholder.svg"} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="w-6 h-6 text-[#666]" />
                )}
              </div>
            </div>
            {photoPreview && (
              <button
                onClick={() => {
                  setPhotoFile(null)
                  setPhotoPreview(null)
                }}
                className="mt-2 text-xs text-[#ff3b30] hover:text-[#ff453a] flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                Remove photo
              </button>
            )}
          </div>

          <div className="border-t border-[#222]" />

          {/* Alarm */}
          <div>
            <label className="block text-sm text-[#ddd] mb-3">Alarm (optional):</label>
            <div className="flex items-center gap-3">
              <input
                type="time"
                value={alarmTime}
                onChange={(e) => setAlarmTime(e.target.value)}
                className="flex-1 px-4 py-3 bg-[#1a1a1a] border border-[#333] rounded-lg text-white focus:border-[#555] focus:outline-none transition-colors [color-scheme:dark]"
              />
              <button
                onClick={() => setAlarmEnabled(!alarmEnabled)}
                className={`px-6 py-2 rounded-full border transition-all ${
                  alarmEnabled ? "bg-white text-black border-white" : "bg-[#1a1a1a] text-[#888] border-[#333]"
                }`}
              >
                {alarmEnabled ? "ON" : "OFF"}
              </button>
            </div>
          </div>

          <div className="border-t border-[#222]" />

          {/* Repetitive */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm text-[#ddd]">Is it repetitive? (optional)</label>
              <button
                onClick={() => setIsRepetitive(!isRepetitive)}
                className={`px-6 py-2 rounded-full border transition-all ${
                  isRepetitive ? "bg-white text-black border-white" : "bg-[#1a1a1a] text-[#888] border-[#333]"
                }`}
              >
                {isRepetitive ? "ON" : "OFF"}
              </button>
            </div>
            {isRepetitive && (
              <div className="flex gap-2 flex-wrap mt-4">
                {days.map((day) => (
                  <button
                    key={day}
                    onClick={() => toggleDay(day)}
                    className={`px-4 py-2 rounded-lg border text-sm transition-all ${
                      selectedDays.includes(day)
                        ? "bg-white text-black border-white"
                        : "bg-[#1a1a1a] text-[#888] border-[#333] hover:border-[#555]"
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-8 right-6 flex flex-col gap-3 z-30">
        {/* Cancel Button */}
        <button
          onClick={onCancel}
          className="w-14 h-14 rounded-full bg-[#2a2a2a] text-[#888] flex items-center justify-center shadow-lg hover:bg-[#333] active:scale-95 transition-all"
        >
          <X className="w-6 h-6" />
        </button>
        
        {/* Save Button - Primary */}
        <button
          onClick={handleSave}
          className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center shadow-lg hover:bg-gray-100 active:scale-95 transition-all shadow-[0_4px_20px_rgba(255,255,255,0.3)]"
        >
          <Check className="w-7 h-7" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  )
}
