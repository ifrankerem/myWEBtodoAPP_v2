"use client"

import { useEffect, useState } from "react"
import type { Task } from "@/lib/task"
import { isRepeating, toRepeatRule } from "@/lib/repeat-rule"
import { parseTaskDate } from "@/lib/task-dates"
import { daysFromToday, relativeDay, taskOccursOn } from "@/lib/task-display"
import { XpIcon } from "@/components/xp-icons"
import {
  XpStatusBar,
  XpSynced,
  XpTaskThumb,
  XpToolbar,
  XpToolButton,
  XpToolSeparator,
  XpWindow,
} from "@/components/xp-ui"

interface CalendarScreenProps {
  tasks: Task[]
  onBack?: () => void
  onSelectTask?: (task: Task, origin?: Element) => void
  onAddTask?: (prefilledDate: string) => void
}

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]
const mondayFirstDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

type CalendarView = "grid" | "schedule"

const pad = (value: number) => String(value).padStart(2, "0")
const toKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
const longDate = (date: Date) => `${dayNames[date.getDay()]}, ${monthNames[date.getMonth()]} ${date.getDate()}`

export default function CalendarScreen({ tasks, onBack, onSelectTask, onAddTask }: CalendarScreenProps) {
  const [today] = useState(() => new Date())
  const [month, setMonth] = useState(today.getMonth())
  const [year, setYear] = useState(today.getFullYear())
  const [selected, setSelected] = useState(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()))
  const [view, setView] = useState<CalendarView>("grid")

  useEffect(() => {
    const saved = localStorage.getItem("calendar-view")
    if (saved === "grid" || saved === "schedule") setView(saved)
  }, [])

  const switchView = (next: CalendarView) => {
    setView(next)
    localStorage.setItem("calendar-view", next)
  }

  const changeMonth = (offset: number) => {
    const next = new Date(year, month + offset, 1)
    setMonth(next.getMonth())
    setYear(next.getFullYear())
    setSelected(next)
  }

  const goToday = () => {
    setMonth(today.getMonth())
    setYear(today.getFullYear())
    setSelected(new Date(today.getFullYear(), today.getMonth(), today.getDate()))
  }

  const pickDay = (date: Date) => {
    setSelected(date)
    if (date.getMonth() !== month || date.getFullYear() !== year) {
      setMonth(date.getMonth())
      setYear(date.getFullYear())
    }
  }

  const open = tasks.filter((task) => !task.completed)
  const tasksOn = (date: Date) => open.filter((task) => taskOccursOn(task, date, today))

  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const weeks = Math.ceil((offset + daysInMonth) / 7)
  const cells = Array.from({ length: weeks * 7 }, (_, index) => addDays(first, index - offset))

  const selectedTasks = tasksOn(selected)
  const upcoming = open
    .filter((task) => task.dueDate && daysFromToday(parseTaskDate(task.dueDate), today) > 0)
    .sort((a, b) => parseTaskDate(a.dueDate!).getTime() - parseTaskDate(b.dueDate!).getTime())
    .slice(0, 5)
  const dueInMonth = open.filter((task) => {
    if (!task.dueDate) return false
    const due = parseTaskDate(task.dueDate)
    return due.getMonth() === month && due.getFullYear() === year
  }).length

  const monthHead = (
    <div className="xp-cal-head">
      <button type="button" className="xp-btn is-small" onClick={() => changeMonth(-1)} aria-label="Previous month">◀</button>
      <h2>{monthNames[month]} {year}</h2>
      <button type="button" className="xp-btn is-small" onClick={() => changeMonth(1)} aria-label="Next month">▶</button>
      <button type="button" className="xp-btn is-small" onClick={goToday}>Today</button>
    </div>
  )

  const taskRow = (task: Task, trailing: string, icon: "thumb" | "calendar") => (
    <button key={task.id} type="button" className="xp-day-row" onClick={(event) => onSelectTask?.(task, event.currentTarget)}>
      {icon === "thumb"
        ? <XpTaskThumb task={task} size={22} repeating={isRepeating(toRepeatRule(task))} />
        : <XpIcon name="calendar" size={22} />}
      <span>{task.title}</span>
      <small>{trailing}</small>
    </button>
  )

  return (
    <XpWindow title="Calendar" icon="calendar">
      <XpToolbar label="Calendar commands">
        <XpToolButton icon="back" ariaLabel="Back" disabled={!onBack} onClick={onBack} />
        <XpToolButton icon="calendar" label="Month" pressed={view === "grid"} onClick={() => switchView("grid")} />
        <XpToolButton icon="views" label="Schedule" pressed={view === "schedule"} onClick={() => switchView("schedule")} />
        {onAddTask && (
          <>
            <XpToolSeparator />
            <XpToolButton icon="newTask" label="New Task" onClick={() => onAddTask(toKey(selected))} />
          </>
        )}
      </XpToolbar>

      <div className="xp-window-body is-chrome">
        <div className="xp-cal">
          {monthHead}

          {view === "grid" ? (
            <div className="xp-cal-grid">
              {mondayFirstDays.map((day) => <span key={day} className="xp-dow">{day}</span>)}
              {cells.map((date) => {
                const dayTasks = tasksOn(date)
                const isOut = date.getMonth() !== month
                const isToday = daysFromToday(date, today) === 0
                return (
                  <button
                    key={toKey(date)}
                    type="button"
                    className={`xp-day${isOut ? " is-out" : ""}${isToday ? " is-today" : ""}`}
                    aria-pressed={toKey(date) === toKey(selected)}
                    aria-label={`${longDate(date)}${dayTasks.length ? `, ${dayTasks.length} task${dayTasks.length === 1 ? "" : "s"}` : ""}`}
                    onClick={() => pickDay(date)}
                  >
                    <span className="xp-day-n">{date.getDate()}</span>
                    <span className="xp-dots" aria-hidden="true">
                      {dayTasks.slice(0, 3).map((task) => (
                        <i key={task.id} className={isRepeating(toRepeatRule(task)) ? "is-repeat" : undefined} />
                      ))}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="xp-sched">
              <div className="xp-sched-row">{mondayFirstDays.map((day) => <span key={day} className="xp-dow">{day}</span>)}</div>
              {Array.from({ length: weeks }, (_, week) => (
                <div className="xp-sched-row" key={week}>
                  {cells.slice(week * 7, week * 7 + 7).map((date) => {
                    const isOut = date.getMonth() !== month
                    const dayTasks = isOut ? [] : tasksOn(date)
                    return (
                      <div key={toKey(date)} className={`xp-scell${isOut ? " is-out" : ""}${daysFromToday(date, today) === 0 ? " is-today" : ""}`}>
                        {!isOut && (
                          <>
                            <button type="button" className="xp-scell-n" onClick={() => { pickDay(date); switchView("grid") }} aria-label={longDate(date)}>
                              {date.getDate()}
                            </button>
                            {dayTasks.slice(0, 3).map((task) => (
                              <button
                                key={task.id}
                                type="button"
                                className={`xp-chip${isRepeating(toRepeatRule(task)) ? " is-repeat" : ""}`}
                                onClick={(event) => onSelectTask?.(task, event.currentTarget)}
                                title={task.title}
                              >
                                {task.alarm ? `${task.alarm} ` : ""}{task.title}
                              </button>
                            ))}
                            {dayTasks.length > 3 && <small>+{dayTasks.length - 3}</small>}
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          {view === "schedule" && <p className="xp-hint">Blue marks a due date, green marks a repeating task. Tap a date to open it.</p>}

          {view === "grid" && (
            <>
              <fieldset className="xp-groupbox">
                <legend>{longDate(selected)}</legend>
                <div className="xp-day-list">
                  {selectedTasks.length
                    ? selectedTasks.map((task) => taskRow(task, task.alarm ?? (task.dueDate ? "Due" : ""), "thumb"))
                    : <p className="xp-cal-empty">Nothing planned for this day.</p>}
                </div>
                {onAddTask && (
                  <div>
                    <button type="button" className="xp-btn" onClick={() => onAddTask(toKey(selected))}>
                      <XpIcon name="newTask" size={16} /> New task on {monthNames[selected.getMonth()].slice(0, 3)} {selected.getDate()}
                    </button>
                  </div>
                )}
              </fieldset>

              {upcoming.length > 0 && (
                <fieldset className="xp-groupbox">
                  <legend>Coming up</legend>
                  <div className="xp-day-list">
                    {upcoming.map((task) => taskRow(task, relativeDay(parseTaskDate(task.dueDate!), today), "calendar"))}
                  </div>
                </fieldset>
              )}
            </>
          )}
        </div>
      </div>

      <XpStatusBar>
        <span className="xp-sb is-grow"><span>{dueInMonth} task{dueInMonth === 1 ? "" : "s"} due in {monthNames[month]}</span></span>
        <XpSynced />
      </XpStatusBar>
    </XpWindow>
  )
}
