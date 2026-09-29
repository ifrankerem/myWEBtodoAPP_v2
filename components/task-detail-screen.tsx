"use client"

import type { Task } from "@/lib/task"
import TaskProperties from "@/components/task-properties"

interface TaskDetailScreenProps {
  task: Task
  onBack: () => void
  onToggleComplete: (taskId: string) => void
  onUpdateTask?: (taskId: string, updates: Partial<Task>) => void
  onDeleteTask?: (taskId: string) => void
  initialTab?: "general" | "reminder" | "picture"
}

export default function TaskDetailScreen({
  task,
  onBack,
  onToggleComplete,
  onUpdateTask,
  onDeleteTask,
  initialTab,
}: TaskDetailScreenProps) {
  return (
    <TaskProperties
      key={task.id}
      task={task}
      initialTab={initialTab}
      onApply={(updates) => onUpdateTask?.(task.id, updates)}
      onToggleComplete={() => onToggleComplete(task.id)}
      onDelete={onDeleteTask && (() => { onDeleteTask(task.id); onBack() })}
      onClose={onBack}
    />
  )
}
