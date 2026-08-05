"use client"

import { ArrowRight, Bell, CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, List, Plus, Repeat } from "lucide-react"
import { useEffect, useState } from "react"
import type { Task } from "@/app/page"
import { XpHeader, XpStatusBar } from "@/components/xp-ui"
import { parseTaskDate } from "@/lib/task-dates"

interface CalendarScreenProps {
  tasks: Task[]
  onOpenDrawer: () => void
  onSelectTask?: (task: Task) => void
  onAddTask?: (prefilledDate: string) => void
}

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]
const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const mondayFirstDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

type CalendarView = "grid" | "schedule"

export default function CalendarScreen({ tasks, onOpenDrawer, onSelectTask, onAddTask }: CalendarScreenProps) {
  const today = new Date()
  const [currentMonth, setCurrentMonth] = useState(today.getMonth())
  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [selectedDate, setSelectedDate] = useState(today.getDate())
  const [view, setView] = useState<CalendarView>("grid")

  useEffect(() => {
    const saved = localStorage.getItem("calendar-view")
    if (saved === "grid" || saved === "schedule") setView(saved)
  }, [])

  const switchView = (nextView: CalendarView) => {
    setView(nextView)
    localStorage.setItem("calendar-view", nextView)
  }

  const year = currentYear
  const month = currentMonth
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7
  const days = Array.from({ length: totalCells }, (_, index) => {
    const day = index - firstDay + 1
    return day > 0 && day <= daysInMonth ? day : null
  })

  const changeMonth = (offset: number) => {
    const next = new Date(year, month + offset, 1)
    setCurrentMonth(next.getMonth())
    setCurrentYear(next.getFullYear())
    setSelectedDate(1)
  }

  const getTasksForDay = (day: number) => {
    const dateToCheck = new Date(year, month, day)
    const dayName = daysOfWeek[dateToCheck.getDay()]

    return tasks
      .filter((task) => !task.completed)
      .filter((task) => {
        if (task.dueDate) {
          const dueDate = parseTaskDate(task.dueDate)
          if (dueDate.getDate() === day && dueDate.getMonth() === month && dueDate.getFullYear() === year) return true
        }
        if (task.repeats?.split(",").map((item) => item.trim()).includes(dayName)) return true
        return Boolean(
          task.alarm &&
          !task.dueDate &&
          !task.repeats &&
          day === today.getDate() &&
          month === today.getMonth() &&
          year === today.getFullYear(),
        )
      })
      .map((task) => {
        const dueDate = task.dueDate ? parseTaskDate(task.dueDate) : null
        return {
          ...task,
          hasAlarm: Boolean(task.alarm),
          hasRepeat: Boolean(task.repeats),
          isDueDate: Boolean(
            dueDate &&
            dueDate.getDate() === day &&
            dueDate.getMonth() === month &&
            dueDate.getFullYear() === year,
          ),
        }
      })
  }

  const isToday = (day: number) => (
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
  )

  const getWeekRows = () => {
    const mondayOffset = firstDay === 0 ? 6 : firstDay - 1
    const weeks: Array<Array<number | null>> = []
    let currentDay = 1 - mondayOffset
    while (currentDay <= daysInMonth) {
      const week: Array<number | null> = []
      for (let index = 0; index < 7; index += 1) {
        week.push(currentDay > 0 && currentDay <= daysInMonth ? currentDay : null)
        currentDay += 1
      }
      weeks.push(week)
    }
    return weeks
  }

  const addTaskForSelectedDate = () => {
    if (!onAddTask) return
    const mm = String(month + 1).padStart(2, "0")
    const dd = String(selectedDate).padStart(2, "0")
    onAddTask(`${year}-${mm}-${dd}`)
  }

  const dueDateLabel = (dateString: string) => {
    const dueDate = parseTaskDate(dateString)
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const dueStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())
    const daysAway = Math.round((dueStart.getTime() - todayStart.getTime()) / 86_400_000)
    if (daysAway < 0) return "Overdue"
    if (daysAway === 0) return "Today"
    if (daysAway === 1) return "Tomorrow"
    if (daysAway <= 7) return `In ${daysAway} days`
    return dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: dueDate.getFullYear() !== today.getFullYear() ? "numeric" : undefined })
  }

  const dueDateTone = (dateString: string) => {
    const dueDate = parseTaskDate(dateString)
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const dueStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())
    const daysAway = Math.round((dueStart.getTime() - todayStart.getTime()) / 86_400_000)
    if (daysAway < 0) return "xp-badge-danger"
    if (daysAway <= 3) return "xp-badge-warning"
    return "xp-badge-neutral"
  }

  const selectedDateTasks = getTasksForDay(selectedDate)
  const daysWithTasks = new Set(
    Array.from({ length: daysInMonth }, (_, index) => index + 1).filter((day) => getTasksForDay(day).length > 0),
  )
  const upcomingTasks = tasks
    .filter((task) => !task.completed && task.dueDate)
    .sort((a, b) => parseTaskDate(a.dueDate!).getTime() - parseTaskDate(b.dueDate!).getTime())

  const selectedTaskPanel = (
    <section className="xp-calendar-selection" aria-label="Selected date tasks">
      <div className="xp-calendar-section-header">
        <strong>{isToday(selectedDate) ? "Today's Tasks" : `${monthNames[month]} ${selectedDate}, ${year}`}</strong>
        {onAddTask && <button type="button" className="xp-button" onClick={addTaskForSelectedDate}><Plus /> Add Task</button>}
      </div>
      <div className="xp-inset xp-calendar-task-list">
        {selectedDateTasks.length > 0 ? selectedDateTasks.map((task, index) => (
          <button key={task.id} type="button" className="xp-calendar-task-row" onClick={() => onSelectTask?.(task)}>
            <span className="xp-calendar-task-index">{index + 1}.</span>
            <span className="xp-calendar-task-name">{task.title || task.name}</span>
            {task.hasAlarm && <span className="xp-calendar-meta"><Bell /> {task.alarm}</span>}
            {task.hasRepeat && <Repeat className="xp-calendar-repeat" aria-label="Repeating task" />}
            {task.isDueDate && <span className="xp-badge xp-badge-danger">Due</span>}
            <ArrowRight className="xp-calendar-arrow" aria-hidden="true" />
          </button>
        )) : <p className="xp-calendar-empty">No tasks scheduled.</p>}
      </div>
    </section>
  )

  return (
    <section className="xp-screen xp-calendar" aria-label="Calendar">
      <XpHeader
        title="Calendar"
        onOpenDrawer={onOpenDrawer}
        actions={
          <div className="xp-view-toggle" aria-label="Calendar view">
            <button type="button" className="xp-button" aria-pressed={view === "grid"} onClick={() => switchView("grid")}><LayoutGrid /> <span className="hidden sm:inline">Month</span></button>
            <button type="button" className="xp-button" aria-pressed={view === "schedule"} onClick={() => switchView("schedule")}><List /> <span className="hidden sm:inline">Schedule</span></button>
          </div>
        }
      />

      <main className="xp-content">
        <div className="xp-calendar-workspace">
          <section className="xp-groupbox xp-calendar-main">
            <span className="xp-groupbox-title">{view === "grid" ? "Monthly calendar" : "Schedule"}</span>
            <div className="xp-calendar-monthbar">
              <button type="button" className="xp-button xp-calendar-nav" onClick={() => changeMonth(-1)} aria-label="Previous month"><ChevronLeft /></button>
              <h2>{monthNames[month]} {year}</h2>
              <button type="button" className="xp-button xp-calendar-nav" onClick={() => changeMonth(1)} aria-label="Next month"><ChevronRight /></button>
            </div>

            {view === "grid" ? (
              <>
                <div className="xp-calendar-weekdays" aria-hidden="true">
                  {daysOfWeek.map((day) => <span key={day}>{day}</span>)}
                </div>
                <div className="xp-calendar-grid">
                  {days.map((day, index) => (
                    <button
                      key={`${day ?? "empty"}-${index}`}
                      type="button"
                      disabled={!day}
                      className={`xp-calendar-day${day === selectedDate ? " is-selected" : ""}${day && isToday(day) ? " is-today" : ""}`}
                      aria-label={day ? `${monthNames[month]} ${day}` : undefined}
                      aria-pressed={day ? day === selectedDate : undefined}
                      onClick={() => day && setSelectedDate(day)}
                    >
                      <span>{day}</span>
                      {day && daysWithTasks.has(day) && <i aria-label="Has tasks" />}
                    </button>
                  ))}
                </div>
                {selectedTaskPanel}
              </>
            ) : (
              <>
                <div className="xp-inset xp-schedule-scroll">
                  <div className="xp-schedule-table">
                    <div className="xp-schedule-weekdays">{mondayFirstDays.map((day) => <span key={day}>{day}</span>)}</div>
                    {getWeekRows().map((week, weekIndex) => (
                      <div className="xp-schedule-week" key={`week-${weekIndex}`}>
                        {week.map((day, dayIndex) => (
                          <div className={`xp-schedule-day${day && isToday(day) ? " is-today" : ""}`} key={`${day ?? "empty"}-${dayIndex}`}>
                            {day && (
                              <>
                                <button type="button" className="xp-schedule-date" onClick={() => setSelectedDate(day)} aria-label={`Select ${monthNames[month]} ${day}`}>{day}</button>
                                <div className="xp-schedule-tasks">
                                  {getTasksForDay(day).slice(0, 4).map((task) => (
                                    <button key={task.id} type="button" className="xp-schedule-task" onClick={() => onSelectTask?.(task)} title={task.title || task.name}>
                                      {task.alarm && <span>{task.alarm}</span>} {task.title || task.name}
                                    </button>
                                  ))}
                                  {getTasksForDay(day).length > 4 && <small>+{getTasksForDay(day).length - 4} more</small>}
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
                {selectedTaskPanel}
              </>
            )}
          </section>

          {view === "grid" && upcomingTasks.length > 0 && (
            <section className="xp-groupbox xp-calendar-upcoming">
              <span className="xp-groupbox-title"><CalendarDays /> Upcoming</span>
              <div className="xp-inset xp-upcoming-list">
                {upcomingTasks.map((task) => (
                  <button key={task.id} type="button" className="xp-upcoming-row" onClick={() => onSelectTask?.(task)}>
                    <span>{task.title || task.name}</span>
                    <span className={`xp-badge ${dueDateTone(task.dueDate!)}`}>{dueDateLabel(task.dueDate!)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
      <XpStatusBar><span className="flex-1">{monthNames[month]} {year}</span><span>{tasks.length} tasks</span></XpStatusBar>
    </section>
  )
}
