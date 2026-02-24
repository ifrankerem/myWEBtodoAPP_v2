"use client"

import { useState } from "react"
import { Menu, X, CheckCircle, GripVertical, Plus, Trash2 } from "lucide-react"
import type { Task } from "@/app/page"
import {
  DndContext,
  closestCenter,
  TouchSensor,
  MouseSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

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
  onTaskClick: (task: Task) => void
  onDeleteTask: (taskId: string) => void
  index: number
}

function SortableTask({ task, eraseMode, onTaskClick, onDeleteTask, index }: SortableTaskProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? 'none' : transition,
    zIndex: isDragging ? 50 : 1,
    ...(isDragging ? {
      scale: '1.06',
      outline: '2.5px solid #D4915C',
      outlineOffset: '0px',
      borderRadius: '12px',
      boxShadow: '0 0 24px 4px rgba(212, 145, 92, 0.45), 0 8px 32px rgba(0,0,0,0.5)',
      filter: 'brightness(1.1)',
    } : {}),
  }

  // Stagger class: each card gets a delay based on index (cap at 10)
  const staggerClass = `stagger-${Math.min(index + 1, 10)}`

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative ${eraseMode ? "animate-wiggle" : `animate-fade-in-up ${staggerClass}`}`}
    >
      {/* Drag Handle - only show when not in erase mode */}
      {!eraseMode && (
        <div
          {...attributes}
          {...listeners}
          className="absolute top-2 left-2 z-10 p-1.5 rounded-lg cursor-grab active:cursor-grabbing touch-none"
          style={isDragging 
            ? { backgroundColor: '#D4915C', boxShadow: '0 0 10px rgba(212,145,92,0.6)' }
            : { backgroundColor: 'rgba(0,0,0,0.5)' }
          }
        >
          <GripVertical className={`w-4 h-4 ${isDragging ? "text-black" : "text-white/70"}`} />
        </div>
      )}
      
      <button
        onClick={() => !eraseMode && !isDragging && onTaskClick(task)}
        className="w-full aspect-square rounded-xl transition-all duration-300 overflow-hidden group border bg-[var(--obsidian-1)] hover:bg-[var(--obsidian-2)] hover:border-[var(--ember)] hover:shadow-[0_0_15px_rgba(var(--ember-rgb),0.15)]"
        style={isDragging 
          ? { borderColor: '#D4915C', borderWidth: '2px', background: 'var(--obsidian-2)' }
          : { borderColor: 'var(--obsidian-border)' }
        }
      >
        {task.photo ? (
          <div className="w-full h-full flex flex-col">
            <div className="h-[70%] min-h-0 relative overflow-hidden">
              <img
                src={task.photo || "/placeholder.svg"}
                alt={task.title}
                className="w-full h-full object-cover object-center group-hover:scale-[1.03] transition-transform duration-500"
              />
            </div>
            <div className="h-[30%] flex items-center px-3 bg-[var(--obsidian)] border-t border-[var(--obsidian-border)]">
              <p className="text-xs text-[var(--metal-bright)] font-medium truncate w-full">{task.title}</p>
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center p-4">
            <p className="text-sm text-[var(--metal-bright)] font-medium text-center line-clamp-3">{task.title}</p>
          </div>
        )}
      </button>
      {task.completed && !eraseMode && (
        <div className="absolute -top-2 -right-2 w-7 h-7 bg-[var(--forge-green)] rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(var(--forge-green-rgb),0.4)]">
          <CheckCircle className="w-4 h-4 text-white" />
        </div>
      )}
      {eraseMode && (
        <button
          onClick={() => onDeleteTask(task.id)}
          className="absolute -top-2 -right-2 w-7 h-7 bg-[var(--forge-red)] rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(var(--forge-red-rgb),0.4)] hover:brightness-110 transition-colors"
        >
          <X className="w-4 h-4 text-white" />
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

  // Sensors for both mouse and touch with delay for touch
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = tasks.findIndex((t) => t.id === active.id)
      const newIndex = tasks.findIndex((t) => t.id === over.id)
      
      const newTasks = arrayMove(tasks, oldIndex, newIndex)
      
      if (onReorderTasks) {
        onReorderTasks(newTasks)
      }
    }
  }

  return (
    <div className="h-screen flex flex-col bg-transparent relative">
      {/* Fixed Header */}
      <div className="flex-shrink-0 flex items-center justify-between p-6 pb-4 z-20 animate-fade-in">
        <button onClick={onOpenDrawer} className="p-2 hover:bg-[var(--obsidian-2)] rounded-lg transition-colors">
          <Menu className="w-6 h-6 text-[var(--metal-muted)]" />
        </button>
        <h1 
          className="text-sm font-bold tracking-[0.2em] text-[var(--metal-muted)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {isCompletedView ? "COMPLETED" : "TASKS"}
        </h1>
        <div className="w-10" />
      </div>

      {/* Scrollable Task Grid - only scrollable when there are tasks */}
      <div className={`flex-1 px-6 pb-32 ${tasks.length > 0 ? 'overflow-y-auto' : 'overflow-hidden'}`}>
        {isCompletedView && tasks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center animate-fade-in">
            <CheckCircle className="w-16 h-16 text-[var(--obsidian-border)] mb-4" />
            <p className="text-[var(--metal-muted)] text-sm font-light">No completed tasks yet</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center animate-fade-in">
            <p className="text-[var(--metal-muted)] text-sm font-light">No tasks yet. Tap the + button to create one.</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={tasks.map(t => t.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                {tasks.map((task, index) => (
                  <SortableTask
                    key={task.id}
                    task={task}
                    eraseMode={eraseMode}
                    onTaskClick={onTaskClick}
                    onDeleteTask={onDeleteTask}
                    index={index}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-8 right-6 flex flex-col gap-4 z-30">
        {/* Erase/Done Button */}
        <button
          onClick={() => setEraseMode(!eraseMode)}
          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 animate-fade-in-up stagger-2 ${
            eraseMode 
              ? "bg-[var(--forge-green)] text-white shadow-[0_4px_20px_rgba(var(--forge-green-rgb),0.4)]" 
              : "bg-[var(--obsidian-2)] text-[var(--metal-muted)] hover:bg-[var(--obsidian-border)] shadow-[0_4px_20px_rgba(0,0,0,0.3)]"
          }`}
        >
          {eraseMode ? <CheckCircle className="w-6 h-6" /> : <Trash2 className="w-5 h-5" />}
        </button>
        
        {/* Add Task Button - Primary FAB */}
        {!isCompletedView && (
          <button
            onClick={onAddTask}
            className="w-16 h-16 rounded-full bg-[var(--ember)] text-[var(--obsidian)] flex items-center justify-center shadow-lg hover:brightness-110 active:scale-95 transition-all shadow-[0_4px_25px_rgba(var(--ember-rgb),0.4)] animate-fade-in-up stagger-3"
          >
            <Plus className="w-7 h-7" strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  )
}
