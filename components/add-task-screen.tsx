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
      reader.onloadend = () => { setPhotoPreview(reader.result as string) }
      reader.readAsDataURL(file)
    }
  }
  const handleSave = () => {
    const task: Omit<Task, "id" | "createdDate" | "lastEditedDate"> = {
      name: title || "Untitled Task", title: title || "Untitled Task",
      type: photoFile ? "picture" : "text", photo: photoPreview || undefined,
      detail: detail || undefined, alarm: alarmEnabled ? alarmTime : undefined,
      repeats: isRepetitive && selectedDays.length > 0 ? selectedDays.join(", ") : undefined,
      dueDate: dueDate || undefined,
    }
    onSave(task, photoFile || undefined)
  }

  // Common style shortcuts
  const obs = "var(--obsidian)"
  const obsB = "var(--obsidian-border)"
  const emb = "var(--ember)"
  const embR = "var(--ember-rgb)"
  const mtB = "var(--metal-bright)"
  const mtM = "var(--metal-muted)"

  return (
    <div className="h-screen flex flex-col bg-transparent relative">
      <div className="flex items-center justify-between p-6 pb-4 animate-fade-in">
        <button onClick={onOpenDrawer} className="p-2 hover:bg-[var(--obsidian-2)] rounded-lg transition-colors">
          <Menu className="w-6 h-6 text-[var(--metal-muted)]" />
        </button>
        <h1 className="text-sm font-bold tracking-[0.2em] text-[var(--metal-muted)]" style={{ fontFamily: 'var(--font-display)' }}>ADD TASK</h1>
        <div className="w-10" />
      </div>
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-md mx-auto border border-[var(--obsidian-border)] rounded-2xl p-6 bg-[var(--obsidian-1)] space-y-6 animate-scale-in stagger-1">
          <div>
            <label className="block text-sm text-[var(--metal-bright)] mb-3 font-light">Title:</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enter task title"
              className="w-full px-4 py-3 bg-[var(--obsidian)] border border-[var(--obsidian-border)] rounded-lg text-[var(--metal-bright)] placeholder:text-[var(--metal-muted)] focus:border-[var(--ember)] focus:shadow-[0_0_10px_rgba(var(--ember-rgb),0.15)] focus:outline-none transition-all duration-300" />
          </div>
          <div className="border-t border-[var(--obsidian-border)]" />
          <div>
            <label className="block text-sm text-[var(--metal-bright)] mb-3 font-light">Details (optional):</label>
            <textarea value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Enter task details" rows={4}
              className="w-full px-4 py-3 bg-[var(--obsidian)] border border-[var(--obsidian-border)] rounded-lg text-[var(--metal-bright)] placeholder:text-[var(--metal-muted)] focus:border-[var(--ember)] focus:shadow-[0_0_10px_rgba(var(--ember-rgb),0.15)] focus:outline-none transition-all duration-300 resize-none" />
          </div>
          <div className="border-t border-[var(--obsidian-border)]" />
          <div>
            <label className="block text-sm text-[var(--metal-bright)] mb-3 font-light">Due Date (optional):</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-4 py-3 bg-[var(--obsidian)] border border-[var(--obsidian-border)] rounded-lg text-[var(--metal-bright)] focus:border-[var(--ember)] focus:shadow-[0_0_10px_rgba(var(--ember-rgb),0.15)] focus:outline-none transition-all duration-300 [color-scheme:dark]" />
          </div>
          <div className="border-t border-[var(--obsidian-border)]" />
          <div>
            <label className="block text-sm text-[var(--metal-bright)] mb-3 font-light">Photo (optional):</label>
            <div className="flex gap-3">
              <label className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[var(--obsidian)] border border-[var(--obsidian-border)] rounded-lg text-[var(--metal-bright)] hover:border-[var(--ember)] transition-all duration-300 cursor-pointer">
                Add Photo
                <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              </label>
              <div className="w-14 h-14 bg-[var(--obsidian)] border border-[var(--obsidian-border)] rounded-lg flex items-center justify-center overflow-hidden">
                {photoPreview ? (<img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />) : (<ImageIcon className="w-6 h-6 text-[var(--metal-muted)]" />)}
              </div>
            </div>
            {photoPreview && (
              <button onClick={() => { setPhotoFile(null); setPhotoPreview(null) }} className="mt-2 text-xs text-[var(--forge-red)] hover:brightness-110 flex items-center gap-1">
                <X className="w-3 h-3" />Remove photo
              </button>
            )}
          </div>
          <div className="border-t border-[var(--obsidian-border)]" />
          <div>
            <label className="block text-sm text-[var(--metal-bright)] mb-3 font-light">Alarm (optional):</label>
            <div className="flex items-center gap-3">
              <input type="time" value={alarmTime} onChange={(e) => setAlarmTime(e.target.value)}
                className="flex-1 px-4 py-3 bg-[var(--obsidian)] border border-[var(--obsidian-border)] rounded-lg text-[var(--metal-bright)] focus:border-[var(--ember)] focus:shadow-[0_0_10px_rgba(var(--ember-rgb),0.15)] focus:outline-none transition-all duration-300 [color-scheme:dark]" />
              <button onClick={() => setAlarmEnabled(!alarmEnabled)}
                className={`px-6 py-2 rounded-full border transition-all duration-300 ${alarmEnabled ? "bg-[var(--ember)] text-[var(--obsidian)] border-[var(--ember)] shadow-[0_0_12px_rgba(var(--ember-rgb),0.3)]" : "bg-[var(--obsidian)] text-[var(--metal-muted)] border-[var(--obsidian-border)]"}`}>
                {alarmEnabled ? "ON" : "OFF"}
              </button>
            </div>
          </div>
          <div className="border-t border-[var(--obsidian-border)]" />
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm text-[var(--metal-bright)] font-light">Is it repetitive? (optional)</label>
              <button onClick={() => setIsRepetitive(!isRepetitive)}
                className={`px-6 py-2 rounded-full border transition-all duration-300 ${isRepetitive ? "bg-[var(--ember)] text-[var(--obsidian)] border-[var(--ember)] shadow-[0_0_12px_rgba(var(--ember-rgb),0.3)]" : "bg-[var(--obsidian)] text-[var(--metal-muted)] border-[var(--obsidian-border)]"}`}>
                {isRepetitive ? "ON" : "OFF"}
              </button>
            </div>
            {isRepetitive && (
              <div className="flex gap-2 flex-wrap mt-4">
                {days.map((day) => (
                  <button key={day} onClick={() => toggleDay(day)}
                    className={`px-4 py-2 rounded-lg border text-sm transition-all duration-300 ${selectedDays.includes(day) ? "bg-[var(--ember)] text-[var(--obsidian)] border-[var(--ember)] shadow-[0_0_8px_rgba(var(--ember-rgb),0.2)]" : "bg-[var(--obsidian)] text-[var(--metal-muted)] border-[var(--obsidian-border)] hover:border-[var(--ember)]"}`}>
                    {day}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="fixed bottom-8 right-6 flex flex-col gap-3 z-30">
        <button onClick={onCancel} className="w-14 h-14 rounded-full bg-[var(--obsidian-2)] text-[var(--metal-muted)] flex items-center justify-center shadow-lg hover:bg-[var(--obsidian-border)] active:scale-95 transition-all animate-fade-in-up stagger-1">
          <X className="w-6 h-6" />
        </button>
        <button onClick={handleSave} className="w-16 h-16 rounded-full bg-[var(--ember)] text-[var(--obsidian)] flex items-center justify-center shadow-lg hover:brightness-110 active:scale-95 transition-all shadow-[0_4px_25px_rgba(var(--ember-rgb),0.4)] animate-fade-in-up stagger-2">
          <Check className="w-7 h-7" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  )
}
