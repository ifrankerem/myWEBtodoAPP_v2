"use client"

import { CheckCircle, Pencil, X, Trash2, Check, ImageIcon } from "lucide-react"
import type React from "react"
import { useState } from "react"
import type { Task } from "@/app/page"
import { compressImage } from "@/lib/storage-idb"
import { XpHeader, XpStatusBar } from "@/components/xp-ui"
import { parseTaskDate } from "@/lib/task-dates"

interface TaskDetailScreenProps {
  task: Task
  onBack: () => void
  onOpenDrawer: () => void
  onToggleComplete: (taskId: string) => void
  onUpdateTask?: (taskId: string, updates: Partial<Task>) => void
  onDeleteTask?: (taskId: string) => void
}

export default function TaskDetailScreen({ 
  task, 
  onBack, 
  onOpenDrawer, 
  onToggleComplete,
  onUpdateTask,
  onDeleteTask
}: TaskDetailScreenProps) {
  const [isAnimating, setIsAnimating] = useState(false)
  const [localCompleted, setLocalCompleted] = useState(task.completed)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  
  // Edit form state
  const [editTitle, setEditTitle] = useState(task.title || task.name)
  const [editDetail, setEditDetail] = useState(task.detail || "")
  const [editDueDate, setEditDueDate] = useState(task.dueDate || "")
  const [editAlarm, setEditAlarm] = useState(task.alarm || "")
  const [editAlarmEnabled, setEditAlarmEnabled] = useState(!!task.alarm)
  const [editRepeats, setEditRepeats] = useState(task.repeats?.split(", ") || [])
  const [editIsRepetitive, setEditIsRepetitive] = useState(!!task.repeats)
  const [editPhoto, setEditPhoto] = useState<string | undefined>(task.photo || undefined)
  const [photoRemoved, setPhotoRemoved] = useState(false)

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  const toggleDay = (day: string) => {
    setEditRepeats(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    )
  }

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        const raw = reader.result as string
        compressImage(raw).then((compressed) => {
          setEditPhoto(compressed)
          setPhotoRemoved(false)
        }).catch(() => {
          setEditPhoto(raw)
          setPhotoRemoved(false)
        })
      }
      reader.readAsDataURL(file)
    }
  }

  const handleRemovePhoto = () => {
    setEditPhoto(undefined)
    setPhotoRemoved(true)
  }

  const handleToggleComplete = () => {
    setIsAnimating(true)
    setLocalCompleted(!localCompleted)

    const audioWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext }
    const AudioContextConstructor = window.AudioContext || audioWindow.webkitAudioContext
    if (!AudioContextConstructor) {
      onToggleComplete(task.id)
      setIsAnimating(false)
      return
    }
    const audioContext = new AudioContextConstructor()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    if (localCompleted) {
      oscillator.frequency.value = 300
      oscillator.type = "sine"
      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15)
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.15)
    } else {
      oscillator.frequency.value = 800
      oscillator.type = "sine"
      gainNode.gain.setValueAtTime(0.25, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1)
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.1)

      const oscillator2 = audioContext.createOscillator()
      const gainNode2 = audioContext.createGain()
      oscillator2.connect(gainNode2)
      gainNode2.connect(audioContext.destination)
      oscillator2.frequency.value = 1000
      oscillator2.type = "sine"
      gainNode2.gain.setValueAtTime(0.2, audioContext.currentTime + 0.1)
      gainNode2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2)
      oscillator2.start(audioContext.currentTime + 0.1)
      oscillator2.stop(audioContext.currentTime + 0.2)
    }

    onToggleComplete(task.id)

    setTimeout(() => {
      setIsAnimating(false)
    }, 300)
  }

  const handleSaveEdit = () => {
    if (onUpdateTask) {
      const normalizedTitle = editTitle.trim() || "Untitled Task"
      onUpdateTask(task.id, {
        title: normalizedTitle,
        name: normalizedTitle,
        detail: editDetail || undefined,
        dueDate: editDueDate || undefined,
        alarm: editAlarmEnabled && editAlarm ? editAlarm : undefined,
        repeats: editIsRepetitive && editRepeats.length > 0 ? editRepeats.join(", ") : undefined,
        photo: photoRemoved ? null : editPhoto,
        type: editPhoto ? "picture" : "text",
      })
    }
    setIsEditing(false)
  }

  const handleCancelEdit = () => {
    // Reset to original values
    setEditTitle(task.title || task.name)
    setEditDetail(task.detail || "")
    setEditDueDate(task.dueDate || "")
    setEditAlarm(task.alarm || "")
    setEditAlarmEnabled(!!task.alarm)
    setEditRepeats(task.repeats?.split(", ") || [])
    setEditIsRepetitive(!!task.repeats)
    setEditPhoto(task.photo || undefined)
    setPhotoRemoved(false)
    setIsEditing(false)
  }

  return (
    <section className="xp-screen" aria-label={isEditing ? "Edit Task" : "Task Details"}>
      <XpHeader title={isEditing ? "Edit Task" : "Task Details"} onOpenDrawer={onOpenDrawer} onBack={onBack} />

      <main className="xp-content">
        <div className="xp-property-sheet">
          {isEditing ? (
            <>
              <section className="xp-groupbox">
                <span className="xp-groupbox-title">General</span>
                <div className="xp-form-grid">
                  <div className="xp-field"><label htmlFor="edit-title">Title</label><input id="edit-title" type="text" value={editTitle} onChange={(event) => setEditTitle(event.target.value)} /></div>
                  <div className="xp-field"><label htmlFor="edit-detail">Details</label><textarea id="edit-detail" value={editDetail} onChange={(event) => setEditDetail(event.target.value)} rows={5} /></div>
                  <div className="xp-field"><label htmlFor="edit-due-date">Due date</label><input id="edit-due-date" type="date" value={editDueDate} onChange={(event) => setEditDueDate(event.target.value)} /></div>
                </div>
              </section>

              <section className="xp-groupbox">
                <span className="xp-groupbox-title">Picture</span>
                <div className="xp-photo-row">
                  {editPhoto && <div className="xp-detail-photo"><img src={editPhoto} alt="Task" /></div>}
                  <label className="xp-button xp-file-button"><ImageIcon /> Browse...<input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" /></label>
                  {editPhoto && <button type="button" className="xp-button xp-button-danger" onClick={handleRemovePhoto}><X /> Remove</button>}
                </div>
              </section>

              <section className="xp-groupbox">
                <span className="xp-groupbox-title">Reminder</span>
                <div className="xp-form-grid">
                  <div className="xp-option-row">
                    <label className="xp-checkbox-label"><input type="checkbox" checked={editAlarmEnabled} onChange={(event) => setEditAlarmEnabled(event.target.checked)} /> Enable alarm</label>
                    <input aria-label="Alarm time" type="time" value={editAlarm} onChange={(event) => setEditAlarm(event.target.value)} disabled={!editAlarmEnabled} />
                  </div>
                  <label className="xp-checkbox-label"><input type="checkbox" checked={editIsRepetitive} onChange={(event) => setEditIsRepetitive(event.target.checked)} /> Repeat on selected days</label>
                  {editIsRepetitive && <div className="xp-day-picker">{days.map((day) => <button key={day} type="button" className="xp-button" aria-pressed={editRepeats.includes(day)} onClick={() => toggleDay(day)}>{day}</button>)}</div>}
                </div>
              </section>
            </>
          ) : (
            <>
              <section className="xp-groupbox">
                <span className="xp-groupbox-title">Task</span>
                <div className="xp-detail-layout">
                  {task.photo && <button type="button" className="xp-detail-photo" onClick={() => setLightboxOpen(true)}><img src={task.photo} alt={task.name} /></button>}
                  <div>
                    <h2 className="xp-detail-title">{task.title || task.name}</h2>
                    <p className="xp-detail-copy">{task.detail || "No details were added to this task."}</p>
                  </div>
                </div>
              </section>

              <section className="xp-groupbox">
                <span className="xp-groupbox-title">Status</span>
                <button type="button" className="xp-button" aria-pressed={Boolean(localCompleted)} onClick={handleToggleComplete}>
                  <CheckCircle className={isAnimating ? "rotate-180" : ""} />
                  {localCompleted ? "Completed" : "Incomplete"}
                </button>
              </section>

              <section className="xp-groupbox">
                <span className="xp-groupbox-title">Information</span>
                <dl className="xp-details-list">
                  <div><dt>Created</dt><dd>{formatDate(task.createdDate)}</dd></div>
                  <div><dt>Last edited</dt><dd>{formatDate(task.lastEditedDate)}</dd></div>
                  {task.dueDate && <div><dt>Due date</dt><dd>{parseTaskDate(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</dd></div>}
                  {task.alarm && <div><dt>Alarm</dt><dd>{task.alarm}</dd></div>}
                  {task.repeats && <div><dt>Repeats</dt><dd>{task.repeats}</dd></div>}
                </dl>
              </section>
            </>
          )}
        </div>
      </main>

      <div className="xp-actionbar">
        {isEditing ? (
          <><button type="button" className="xp-button" onClick={handleCancelEdit}><X /> Cancel</button><button type="button" className="xp-button xp-primary-button" onClick={handleSaveEdit}><Check /> Save</button></>
        ) : (
          <><button type="button" className="xp-button xp-button-danger" onClick={() => { if (onDeleteTask) { onDeleteTask(task.id); onBack() } }}><Trash2 /> Delete</button><button type="button" className="xp-button xp-primary-button" onClick={() => setIsEditing(true)}><Pencil /> Edit</button></>
        )}
      </div>
      <XpStatusBar><span className="flex-1">{localCompleted ? "Task completed" : "Ready"}</span><span>{task.type}</span></XpStatusBar>

      {lightboxOpen && task.photo && (
        <div className="xp-modal-backdrop" onClick={() => setLightboxOpen(false)}>
          <div className="xp-dialog" role="dialog" aria-modal="true" aria-label={`${task.title} picture`} onClick={(event) => event.stopPropagation()}>
            <div className="xp-titlebar"><div className="xp-titlebar-caption">{task.title}</div><button type="button" className="xp-dialog-close" onClick={() => setLightboxOpen(false)} aria-label="Close"><X /></button></div>
            <div className="xp-dialog-body"><img src={task.photo} alt={task.name} className="max-w-[90vw] max-h-[76vh] object-contain" /></div>
            <div className="xp-actionbar"><button type="button" className="xp-button" onClick={() => setLightboxOpen(false)}>Close</button></div>
          </div>
        </div>
      )}
    </section>
  )
}
