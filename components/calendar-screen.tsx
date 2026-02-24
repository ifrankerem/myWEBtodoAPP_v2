"use client"

import { Menu, ChevronLeft, ChevronRight, Bell, Repeat, CalendarDays, LayoutGrid, List, ArrowRight } from "lucide-react"
import { useState, useEffect } from "react"
import type { Task } from "@/app/page"

interface CalendarScreenProps {
  tasks: Task[]
  onOpenDrawer: () => void
  onSelectTask?: (task: Task) => void
}

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
]

const monthNamesShort = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"
]

type CalendarView = "grid" | "schedule"

export default function CalendarScreen({ tasks, onOpenDrawer, onSelectTask }: CalendarScreenProps) {
  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const daysOfWeekShort = ["M", "T", "W", "T", "F", "S", "S"]
  const daysOfWeekFull = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  const today = new Date()
  
  const [currentMonth, setCurrentMonth] = useState(today.getMonth())
  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [selectedDate, setSelectedDate] = useState(today.getDate())
  const [view, setView] = useState<CalendarView>("grid")

  // Persist view choice
  useEffect(() => {
    const saved = localStorage.getItem("calendar-view")
    if (saved === "grid" || saved === "schedule") {
      setView(saved)
    }
  }, [])

  const switchView = (v: CalendarView) => {
    setView(v)
    localStorage.setItem("calendar-view", v)
  }

  const year = currentYear
  const month = currentMonth
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const neededCells = firstDay + daysInMonth
  const totalCells = Math.ceil(neededCells / 7) * 7 // 28, 35, or 42

  const days = Array.from({ length: totalCells }, (_, i) => {
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
        if (t.repeats) {
          const repeatDays = t.repeats.split(',').map(d => d.trim())
          if (repeatDays.includes(dayName)) {
            return true
          }
        }
        if (t.alarm && !t.dueDate && !t.repeats) {
          const isToday = 
            day === today.getDate() && 
            month === today.getMonth() && 
            year === today.getFullYear()
          if (isToday) return true
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

  const daysWithTasks = new Set<number>()
  for (let d = 1; d <= daysInMonth; d++) {
    if (getTasksForDay(d).length > 0) {
      daysWithTasks.add(d)
    }
  }

  // Upcoming tasks for the panel below
  const upcomingTasks = tasks
    .filter((t) => !t.completed && t.dueDate)
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())

  const formatDueDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const dueStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const diffDays = Math.round((dueStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays < 0) return "Overdue"
    if (diffDays === 0) return "Today"
    if (diffDays === 1) return "Tomorrow"
    if (diffDays <= 7) return `In ${diffDays} days`
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined })
  }

  const getDueDateColor = (dateStr: string) => {
    const d = new Date(dateStr)
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const dueStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const diffDays = Math.round((dueStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays < 0) return "var(--forge-red)"
    if (diffDays === 0) return "var(--ember)"
    if (diffDays <= 3) return "var(--forge-orange)"
    return "var(--metal-muted)"
  }

  // Build week rows for schedule view
  const getWeekRows = () => {
    const weeks: { days: (number | null)[] }[] = []
    // Start from Monday (ISO style like the screenshot)
    // Find the Monday before or on the 1st
    const firstOfMonth = new Date(year, month, 1)
    const firstDayOfWeek = firstOfMonth.getDay() // 0=Sun
    // Convert to Mon-start: Mon=0, Tue=1, ..., Sun=6
    const mondayOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1

    let currentDay = 1 - mondayOffset
    while (currentDay <= daysInMonth) {
      const week: (number | null)[] = []
      for (let i = 0; i < 7; i++) {
        if (currentDay > 0 && currentDay <= daysInMonth) {
          week.push(currentDay)
        } else {
          week.push(null)
        }
        currentDay++
      }
      weeks.push({ days: week })
    }
    return weeks
  }

  // Task color coding for schedule view (gives each task a consistent left-border color)
  const getTaskColor = (task: Task) => {
    if (task.dueDate) {
      const d = new Date(task.dueDate)
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      const dueStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())
      const diffDays = Math.round((dueStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24))
      if (diffDays < 0) return "var(--forge-red)"
      if (diffDays === 0) return "var(--ember)"
    }
    if (task.repeats) return "var(--forge-green)"
    return "var(--ember)"
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-6 pb-4 animate-fade-in">
        <button onClick={onOpenDrawer} className="p-2 hover:bg-[var(--obsidian-2)] rounded-lg transition-colors">
          <Menu className="w-6 h-6 text-[var(--metal-muted)]" />
        </button>
        <h1 
          className="text-sm font-bold tracking-[0.2em] text-[var(--metal-muted)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          CALENDAR
        </h1>
        {/* View Toggle */}
        <div className="flex items-center gap-1 bg-[var(--obsidian-1)] border border-[var(--obsidian-border)] rounded-lg p-0.5">
          <button
            onClick={() => switchView("grid")}
            className={`p-1.5 rounded-md transition-all duration-300 ${
              view === "grid"
                ? "bg-[var(--ember)] text-[var(--obsidian)]"
                : "text-[var(--metal-muted)] hover:text-[var(--metal-bright)]"
            }`}
            title="Grid view"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => switchView("schedule")}
            className={`p-1.5 rounded-md transition-all duration-300 ${
              view === "schedule"
                ? "bg-[var(--ember)] text-[var(--obsidian)]"
                : "text-[var(--metal-muted)] hover:text-[var(--metal-bright)]"
            }`}
            title="Schedule view"
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Calendar Container */}
      <div className="flex-1 p-6 pb-8 space-y-4">

        {/* ━━━ GRID VIEW ━━━ */}
        {view === "grid" && (
          <>
            <div className="max-w-md mx-auto border border-[var(--obsidian-border)] rounded-2xl p-6 bg-[var(--obsidian-1)] animate-scale-in stagger-1">
              {/* Month/Year with Navigation */}
              <div className="flex items-center justify-between mb-6">
                <button 
                  onClick={goToPreviousMonth}
                  className="p-2 hover:bg-[var(--obsidian-2)] rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 text-[var(--metal-muted)]" />
                </button>
                <h2 
                  className="text-xl tracking-wide text-[var(--metal-bright)]"
                  style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
                >
                  {monthNames[month]} {year}
                </h2>
                <button 
                  onClick={goToNextMonth}
                  className="p-2 hover:bg-[var(--obsidian-2)] rounded-lg transition-colors"
                >
                  <ChevronRight className="w-5 h-5 text-[var(--metal-muted)]" />
                </button>
              </div>

              {/* Day Headers */}
              <div className="grid grid-cols-7 gap-2 mb-2">
                {daysOfWeek.map((day) => (
                  <div 
                    key={day} 
                    className="text-center text-xs text-[var(--metal-muted)] font-medium"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
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
                      className={`aspect-square rounded-lg flex flex-col items-center justify-center text-sm relative transition-all duration-300 ${
                        !day
                          ? "bg-transparent text-transparent cursor-default"
                          : isTodayDate && isSelected
                            ? "bg-[var(--obsidian-2)] border-2 border-[var(--forge-green)] text-[var(--metal-bright)] shadow-[0_0_12px_rgba(var(--forge-green-rgb),0.3)]"
                            : isSelected
                              ? "bg-[var(--obsidian-2)] border-2 border-[var(--ember)] text-[var(--metal-bright)] shadow-[0_0_12px_rgba(var(--ember-rgb),0.3)]"
                              : isTodayDate
                                ? "bg-[var(--obsidian-2)] border border-[var(--forge-green)] text-[var(--metal-bright)] hover:shadow-[0_0_8px_rgba(var(--forge-green-rgb),0.2)]"
                                : "bg-[var(--obsidian)] border border-[var(--obsidian-border)] text-[var(--metal-bright)] hover:border-[var(--ember)] cursor-pointer"
                      }`}
                    >
                      <span>{day}</span>
                      {hasTask && !isSelected && <div className="absolute bottom-1 w-1 h-1 rounded-full bg-[var(--ember)]" />}
                      {isTodayDate && isSelected && (
                        <div className="absolute bottom-1.5 w-1.5 h-1.5 rounded-full bg-[var(--forge-green)]" />
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Selected Day Tasks */}
              <div className="border-t border-[var(--obsidian-border)] pt-6">
                <h3 
                  className="text-sm text-[var(--metal-muted)] mb-4 tracking-wide"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {isToday(selectedDate) ? "Today's Tasks" : `Tasks for ${monthNames[month]} ${selectedDate}, ${year}`}
                </h3>
                <div className="space-y-3">
                  {selectedDateTasks.length > 0 ? (
                    selectedDateTasks.map((task, i) => (
                      <div 
                        key={task.id} 
                        className="flex items-center gap-2 text-sm text-[var(--metal-bright)] animate-fade-in-up py-2 px-2.5 -mx-2.5 rounded-lg hover:bg-[var(--obsidian-2)] cursor-pointer transition-colors group"
                        style={{ animationDelay: `${i * 0.05}s` }}
                        onClick={() => onSelectTask?.(task)}
                      >
                        <span className="text-[var(--metal-muted)]">{i + 1}.</span>
                        <span className="flex-1 truncate font-light">{task.title || task.name}</span>
                        <div className="flex items-center gap-1.5">
                          {task.hasAlarm && (
                            <div className="flex items-center gap-1 text-xs text-[var(--forge-orange)]">
                              <Bell className="w-3 h-3" />
                              <span>{task.alarm}</span>
                            </div>
                          )}
                          {task.hasRepeat && (
                            <div className="flex items-center text-xs text-[var(--ember)]">
                              <Repeat className="w-3 h-3" />
                            </div>
                          )}
                          {task.isDueDate && (
                            <span className="text-xs text-[var(--forge-red)] bg-[var(--forge-red)]/10 px-1.5 py-0.5 rounded">Due</span>
                          )}
                          <ArrowRight className="w-3.5 h-3.5 text-[var(--metal-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-[var(--metal-muted)] italic font-light">No tasks scheduled</div>
                  )}
                </div>
              </div>
            </div>

            {/* Upcoming Tasks Section */}
            {upcomingTasks.length > 0 && (
              <div className="max-w-md mx-auto border border-[var(--obsidian-border)] rounded-2xl p-6 bg-[var(--obsidian-1)] animate-fade-in-up stagger-3">
                <h3 
                  className="text-sm text-[var(--metal-muted)] mb-5 tracking-wider flex items-center gap-2"
                  style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
                >
                  <CalendarDays className="w-4 h-4" />
                  UPCOMING
                </h3>
                <div className="space-y-3">
                  {upcomingTasks.map((task, i) => (
                    <div 
                      key={task.id} 
                      className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg bg-[var(--obsidian)] border border-[var(--obsidian-border)] hover:border-[var(--ember)] transition-all duration-300 animate-fade-in-up"
                      style={{ animationDelay: `${i * 0.05}s` }}
                    >
                      <span className="text-sm text-[var(--metal-bright)] truncate flex-1 font-light">
                        {task.title || task.name}
                      </span>
                      <span 
                        className="text-xs font-medium whitespace-nowrap px-2 py-1 rounded-md"
                        style={{ 
                          color: getDueDateColor(task.dueDate!),
                          backgroundColor: `color-mix(in srgb, ${getDueDateColor(task.dueDate!)} 10%, transparent)`,
                        }}
                      >
                        {formatDueDate(task.dueDate!)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ━━━ SCHEDULE VIEW ━━━ */}
        {view === "schedule" && (
          <div className="animate-fade-in" style={{ margin: '0 -8px' }}>
            {/* Month Header with Navigation */}
            <div className="flex items-center justify-between mb-4 px-2">
              <button 
                onClick={goToPreviousMonth}
                className="p-2 hover:bg-[var(--obsidian-2)] rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-[var(--metal-muted)]" />
              </button>
              <h2 
                className="text-2xl tracking-widest text-[var(--metal-bright)]"
                style={{ fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '0.15em' }}
              >
                {monthNamesShort[month]}
              </h2>
              <button 
                onClick={goToNextMonth}
                className="p-2 hover:bg-[var(--obsidian-2)] rounded-lg transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-[var(--metal-muted)]" />
              </button>
            </div>

            {/* Day-of-week header row */}
            <div className="grid grid-cols-7 gap-0 border-b border-[var(--obsidian-border)]">
              {daysOfWeekFull.map((day, i) => (
                <div 
                  key={day} 
                  className={`text-center text-[11px] font-semibold tracking-wider py-2.5 ${
                    i >= 5 ? "text-[var(--forge-red)]" : "text-[var(--metal-muted)]"
                  }`}
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Week Rows */}
            {getWeekRows().map((week, weekIdx) => {
              const maxTasksInWeek = Math.max(
                0,
                ...week.days.map(d => d ? getTasksForDay(d).length : 0)
              )
              // Taller rows: base height + room for each task line
              const rowMinHeight = Math.max(100, 36 + maxTasksInWeek * 28)

              return (
                <div 
                  key={weekIdx}
                  className="grid grid-cols-7 gap-0 border-b border-[var(--obsidian-border)] animate-fade-in-up"
                  style={{ 
                    animationDelay: `${weekIdx * 0.04}s`,
                    minHeight: `${rowMinHeight}px`,
                  }}
                >
                  {week.days.map((day, dayIdx) => {
                    const isTodayDate = day !== null && isToday(day)
                    const dayTasks = day ? getTasksForDay(day) : []
                    const isWeekend = dayIdx >= 5

                    return (
                      <div
                        key={dayIdx}
                        className={`relative border-r border-[var(--obsidian-border)] p-1.5 flex flex-col ${
                          dayIdx === 6 ? "border-r-0" : ""
                        } ${day ? "hover:bg-[var(--obsidian-1)] cursor-pointer transition-colors duration-200" : ""}`}
                        onClick={() => {
                          if (day) {
                            setSelectedDate(day)
                          }
                        }}
                      >
                        {/* Day Number */}
                        {day !== null && (
                          <div className="flex items-start justify-center mb-1.5">
                            <span 
                              className={`text-xs w-7 h-7 flex items-center justify-center rounded-full transition-all ${
                                isTodayDate
                                  ? "bg-[var(--ember)] text-[var(--obsidian)] font-bold"
                                  : isWeekend
                                    ? "text-[var(--forge-red)] font-medium"
                                    : "text-[var(--metal-bright)] font-medium"
                              }`}
                              style={{ fontFamily: 'var(--font-display)' }}
                            >
                              {day}
                            </span>
                          </div>
                        )}

                        {/* Tasks stacked in cell — more room */}
                        <div className="flex-1 space-y-1 min-w-0">
                          {dayTasks.slice(0, 4).map((task) => (
                            <div
                              key={task.id}
                              className="text-[10px] leading-snug px-1.5 py-1 rounded-[3px] min-h-[20px] flex items-start"
                              style={{
                                borderLeft: `3px solid ${getTaskColor(task)}`,
                                backgroundColor: `color-mix(in srgb, ${getTaskColor(task)} 15%, transparent)`,
                                color: 'var(--metal-bright)',
                              }}
                              title={task.title || task.name}
                            >
                              <span className="line-clamp-2 break-words min-w-0">
                                {task.alarm && (
                                  <span className="text-[var(--forge-orange)] mr-0.5">{task.alarm} </span>
                                )}
                                {task.title || task.name}
                              </span>
                            </div>
                          ))}
                          {dayTasks.length > 4 && (
                            <div 
                              className="text-[9px] text-[var(--metal-muted)] px-1.5 font-medium"
                              style={{ fontFamily: 'var(--font-display)' }}
                            >
                              +{dayTasks.length - 4} more
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}

            {/* Selected Day Tasks Panel */}
            {selectedDate && (
              <div className="mt-4 border border-[var(--obsidian-border)] rounded-2xl p-5 bg-[var(--obsidian-1)] animate-fade-in">
                <h3 
                  className="text-sm text-[var(--metal-muted)] mb-4 tracking-wide"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {isToday(selectedDate) ? "Today's Tasks" : `Tasks for ${monthNames[month]} ${selectedDate}, ${year}`}
                </h3>
                <div className="space-y-1">
                  {getTasksForDay(selectedDate).length > 0 ? (
                    getTasksForDay(selectedDate).map((task, i) => (
                      <div 
                        key={task.id} 
                        className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-[var(--obsidian)] border border-[var(--obsidian-border)] hover:border-[var(--ember)] cursor-pointer transition-all duration-300 group animate-fade-in-up"
                        style={{ animationDelay: `${i * 0.05}s` }}
                        onClick={() => onSelectTask?.(task)}
                      >
                        <div 
                          className="w-1 h-8 rounded-full flex-shrink-0"
                          style={{ backgroundColor: getTaskColor(task) }}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-[var(--metal-bright)] font-light truncate block">
                            {task.title || task.name}
                          </span>
                          {task.dueDate && (
                            <span className="text-[10px] text-[var(--metal-muted)]">
                              Due {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </div>
                        <ArrowRight className="w-4 h-4 text-[var(--metal-muted)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-[var(--metal-muted)] italic font-light py-1">No tasks scheduled</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
