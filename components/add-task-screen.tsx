"use client"

import type { Task } from "@/lib/task"
import TaskProperties from "@/components/task-properties"

interface AddTaskScreenProps {
  onSave: (task: Omit<Task, "id" | "createdDate" | "lastEditedDate">, photoFile?: File) => void
  onCancel: () => void
  initialDueDate?: string
}

export default function AddTaskScreen({ onSave, onCancel, initialDueDate }: AddTaskScreenProps) {
  return <TaskProperties initialDueDate={initialDueDate} onCreate={onSave} onClose={onCancel} />
}
