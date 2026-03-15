"use client"

import { Menu, ArrowLeft, CheckCircle, Pencil, X, Save, Trash2, Check, ImageIcon } from "lucide-react"
import type React from "react"
import { useState } from "react"
import type { Task } from "@/app/page"

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
        setEditPhoto(reader.result as string)
        setPhotoRemoved(false)
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

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
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
      onUpdateTask(task.id, {
        title: editTitle,
        name: editTitle,
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
    <div className="h-screen flex flex-col bg-transparent relative">
      {/* Header */}
      <div className="flex items-center justify-between p-6 pb-4 animate-fade-in">
        <button onClick={onOpenDrawer} className="p-2 hover:bg-[var(--obsidian-2)] rounded-lg transition-colors">
          <Menu className="w-6 h-6 text-[var(--metal-muted)]" />
        </button>
        <h1 
          className="text-sm font-bold tracking-[0.2em] text-[var(--metal-muted)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {isEditing ? "EDIT TASK" : "TASK DETAILS"}
        </h1>
        <button onClick={onBack} className="p-2 hover:bg-[var(--obsidian-2)] rounded-lg transition-colors">
          <ArrowLeft className="w-6 h-6 text-[var(--metal-muted)]" />
        </button>
      </div>

      {/* Task Detail Container */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-md mx-auto border border-[var(--obsidian-border)] rounded-2xl overflow-hidden bg-[var(--obsidian-1)] animate-scale-in stagger-1">
          {/* Photo if exists */}
          {task.photo && (
            <div 
              className="w-full aspect-[4/3] overflow-hidden cursor-pointer group"
              onClick={() => !isEditing && setLightboxOpen(true)}
            >
              <img 
                src={task.photo || "/placeholder.svg"} 
                alt={task.name} 
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" 
              />
            </div>
          )}

          <div className="p-6 space-y-6">
            {isEditing ? (
              /* Edit Mode */
              <>
                {/* Photo */}
                <div>
                  <label className="block text-xs text-[var(--metal-muted)] mb-2 tracking-wider" style={{ fontFamily: 'var(--font-display)' }}>PHOTO</label>
                  {editPhoto ? (
                    <div className="relative">
                      <img 
                        src={editPhoto} 
                        alt="Task photo" 
                        className="w-full aspect-video rounded-lg object-cover"
                      />
                      <div className="absolute bottom-2 right-2 flex gap-2">
                        <label className="p-2 bg-black/70 rounded-full cursor-pointer hover:bg-black/90">
                          <ImageIcon className="w-4 h-4 text-white" />
                          <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                        </label>
                        <button
                          onClick={handleRemovePhoto}
                          className="p-2 bg-[var(--forge-red)]/80 rounded-full hover:bg-[var(--forge-red)]"
                        >
                          <X className="w-4 h-4 text-white" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 px-4 py-6 bg-[var(--obsidian)] border border-[var(--obsidian-border)] border-dashed rounded-lg text-[var(--metal-muted)] hover:border-[var(--ember)] transition-all duration-300 cursor-pointer">
                      <ImageIcon className="w-5 h-5" />
                      <span>Add Photo</span>
                      <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                    </label>
                  )}
                </div>

                {/* Title */}
                <div>
                  <label className="block text-xs text-[var(--metal-muted)] mb-2 tracking-wider" style={{ fontFamily: 'var(--font-display)' }}>TITLE</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-4 py-3 bg-[var(--obsidian)] border border-[var(--obsidian-border)] rounded-lg text-[var(--metal-bright)] placeholder:text-[var(--metal-muted)] focus:border-[var(--ember)] focus:shadow-[0_0_10px_rgba(var(--ember-rgb),0.15)] focus:outline-none transition-all duration-300"
                  />
                </div>

                {/* Detail */}
                <div>
                  <label className="block text-xs text-[var(--metal-muted)] mb-2 tracking-wider" style={{ fontFamily: 'var(--font-display)' }}>DETAILS</label>
                  <textarea
                    value={editDetail}
                    onChange={(e) => setEditDetail(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 bg-[var(--obsidian)] border border-[var(--obsidian-border)] rounded-lg text-[var(--metal-bright)] placeholder:text-[var(--metal-muted)] focus:border-[var(--ember)] focus:shadow-[0_0_10px_rgba(var(--ember-rgb),0.15)] focus:outline-none transition-all duration-300 resize-none"
                  />
                </div>

                {/* Due Date */}
                <div>
                  <label className="block text-xs text-[var(--metal-muted)] mb-2 tracking-wider" style={{ fontFamily: 'var(--font-display)' }}>DUE DATE</label>
                  <input
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="w-full px-4 py-3 bg-[var(--obsidian)] border border-[var(--obsidian-border)] rounded-lg text-[var(--metal-bright)] focus:border-[var(--ember)] focus:shadow-[0_0_10px_rgba(var(--ember-rgb),0.15)] focus:outline-none transition-all duration-300 [color-scheme:dark]"
                  />
                </div>

                {/* Alarm */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-[var(--metal-muted)] tracking-wider" style={{ fontFamily: 'var(--font-display)' }}>ALARM</label>
                    <button
                      onClick={() => setEditAlarmEnabled(!editAlarmEnabled)}
                      className={`px-4 py-1 rounded-full text-xs border transition-all duration-300 ${
                        editAlarmEnabled 
                          ? "bg-[var(--ember)] text-[var(--obsidian)] border-[var(--ember)] shadow-[0_0_8px_rgba(var(--ember-rgb),0.3)]" 
                          : "bg-[var(--obsidian)] text-[var(--metal-muted)] border-[var(--obsidian-border)]"
                      }`}
                    >
                      {editAlarmEnabled ? "ON" : "OFF"}
                    </button>
                  </div>
                  {editAlarmEnabled && (
                    <input
                      type="time"
                      value={editAlarm}
                      onChange={(e) => setEditAlarm(e.target.value)}
                      className="w-full px-4 py-3 bg-[var(--obsidian)] border border-[var(--obsidian-border)] rounded-lg text-[var(--metal-bright)] focus:border-[var(--ember)] focus:shadow-[0_0_10px_rgba(var(--ember-rgb),0.15)] focus:outline-none transition-all duration-300 [color-scheme:dark]"
                    />
                  )}
                </div>

                {/* Repeat Days */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-[var(--metal-muted)] tracking-wider" style={{ fontFamily: 'var(--font-display)' }}>REPEAT</label>
                    <button
                      onClick={() => setEditIsRepetitive(!editIsRepetitive)}
                      className={`px-4 py-1 rounded-full text-xs border transition-all duration-300 ${
                        editIsRepetitive 
                          ? "bg-[var(--ember)] text-[var(--obsidian)] border-[var(--ember)] shadow-[0_0_8px_rgba(var(--ember-rgb),0.3)]" 
                          : "bg-[var(--obsidian)] text-[var(--metal-muted)] border-[var(--obsidian-border)]"
                      }`}
                    >
                      {editIsRepetitive ? "ON" : "OFF"}
                    </button>
                  </div>
                  {editIsRepetitive && (
                    <div className="flex gap-2 flex-wrap">
                      {days.map((day) => (
                        <button
                          key={day}
                          onClick={() => toggleDay(day)}
                          className={`px-3 py-2 rounded-lg border text-xs transition-all duration-300 ${
                            editRepeats.includes(day)
                              ? "bg-[var(--ember)] text-[var(--obsidian)] border-[var(--ember)] shadow-[0_0_8px_rgba(var(--ember-rgb),0.2)]"
                              : "bg-[var(--obsidian)] text-[var(--metal-muted)] border-[var(--obsidian-border)] hover:border-[var(--ember)]"
                          }`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* View Mode */
              <>
                {/* Title */}
                <div>
                  <h2 
                    className="text-xl text-[var(--metal-bright)]"
                    style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
                  >
                    {task.title || task.name}
                  </h2>
                </div>

                {/* Detail Section */}
                {task.detail && (
                  <div>
                    <h3 
                      className="text-xs text-[var(--metal-muted)] mb-3 tracking-wider"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      DETAIL
                    </h3>
                    <p className="text-sm text-[var(--metal-bright)] leading-relaxed font-light">{task.detail}</p>
                  </div>
                )}

                <div className="border-t border-[var(--obsidian-border)] pt-6">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[var(--metal-muted)] font-light">Status:</span>
                    <button
                      onClick={handleToggleComplete}
                      className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all duration-300 ${
                        isAnimating ? "scale-95" : "scale-100"
                      } ${
                        localCompleted
                          ? "bg-[var(--forge-green)]/15 text-[var(--forge-green)] border border-[var(--forge-green)]/30 hover:bg-[var(--forge-green)]/25 active:scale-90 shadow-[0_0_10px_rgba(var(--forge-green-rgb),0.15)]"
                          : "bg-[var(--obsidian-2)] text-[var(--metal-muted)] border border-[var(--obsidian-border)] hover:bg-[var(--obsidian-border)] active:scale-90"
                      }`}
                    >
                      <CheckCircle
                        className={`w-4 h-4 transition-transform duration-300 ${
                          isAnimating ? "rotate-180 scale-110" : "rotate-0"
                        }`}
                      />
                      <span className="text-xs font-medium tracking-wider">
                        {localCompleted ? "COMPLETED" : "INCOMPLETE"}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Metadata */}
                <div className="border-t border-[var(--obsidian-border)] pt-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[var(--metal-muted)] font-light">Created Date:</span>
                    <span className="text-sm text-[var(--metal-bright)]">{formatDate(task.createdDate)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[var(--metal-muted)] font-light">Last Edited Date:</span>
                    <span className="text-sm text-[var(--metal-bright)]">{formatDate(task.lastEditedDate)}</span>
                  </div>
                  {task.dueDate && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-[var(--metal-muted)] font-light">Due Date:</span>
                      <span className="text-sm text-[var(--metal-bright)]">
                        {new Date(task.dueDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  )}
                  {task.alarm && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-[var(--metal-muted)] font-light">Alarm:</span>
                      <span className="text-sm text-[var(--forge-orange)]">{task.alarm}</span>
                    </div>
                  )}
                  {task.repeats && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-[var(--metal-muted)] font-light">Repeats:</span>
                      <span className="text-sm text-[var(--ember)]">{task.repeats}</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-8 right-6 flex flex-col gap-3 z-30">
        {isEditing ? (
          <>
            {/* Cancel Edit Button */}
            <button
              onClick={handleCancelEdit}
              className="w-14 h-14 rounded-full bg-[var(--obsidian-2)] text-[var(--metal-muted)] flex items-center justify-center shadow-lg hover:bg-[var(--obsidian-border)] active:scale-95 transition-all"
            >
              <X className="w-6 h-6" />
            </button>
            
            {/* Save Button - Primary */}
            <button
              onClick={handleSaveEdit}
              className="w-16 h-16 rounded-full bg-[var(--ember)] text-[var(--obsidian)] flex items-center justify-center shadow-lg hover:brightness-110 active:scale-95 transition-all shadow-[0_4px_25px_rgba(var(--ember-rgb),0.4)]"
            >
              <Check className="w-7 h-7" strokeWidth={2.5} />
            </button>
          </>
        ) : (
          <>
            {/* Delete Button */}
            <button
              onClick={() => {
                if (onDeleteTask) {
                  onDeleteTask(task.id);
                  onBack();
                }
              }}
              className="w-14 h-14 rounded-full bg-[var(--forge-red)] text-white flex items-center justify-center shadow-lg hover:brightness-110 active:scale-95 transition-all shadow-[0_4px_20px_rgba(var(--forge-red-rgb),0.4)] animate-fade-in-up stagger-1"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            
            {/* Edit Button - Primary */}
            <button
              onClick={() => setIsEditing(true)}
              className="w-16 h-16 rounded-full bg-[var(--ember)] text-[var(--obsidian)] flex items-center justify-center shadow-lg hover:brightness-110 active:scale-95 transition-all shadow-[0_4px_25px_rgba(var(--ember-rgb),0.4)] animate-fade-in-up stagger-2"
            >
              <Pencil className="w-6 h-6" />
            </button>
          </>
        )}
      </div>
      {/* Photo Lightbox */}
      {lightboxOpen && task.photo && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fade-in"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-6 right-6 w-12 h-12 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 active:scale-95 transition-all z-10"
          >
            <X className="w-6 h-6" />
          </button>
          <img 
            src={task.photo} 
            alt={task.name} 
            className="max-w-[95vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
