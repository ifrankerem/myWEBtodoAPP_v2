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
}

function SortableTask({ task, eraseMode, onTaskClick, onDeleteTask }: SortableTaskProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative ${eraseMode ? "animate-wiggle" : ""}`}
    >
      {/* Drag Handle - only show when not in erase mode */}
      {!eraseMode && (
        <div
          {...attributes}
          {...listeners}
          className="absolute top-2 left-2 z-10 p-1.5 bg-black/50 rounded-lg cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="w-4 h-4 text-white/70" />
        </div>
      )}
      
      <button
        onClick={() => !eraseMode && onTaskClick(task)}
        className="w-full aspect-square border border-[#333] rounded-xl bg-[#121212] hover:bg-[#1a1a1a] hover:border-[#444] transition-all overflow-hidden"
      >
        {task.photo ? (
          <div className="w-full h-full flex flex-col">
            <div className="h-[70%] min-h-0 relative overflow-hidden">
              <img
                src={task.photo || "/placeholder.svg"}
                alt={task.title}
                className="w-full h-full object-cover object-center"
              />
            </div>
            <div className="h-[30%] flex items-center px-3 bg-[#0f0f0f] border-t border-[#2a2a2a]">
              <p className="text-xs text-[#ddd] font-medium truncate w-full">{task.title}</p>
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center p-4">
            <p className="text-sm text-[#ddd] font-medium text-center line-clamp-3">{task.title}</p>
          </div>
        )}
      </button>
      {task.completed && !eraseMode && (
        <div className="absolute -top-2 -right-2 w-7 h-7 bg-[#34c759] rounded-full flex items-center justify-center shadow-lg">
          <CheckCircle className="w-4 h-4 text-white" />
        </div>
      )}
      {eraseMode && (
        <button
          onClick={() => onDeleteTask(task.id)}
          className="absolute -top-2 -right-2 w-7 h-7 bg-[#ff3b30] rounded-full flex items-center justify-center shadow-lg hover:bg-[#ff453a] transition-colors"
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
    <div className="h-screen flex flex-col bg-[#0B0B0B] relative">
      {/* Fixed Header */}
      <div className="flex-shrink-0 flex items-center justify-between p-6 pb-4 bg-[#0B0B0B] z-20">
        <button onClick={onOpenDrawer} className="p-2 hover:bg-[#1a1a1a] rounded-lg transition-colors">
          <Menu className="w-6 h-6 text-[#888]" />
        </button>
        <h1 className="text-sm font-medium tracking-[0.2em] text-[#888]">{isCompletedView ? "COMPLETED" : "TASKS"}</h1>
        <div className="w-10" />
      </div>

      {/* Scrollable Task Grid - only scrollable when there are tasks */}
      <div className={`flex-1 px-6 pb-32 ${tasks.length > 0 ? 'overflow-y-auto' : 'overflow-hidden'}`}>
        {isCompletedView && tasks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <CheckCircle className="w-16 h-16 text-[#333] mb-4" />
            <p className="text-[#888] text-sm">No completed tasks yet</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <p className="text-[#888] text-sm">No tasks yet. Tap the + button to create one.</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={tasks.map(t => t.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                {tasks.map((task) => (
                  <SortableTask
                    key={task.id}
                    task={task}
                    eraseMode={eraseMode}
                    onTaskClick={onTaskClick}
                    onDeleteTask={onDeleteTask}
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
          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 ${
            eraseMode 
              ? "bg-[#34c759] text-white shadow-[0_4px_20px_rgba(52,199,89,0.4)]" 
              : "bg-[#2a2a2a] text-[#888] hover:bg-[#333] shadow-[0_4px_20px_rgba(0,0,0,0.3)]"
          }`}
        >
          {eraseMode ? <CheckCircle className="w-6 h-6" /> : <Trash2 className="w-5 h-5" />}
        </button>
        
        {/* Add Task Button - Primary FAB */}
        {!isCompletedView && (
          <button
            onClick={onAddTask}
            className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center shadow-lg hover:bg-gray-100 active:scale-95 transition-all shadow-[0_4px_20px_rgba(255,255,255,0.3)]"
          >
            <Plus className="w-7 h-7" strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  )
}
