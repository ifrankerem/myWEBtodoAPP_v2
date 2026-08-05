"use client"

import type React from "react"
import { useState } from "react"
import { Check, ImageIcon, X } from "lucide-react"
import type { Task } from "@/app/page"
import { compressImage } from "@/lib/storage-idb"
import { XpHeader, XpStatusBar } from "@/components/xp-ui"

interface AddTaskScreenProps {
  onSave: (task: Omit<Task, "id" | "createdDate" | "lastEditedDate">, photoFile?: File) => void
  onCancel: () => void
  onOpenDrawer: () => void
  initialDueDate?: string
}

export default function AddTaskScreen({ onSave, onCancel, onOpenDrawer, initialDueDate }: AddTaskScreenProps) {
  const [title, setTitle] = useState("")
  const [detail, setDetail] = useState("")
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [alarmEnabled, setAlarmEnabled] = useState(false)
  const [alarmTime, setAlarmTime] = useState("12:00")
  const [isRepetitive, setIsRepetitive] = useState(false)
  const [selectedDays, setSelectedDays] = useState<string[]>([])
  const [dueDate, setDueDate] = useState(initialDueDate || "")
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

  const toggleDay = (day: string) => {
    setSelectedDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day])
  }

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onloadend = () => {
      const raw = reader.result as string
      compressImage(raw).then(setPhotoPreview).catch(() => setPhotoPreview(raw))
    }
    reader.readAsDataURL(file)
  }

  const handleSave = () => {
    const normalizedTitle = title.trim() || "Untitled Task"
    const task: Omit<Task, "id" | "createdDate" | "lastEditedDate"> = {
      name: normalizedTitle,
      title: normalizedTitle,
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
    <section className="xp-screen" aria-label="Add Task">
      <XpHeader title="New Task" onOpenDrawer={onOpenDrawer} onBack={onCancel} />

      <main className="xp-content">
        <div className="xp-property-sheet">
          <section className="xp-groupbox">
            <span className="xp-groupbox-title">General</span>
            <div className="xp-form-grid">
              <div className="xp-field">
                <label htmlFor="task-title">Title</label>
                <input id="task-title" type="text" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Enter task title" autoFocus />
              </div>
              <div className="xp-field">
                <label htmlFor="task-details">Details (optional)</label>
                <textarea id="task-details" value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="Enter task details" rows={5} />
              </div>
              <div className="xp-field">
                <label htmlFor="task-due-date">Due date (optional)</label>
                <input id="task-due-date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </div>
            </div>
          </section>

          <section className="xp-groupbox">
            <span className="xp-groupbox-title">Picture</span>
            <div className="xp-photo-row">
              <label className="xp-button xp-file-button">
                <ImageIcon /> Browse...
                <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              </label>
              <div className="xp-photo-preview">
                {photoPreview ? <img src={photoPreview} alt="Task preview" /> : <ImageIcon aria-label="No picture selected" />}
              </div>
              {photoPreview && (
                <button type="button" className="xp-button xp-button-danger" onClick={() => { setPhotoFile(null); setPhotoPreview(null) }}>
                  <X /> Remove
                </button>
              )}
            </div>
          </section>

          <section className="xp-groupbox">
            <span className="xp-groupbox-title">Reminder</span>
            <div className="xp-form-grid">
              <div className="xp-option-row">
                <label className="xp-checkbox-label">
                  <input type="checkbox" checked={alarmEnabled} onChange={(event) => setAlarmEnabled(event.target.checked)} />
                  Enable alarm
                </label>
                <input aria-label="Alarm time" type="time" value={alarmTime} onChange={(event) => setAlarmTime(event.target.value)} disabled={!alarmEnabled} />
              </div>
              <label className="xp-checkbox-label">
                <input type="checkbox" checked={isRepetitive} onChange={(event) => setIsRepetitive(event.target.checked)} />
                Repeat on selected days
              </label>
              {isRepetitive && (
                <div className="xp-day-picker" aria-label="Repeat days">
                  {days.map((day) => (
                    <button key={day} type="button" className="xp-button" aria-pressed={selectedDays.includes(day)} onClick={() => toggleDay(day)}>{day}</button>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      <div className="xp-actionbar">
        <button type="button" className="xp-button" onClick={onCancel}><X /> Cancel</button>
        <button type="button" className="xp-button xp-primary-button" onClick={handleSave}><Check /> Save Task</button>
      </div>
      <XpStatusBar><span className="flex-1">Ready</span><span>{photoPreview ? "1 picture selected" : "No picture"}</span></XpStatusBar>
    </section>
  )
}
