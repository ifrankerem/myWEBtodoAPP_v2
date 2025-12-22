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
  const [isEditing, setIsEditing] = useState(false)
  
  // Edit form state
  const [editTitle, setEditTitle] = useState(task.title || task.name)
  const [editDetail, setEditDetail] = useState(task.detail || "")
  const [editDueDate, setEditDueDate] = useState(task.dueDate || "")
  const [editAlarm, setEditAlarm] = useState(task.alarm || "")
  const [editAlarmEnabled, setEditAlarmEnabled] = useState(!!task.alarm)
  const [editRepeats, setEditRepeats] = useState(task.repeats?.split(", ") || [])
  const [editIsRepetitive, setEditIsRepetitive] = useState(!!task.repeats)
  const [editPhoto, setEditPhoto] = useState<string | undefined>(task.photo)
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
        photo: photoRemoved ? undefined : editPhoto,
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
    setEditPhoto(task.photo)
    setPhotoRemoved(false)
    setIsEditing(false)
  }

  return (
    <div className="h-screen flex flex-col bg-[#0B0B0B] relative">
      {/* Header */}
      <div className="flex items-center justify-between p-6 pb-4">
        <button onClick={onOpenDrawer} className="p-2 hover:bg-[#1a1a1a] rounded-lg transition-colors">
          <Menu className="w-6 h-6 text-[#888]" />
        </button>
        <h1 className="text-sm font-medium tracking-[0.2em] text-[#888]">
          {isEditing ? "EDIT TASK" : "TASK DETAILS"}
        </h1>
        <button onClick={onBack} className="p-2 hover:bg-[#1a1a1a] rounded-lg transition-colors">
          <ArrowLeft className="w-6 h-6 text-[#888]" />
        </button>
      </div>

      {/* Task Detail Container */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-md mx-auto border border-[#2a2a2a] rounded-2xl overflow-hidden bg-[#0f0f0f]">
          {/* Photo if exists */}
          {task.photo && (
            <div className="w-full aspect-[4/3] overflow-hidden">
              <img src={task.photo || "/placeholder.svg"} alt={task.name} className="w-full h-full object-cover" />
            </div>
          )}

          <div className="p-6 space-y-6">
            {isEditing ? (
              /* Edit Mode */
              <>
                {/* Photo */}
                <div>
                  <label className="block text-xs text-[#888] mb-2 tracking-wider">PHOTO</label>
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
                          className="p-2 bg-[#ff3b30]/80 rounded-full hover:bg-[#ff3b30]"
                        >
                          <X className="w-4 h-4 text-white" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 px-4 py-6 bg-[#1a1a1a] border border-[#333] border-dashed rounded-lg text-[#888] hover:border-[#555] transition-colors cursor-pointer">
                      <ImageIcon className="w-5 h-5" />
                      <span>Add Photo</span>
                      <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                    </label>
                  )}
                </div>

                {/* Title */}
                <div>
                  <label className="block text-xs text-[#888] mb-2 tracking-wider">TITLE</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-4 py-3 bg-[#1a1a1a] border border-[#333] rounded-lg text-white placeholder:text-[#666] focus:border-[#555] focus:outline-none"
                  />
                </div>

                {/* Detail */}
                <div>
                  <label className="block text-xs text-[#888] mb-2 tracking-wider">DETAILS</label>
                  <textarea
                    value={editDetail}
                    onChange={(e) => setEditDetail(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 bg-[#1a1a1a] border border-[#333] rounded-lg text-white placeholder:text-[#666] focus:border-[#555] focus:outline-none resize-none"
                  />
                </div>

                {/* Due Date */}
                <div>
                  <label className="block text-xs text-[#888] mb-2 tracking-wider">DUE DATE</label>
                  <input
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="w-full px-4 py-3 bg-[#1a1a1a] border border-[#333] rounded-lg text-white focus:border-[#555] focus:outline-none [color-scheme:dark]"
                  />
                </div>

                {/* Alarm */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-[#888] tracking-wider">ALARM</label>
                    <button
                      onClick={() => setEditAlarmEnabled(!editAlarmEnabled)}
                      className={`px-4 py-1 rounded-full text-xs border transition-all ${
                        editAlarmEnabled ? "bg-white text-black border-white" : "bg-[#1a1a1a] text-[#888] border-[#333]"
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
                      className="w-full px-4 py-3 bg-[#1a1a1a] border border-[#333] rounded-lg text-white focus:border-[#555] focus:outline-none [color-scheme:dark]"
                    />
                  )}
                </div>

                {/* Repeat Days */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-[#888] tracking-wider">REPEAT</label>
                    <button
                      onClick={() => setEditIsRepetitive(!editIsRepetitive)}
                      className={`px-4 py-1 rounded-full text-xs border transition-all ${
                        editIsRepetitive ? "bg-white text-black border-white" : "bg-[#1a1a1a] text-[#888] border-[#333]"
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
                          className={`px-3 py-2 rounded-lg border text-xs transition-all ${
                            editRepeats.includes(day)
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
              </>
            ) : (
              /* View Mode */
              <>
                {/* Title */}
                <div>
                  <h2 className="text-xl font-medium text-white">{task.title || task.name}</h2>
                </div>

                {/* Detail Section */}
                {task.detail && (
                  <div>
                    <h3 className="text-xs text-[#888] mb-3 tracking-wider">DETAIL</h3>
                    <p className="text-sm text-[#ddd] leading-relaxed">{task.detail}</p>
                  </div>
                )}

                <div className="border-t border-[#2a2a2a] pt-6">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[#888]">Status:</span>
                    <button
                      onClick={handleToggleComplete}
                      className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all duration-300 ${
                        isAnimating ? "scale-95" : "scale-100"
                      } ${
                        localCompleted
                          ? "bg-[#34c759]/20 text-[#34c759] border border-[#34c759]/30 hover:bg-[#34c759]/30 active:scale-90"
                          : "bg-[#1f1f1f] text-[#888] border border-[#333] hover:bg-[#2a2a2a] hover:border-[#444] active:scale-90"
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
                <div className="border-t border-[#2a2a2a] pt-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[#888]">Created Date:</span>
                    <span className="text-sm text-white">{formatDate(task.createdDate)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[#888]">Last Edited Date:</span>
                    <span className="text-sm text-white">{formatDate(task.lastEditedDate)}</span>
                  </div>
                  {task.dueDate && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-[#888]">Due Date:</span>
                      <span className="text-sm text-white">
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
                      <span className="text-sm text-[#888]">Alarm:</span>
                      <span className="text-sm text-white">{task.alarm}</span>
                    </div>
                  )}
                  {task.repeats && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-[#888]">Repeats:</span>
                      <span className="text-sm text-white">{task.repeats}</span>
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
              className="w-14 h-14 rounded-full bg-[#2a2a2a] text-[#888] flex items-center justify-center shadow-lg hover:bg-[#333] active:scale-95 transition-all"
            >
              <X className="w-6 h-6" />
            </button>
            
            {/* Save Button - Primary */}
            <button
              onClick={handleSaveEdit}
              className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center shadow-lg hover:bg-gray-100 active:scale-95 transition-all shadow-[0_4px_20px_rgba(255,255,255,0.3)]"
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
              className="w-14 h-14 rounded-full bg-[#ff3b30] text-white flex items-center justify-center shadow-lg hover:bg-[#ff453a] active:scale-95 transition-all shadow-[0_4px_20px_rgba(255,59,48,0.4)]"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            
            {/* Edit Button - Primary */}
            <button
              onClick={() => setIsEditing(true)}
              className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center shadow-lg hover:bg-gray-100 active:scale-95 transition-all shadow-[0_4px_20px_rgba(255,255,255,0.3)]"
            >
              <Pencil className="w-6 h-6" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
