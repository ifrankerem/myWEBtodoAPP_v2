"use client"

import { Menu, ChevronLeft, ChevronRight, Bell, Repeat } from "lucide-react"
import { useState } from "react"
import type { Task } from "@/app/page"

interface CalendarScreenProps {
  tasks: Task[]
  onOpenDrawer: () => void
}

// Day name to index mapping
const dayNameToIndex: Record<string, number> = {
  'Sun': 0,
  'Mon': 1,
  'Tue': 2,
  'Wed': 3,
  'Thu': 4,
  'Fri': 5,
  'Sat': 6,
}

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
]

export default function CalendarScreen({ tasks, onOpenDrawer }: CalendarScreenProps) {
  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const today = new Date()
  
  const [currentMonth, setCurrentMonth] = useState(today.getMonth())
  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [selectedDate, setSelectedDate] = useState(today.getDate())

  const year = currentYear
  const month = currentMonth
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const days = Array.from({ length: 42 }, (_, i) => {
    const dayNum = i - firstDay + 1
    if (dayNum > 0 && dayNum <= daysInMonth) return dayNum
    return null
  })

  const goToPreviousMonth = () => {
    if (month === 0) {
      setCurrentMonth(11)
      setCurrentYear(year - 1)
    } else {
      setCurrentMonth(month - 1)
    }
    setSelectedDate(1)
  }

  const goToNextMonth = () => {
    if (month === 11) {
      setCurrentMonth(0)
      setCurrentYear(year + 1)
    } else {
      setCurrentMonth(month + 1)
    }
    setSelectedDate(1)
  }

  // Get tasks for a specific day in the current month
  const getTasksForDay = (day: number) => {
    const dateToCheck = new Date(year, month, day)
    const dayOfWeek = dateToCheck.getDay()
    const dayName = daysOfWeek[dayOfWeek]

    return tasks
      .filter((t) => !t.completed)
      .filter((t) => {
        // Check if task has a due date on this day
        if (t.dueDate) {
          const dueDate = new Date(t.dueDate)
          if (
            dueDate.getDate() === day &&
            dueDate.getMonth() === month &&
            dueDate.getFullYear() === year
          ) {
            return true
          }
        }

        // Check if task repeats on this day of week
        if (t.repeats) {
          const repeatDays = t.repeats.split(',').map(d => d.trim())
          if (repeatDays.includes(dayName)) {
            return true
          }
        }

        // Check if task has alarm (show on today only if no specific date)
        if (t.alarm && !t.dueDate && !t.repeats) {
          const isToday = 
            day === today.getDate() && 
            month === today.getMonth() && 
            year === today.getFullYear()
          if (isToday) {
            return true
          }
        }

        return false
      })
      .map((t) => ({
        ...t,
        hasAlarm: !!t.alarm,
        hasRepeat: !!t.repeats,
        isDueDate: !!t.dueDate && new Date(t.dueDate).getDate() === day,
      }))
  }

  const isToday = (day: number) => {
    return (
      day === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear()
    )
  }

  const selectedDateTasks = getTasksForDay(selectedDate)

  // Check which days have any tasks
  const daysWithTasks = new Set<number>()
  for (let d = 1; d <= daysInMonth; d++) {
    if (getTasksForDay(d).length > 0) {
      daysWithTasks.add(d)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-6 pb-4">
        <button onClick={onOpenDrawer} className="p-2 hover:bg-[#1a1a1a] rounded-lg transition-colors">
          <Menu className="w-6 h-6 text-[#888]" />
        </button>
        <h1 className="text-sm font-medium tracking-[0.2em] text-[#888]">CALENDAR</h1>
        <div className="w-10" />
      </div>

      {/* Calendar Container */}
      <div className="flex-1 p-6">
        <div className="max-w-md mx-auto border border-[#2a2a2a] rounded-2xl p-6 bg-[#0f0f0f]">
          {/* Month/Year with Navigation */}
          <div className="flex items-center justify-between mb-6">
            <button 
              onClick={goToPreviousMonth}
              className="p-2 hover:bg-[#1a1a1a] rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-[#888]" />
            </button>
            <h2 className="text-xl font-light tracking-wide">
              {monthNames[month]} {year}
            </h2>
            <button 
              onClick={goToNextMonth}
              className="p-2 hover:bg-[#1a1a1a] rounded-lg transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-[#888]" />
            </button>
          </div>

          {/* Day Headers */}
          <div className="grid grid-cols-7 gap-2 mb-2">
            {daysOfWeek.map((day) => (
              <div key={day} className="text-center text-xs text-[#888] font-medium">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-2 mb-8">
            {days.map((day, i) => {
              const hasTask = day && daysWithTasks.has(day)
              const isTodayDate = day && isToday(day)
              const isSelected = day === selectedDate

              return (
                <button
                  key={i}
                  disabled={!day}
                  onClick={() => day && setSelectedDate(day)}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center text-sm relative transition-all ${
                    !day
                      ? "bg-transparent text-transparent cursor-default"
                      : isTodayDate && isSelected
                        ? "bg-[#1a1a1a] border-2 border-[#00ff88] text-white shadow-[0_0_10px_rgba(0,255,136,0.3)]"
                        : isSelected
                          ? "bg-[#252525] border-2 border-[#00ccff] text-white shadow-[0_0_10px_rgba(0,204,255,0.3)]"
                          : isTodayDate
                            ? "bg-[#1a1a1a] border border-[#00ff88] text-[#ddd] hover:border-[#00ff88] hover:shadow-[0_0_8px_rgba(0,255,136,0.2)]"
                            : "bg-[#1a1a1a] border border-[#2a2a2a] text-[#ddd] hover:border-[#444] cursor-pointer"
                  }`}
                >
                  <span>{day}</span>
                  {hasTask && !isSelected && <div className="absolute bottom-1 w-1 h-1 rounded-full bg-white" />}
                  {isTodayDate && isSelected && (
                    <div className="absolute bottom-1.5 w-1.5 h-1.5 rounded-full bg-[#00ff88]" />
                  )}
                </button>
              )
            })}
          </div>

          {/* Selected Day Tasks */}
          <div className="border-t border-[#2a2a2a] pt-6">
            <h3 className="text-sm text-[#888] mb-4 tracking-wide">
              {isToday(selectedDate) ? "Today's Tasks" : `Tasks for ${monthNames[month]} ${selectedDate}, ${year}`}
            </h3>
            <div className="space-y-3">
              {selectedDateTasks.length > 0 ? (
                selectedDateTasks.map((task, i) => (
                  <div key={task.id} className="flex items-center gap-2 text-sm text-[#ddd]">
                    <span className="text-[#888]">{i + 1}.</span>
                    <span className="flex-1 truncate">{task.title || task.name}</span>
                    <div className="flex items-center gap-1">
                      {task.hasAlarm && (
                        <div className="flex items-center gap-1 text-xs text-[#ffa500]">
                          <Bell className="w-3 h-3" />
                          <span>{task.alarm}</span>
                        </div>
                      )}
                      {task.hasRepeat && (
                        <div className="flex items-center text-xs text-[#00ccff]">
                          <Repeat className="w-3 h-3" />
                        </div>
                      )}
                      {task.isDueDate && (
                        <span className="text-xs text-[#ff6b6b] bg-[#ff6b6b1a] px-1.5 py-0.5 rounded">Due</span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-[#666] italic">No tasks scheduled</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
