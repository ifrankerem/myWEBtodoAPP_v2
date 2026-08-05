"use client"

import { useEffect, useState } from "react"
import {
  CheckCircle,
  Cloud,
  FileText,
  LayoutGrid,
  List,
  Plus,
  Trash2,
  X,
} from "lucide-react"
import type { Task } from "@/app/page"
import { XpHeader, XpStatusBar } from "@/components/xp-ui"
import {
  DndContext,
  closestCenter,
  TouchSensor,
  MouseSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  useSortable,
  rectSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

type TaskView = "grid" | "list"

interface TasksGridScreenProps {
  tasks: Task[]
  onTaskClick: (task: Task) => void
  onAddTask: () => void
  onDeleteTask: (taskId: string) => void
  onOpenDrawer: () => void
  onReorderTasks?: (tasks: Task[]) => void
  isCompletedView?: boolean
}

interface SortableTaskProps {
  task: Task
  eraseMode: boolean
  canReorder: boolean
  view: TaskView
  onTaskClick: (task: Task) => void
  onDeleteTask: (taskId: string) => void
}

function SortableTask({ task, eraseMode, canReorder, view, onTaskClick, onDeleteTask }: SortableTaskProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !canReorder,
  })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : 1,
    outline: isDragging ? "2px dotted var(--xp-selection)" : undefined,
    opacity: isDragging ? 0.85 : 1,
  }

  const thumbnail = task.photo ? (
    <img src={task.photo} alt="" className="xp-task-thumbnail" />
  ) : (
    <span className="xp-task-file-icon" aria-hidden="true">
      <FileText />
    </span>
  )

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`xp-task-item xp-task-item-${view}${eraseMode ? " animate-wiggle" : ""}`}
    >
      {!eraseMode && canReorder && (
        <button
          type="button"
          className="xp-drag-handle"
          aria-label={`Reorder ${task.title}`}
          {...attributes}
          {...listeners}
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        className="xp-task-open"
        onClick={() => !eraseMode && !isDragging && onTaskClick(task)}
        disabled={eraseMode}
      >
        {thumbnail}
        <span className="xp-task-copy">
          <strong>{task.title}</strong>
          {view === "list" && (
            <small>{task.detail || task.dueDate || (task.completed ? "Completed task" : "Task")}</small>
          )}
        </span>
        {task.completed && !eraseMode && <CheckCircle className="xp-task-complete" aria-label="Completed" />}
      </button>
      {eraseMode && (
        <button
          type="button"
          className="xp-delete-task"
          onClick={() => onDeleteTask(task.id)}
          aria-label={`Delete ${task.title}`}
        >
          <X />
        </button>
      )}
    </div>
  )
}

export default function TasksGridScreen({
  tasks,
  onTaskClick,
  onAddTask,
  onDeleteTask,
  onOpenDrawer,
  onReorderTasks,
  isCompletedView = false,
}: TasksGridScreenProps) {
  const [eraseMode, setEraseMode] = useState(false)
  const [view, setView] = useState<TaskView>("grid")

  useEffect(() => {
    const stored = window.localStorage.getItem("task-view")
    if (stored === "grid" || stored === "list") setView(stored)
  }, [])

  const switchView = (nextView: TaskView) => {
    setView(nextView)
    window.localStorage.setItem("task-view", nextView)
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = tasks.findIndex((task) => task.id === active.id)
    const newIndex = tasks.findIndex((task) => task.id === over.id)
    if (oldIndex !== -1 && newIndex !== -1) onReorderTasks?.(arrayMove(tasks, oldIndex, newIndex))
  }

  const title = isCompletedView ? "Completed" : "Tasks"

  return (
    <section className="xp-screen" aria-label={title}>
      <XpHeader
        title={title}
        onOpenDrawer={onOpenDrawer}
        actions={
          <>
            <div className="xp-view-toggle" aria-label="Task view">
              <button
                type="button"
                className="xp-button"
                aria-pressed={view === "grid"}
                onClick={() => switchView("grid")}
                title="Grid view"
              >
                <LayoutGrid />
                <span className="hidden sm:inline">Grid</span>
              </button>
              <button
                type="button"
                className="xp-button"
                aria-pressed={view === "list"}
                onClick={() => switchView("list")}
                title="List view"
              >
                <List />
                <span className="hidden sm:inline">List</span>
              </button>
            </div>
            {!isCompletedView && (
              <button type="button" className="xp-button" onClick={onAddTask}>
                <Plus /> Add Task
              </button>
            )}
            <button
              type="button"
              className={`xp-button${eraseMode ? " xp-button-danger" : ""}`}
              aria-pressed={eraseMode}
              onClick={() => setEraseMode((active) => !active)}
            >
              {eraseMode ? <CheckCircle /> : <Trash2 />}
              <span>{eraseMode ? "Done" : "Delete"}</span>
            </button>
          </>
        }
      />

      <main className="xp-content">
        <div className="xp-inset xp-task-browser">
          {tasks.length === 0 ? (
            <div className="xp-empty">
              <div>
                <FileText aria-hidden="true" />
                <p>{isCompletedView ? "No completed tasks yet." : "No tasks yet. Use Add Task to create one."}</p>
              </div>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext
                items={tasks.map((task) => task.id)}
                strategy={view === "grid" ? rectSortingStrategy : verticalListSortingStrategy}
              >
                <div className={`xp-task-collection xp-task-collection-${view}`}>
                  {tasks.map((task) => (
                    <SortableTask
                      key={task.id}
                      task={task}
                      eraseMode={eraseMode}
                      canReorder={Boolean(onReorderTasks)}
                      view={view}
                      onTaskClick={onTaskClick}
                      onDeleteTask={onDeleteTask}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </main>

      <XpStatusBar>
        <span className="flex-1">{tasks.length} object{tasks.length === 1 ? "" : "s"}</span>
        <span className="flex items-center gap-1.5"><Cloud className="h-3.5 w-3.5 text-[var(--xp-green)]" /> All synced</span>
      </XpStatusBar>
    </section>
  )
}
