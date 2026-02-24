"use client"

import { useState, useEffect } from "react"
import TasksGridScreen from "@/components/tasks-grid-screen"
import CalendarScreen from "@/components/calendar-screen"
import TaskDetailScreen from "@/components/task-detail-screen"
import AddTaskScreen from "@/components/add-task-screen"
import SlidingDrawer from "@/components/sliding-drawer"
import SettingsScreen from "@/components/settings-screen"
import { 
  getTasks as getStoredTasks, 
  createTask as createStoredTask, 
  deleteTask as deleteStoredTask, 
  toggleTaskComplete as toggleStoredComplete,
  updateTask as updateStoredTask,
  fileToBase64,
  saveTasks as saveStoredTasks,
  type TaskRecord as StoredTask 
} from "@/lib/storage-idb"
import {
  initializeNotifications,
  scheduleTaskNotification,
  cancelTaskNotification,
} from "@/lib/notifications"
import {
  initializeForegroundReminders,
  startForegroundReminder,
  stopForegroundReminder,
} from "@/lib/web-notifications"
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'

export type Task = {
  id: string
  name: string
  title: string
  type: "picture" | "text" | "mixed"
  photo?: string
  detail?: string
  createdDate: Date
  lastEditedDate: Date
  alarm?: string
  repeats?: string
  completed?: boolean
  dueDate?: string
}

export type Screen = "tasks" | "calendar" | "detail" | "add" | "completed" | "settings"

// Transform stored task to frontend Task format
function storedTaskToTask(stored: StoredTask): Task {
  return {
    id: stored.id,
    name: stored.title,
    title: stored.title,
    type: stored.photo ? "picture" : "text",
    photo: stored.photo || undefined,
    detail: stored.detail || undefined,
    createdDate: new Date(stored.createdAt),
    lastEditedDate: new Date(stored.updatedAt),
    alarm: stored.alarm || undefined,
    repeats: stored.repeats || undefined,
    completed: stored.completed,
    dueDate: stored.dueDate || undefined,
  }
}

export default function Page() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("tasks")
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [showEasterEgg, setShowEasterEgg] = useState(false)

  // Load tasks from IndexedDB on mount
  useEffect(() => {
    async function loadTasks() {
      const stored = await getStoredTasks()
      const loadedTasks = stored.map(storedTaskToTask)
      setTasks(loadedTasks)
      setLoading(false)
      
      // Initialize notifications for all tasks with alarms
      const taskData = loadedTasks.map(t => ({
        id: t.id,
        title: t.title,
        alarm: t.alarm,
        repeats: t.repeats,
        completed: t.completed,
      }))
      
      // Initialize Capacitor notifications (for native)
      initializeNotifications(taskData)
      
      // Initialize web foreground reminders (for PWA)
      initializeForegroundReminders(taskData)
      
      // Hide splash screen after content is loaded
      if (Capacitor.isNativePlatform()) {
        SplashScreen.hide()
      }
    }
    
    loadTasks()
  }, [])

  // Handle hardware back button on Android
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handleBackButton = () => {
      // Close drawer if open
      if (drawerOpen) {
        setDrawerOpen(false);
        return;
      }

      // Navigate back based on current screen
      switch (currentScreen) {
        case 'detail':
          // Go back to completed or tasks based on selected task
          setCurrentScreen(selectedTask?.completed ? 'completed' : 'tasks');
          break;
        case 'add':
        case 'settings':
          setCurrentScreen('tasks');
          break;
        case 'calendar':
        case 'completed':
          setCurrentScreen('tasks');
          break;
        case 'tasks':
          // Exit app when on main screen
          App.exitApp();
          break;
      }
    };

    const listener = App.addListener('backButton', handleBackButton);

    return () => {
      listener.then(l => l.remove());
    };
  }, [currentScreen, drawerOpen, selectedTask]);

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task)
    setCurrentScreen("detail")
  }

  const handleNavigate = (screen: Screen) => {
    setCurrentScreen(screen)
    setDrawerOpen(false)
  }

  const handleAddTask = async (newTask: Omit<Task, "id" | "createdDate" | "lastEditedDate">, photoFile?: File) => {
    let photoBase64: string | undefined
    
    if (photoFile) {
      photoBase64 = await fileToBase64(photoFile)
    }
    
    const created = await createStoredTask({
      title: newTask.title || newTask.name,
      detail: newTask.detail,
      photo: photoBase64,
      alarm: newTask.alarm,
      repeats: newTask.repeats,
      dueDate: newTask.dueDate,
    })
    
    // Schedule notification if alarm is set
    if (newTask.alarm) {
      scheduleTaskNotification({
        id: created.id,
        title: created.title,
        alarm: created.alarm,
        repeats: created.repeats,
      })
      
      // Also start foreground reminder for PWA
      startForegroundReminder({
        id: created.id,
        title: created.title,
        alarm: created.alarm,
        repeats: created.repeats,
        dueDate: created.dueDate,
      })
    }
    
    setTasks([storedTaskToTask(created), ...tasks])
    setCurrentScreen("tasks")
    
    // Easter egg: Check if due date is December 20
    if (newTask.dueDate) {
      const dueDate = new Date(newTask.dueDate)
      if (dueDate.getMonth() === 11 && dueDate.getDate() === 20) {
        setShowEasterEgg(true)
      }
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    // Cancel any scheduled notifications for this task
    cancelTaskNotification(taskId)
    stopForegroundReminder(taskId)
    await deleteStoredTask(taskId)
    setTasks(tasks.filter((t) => t.id !== taskId))
  }

  const handleToggleComplete = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    
    const updated = await toggleStoredComplete(taskId)
    if (updated) {
      // Check current state BEFORE toggle to determine action
      if (!task.completed) {
        // Task WAS incomplete, now being marked as COMPLETE - cancel notification
        cancelTaskNotification(taskId)
        stopForegroundReminder(taskId)
      } else if (task.completed && task.alarm) {
        // Task WAS complete, now being marked as INCOMPLETE - reschedule notification
        scheduleTaskNotification({
          id: task.id,
          title: task.title,
          alarm: task.alarm,
          repeats: task.repeats,
        })
        startForegroundReminder({
          id: task.id,
          title: task.title,
          alarm: task.alarm,
          repeats: task.repeats,
          dueDate: task.dueDate,
        })
      }
      
      setTasks(tasks.map((t) => 
        t.id === taskId 
          ? { ...t, completed: !t.completed, lastEditedDate: new Date() } 
          : t
      ))
    }
  }

  const handleUpdateTask = async (taskId: string, updates: Partial<Task>) => {
    const storageUpdates: Partial<StoredTask> = {}
    if (updates.title) storageUpdates.title = updates.title
    if (updates.detail !== undefined) storageUpdates.detail = updates.detail
    if (updates.dueDate !== undefined) storageUpdates.dueDate = updates.dueDate
    if (updates.alarm !== undefined) storageUpdates.alarm = updates.alarm
    if (updates.repeats !== undefined) storageUpdates.repeats = updates.repeats
    
    await updateStoredTask(taskId, storageUpdates)
    
    // Update notification if alarm changed
    const task = tasks.find(t => t.id === taskId)
    if (task) {
      const newAlarm = updates.alarm !== undefined ? updates.alarm : task.alarm
      const newRepeats = updates.repeats !== undefined ? updates.repeats : task.repeats
      const newTitle = updates.title || task.title
      const newDueDate = updates.dueDate !== undefined ? updates.dueDate : task.dueDate
      
      if (newAlarm) {
        scheduleTaskNotification({
          id: taskId,
          title: newTitle,
          alarm: newAlarm,
          repeats: newRepeats,
        })
        startForegroundReminder({
          id: taskId,
          title: newTitle,
          alarm: newAlarm,
          repeats: newRepeats,
          dueDate: newDueDate,
        })
      } else {
        // Alarm was removed - cancel notification
        cancelTaskNotification(taskId)
        stopForegroundReminder(taskId)
      }
    }
    
    setTasks(tasks.map((t) => 
      t.id === taskId 
        ? { ...t, ...updates, lastEditedDate: new Date() } 
        : t
    ))
    
    if (selectedTask?.id === taskId) {
      setSelectedTask({ ...selectedTask, ...updates, lastEditedDate: new Date() })
    }
  }

  const handleReloadTasks = async () => {
    const stored = await getStoredTasks()
    const loadedTasks = stored.map(storedTaskToTask)
    setTasks(loadedTasks)
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--obsidian)] text-[var(--metal-bright)] flex items-center justify-center relative z-10">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="w-3 h-3 rounded-full bg-[var(--ember)]" style={{ animation: 'pulseGlow 2s ease-in-out infinite' }} />
          <div className="text-[var(--metal-muted)] text-sm font-light tracking-widest" style={{ fontFamily: 'var(--font-display)' }}>LOADING</div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-transparent text-[var(--metal-bright)] overflow-hidden" style={{ position: 'relative', zIndex: 1 }}>
      {/* Drawer Overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
      )}

      {/* Sliding Drawer */}
      <SlidingDrawer 
        isOpen={drawerOpen} 
        currentScreen={currentScreen} 
        onNavigate={handleNavigate}
      />

      {/* Main Content */}
      <div className="relative z-10">
        {currentScreen === "tasks" && (
          <TasksGridScreen
            tasks={tasks.filter((t) => !t.completed)}
            onTaskClick={handleTaskClick}
            onAddTask={() => setCurrentScreen("add")}
            onDeleteTask={handleDeleteTask}
            onOpenDrawer={() => setDrawerOpen(true)}
            onReorderTasks={async (reorderedTasks) => {
              // Combine reordered incomplete tasks with completed tasks
              const completedTasks = tasks.filter(t => t.completed)
              const allTasks = [...reorderedTasks, ...completedTasks]
              setTasks(allTasks)
              // Save to storage
              await saveStoredTasks(allTasks.map(t => ({
                id: t.id,
                title: t.title,
                detail: t.detail,
                photo: t.photo,
                completed: t.completed || false,
                createdAt: t.createdDate.toISOString(),
                updatedAt: t.lastEditedDate.toISOString(),
                alarm: t.alarm,
                repeats: t.repeats,
                dueDate: t.dueDate,
              })))
            }}
          />
        )}
        {currentScreen === "completed" && (
          <TasksGridScreen
            tasks={tasks.filter((t) => t.completed)}
            onTaskClick={handleTaskClick}
            onAddTask={() => setCurrentScreen("add")}
            onDeleteTask={handleDeleteTask}
            onOpenDrawer={() => setDrawerOpen(true)}
            isCompletedView={true}
          />
        )}
        {currentScreen === "calendar" && <CalendarScreen tasks={tasks} onOpenDrawer={() => setDrawerOpen(true)} onSelectTask={handleTaskClick} />}
        {currentScreen === "detail" && selectedTask && (
          <TaskDetailScreen
            task={selectedTask}
            onBack={() => setCurrentScreen(selectedTask.completed ? "completed" : "tasks")}
            onOpenDrawer={() => setDrawerOpen(true)}
            onToggleComplete={handleToggleComplete}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
          />
        )}
        {currentScreen === "add" && (
          <AddTaskScreen
            onSave={handleAddTask}
            onCancel={() => setCurrentScreen("tasks")}
            onOpenDrawer={() => setDrawerOpen(true)}
          />
        )}
        {currentScreen === "settings" && (
          <SettingsScreen
            tasks={tasks}
            onBack={() => setCurrentScreen("tasks")}
            onOpenDrawer={() => setDrawerOpen(true)}
            onDataImported={handleReloadTasks}
          />
        )}
      </div>

      {/* Easter Egg Modal - December 20 */}
      {showEasterEgg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="relative">
            <button
              onClick={() => setShowEasterEgg(false)}
              className="absolute -top-3 -right-3 w-10 h-10 rounded-full bg-[var(--forge-red)] text-white flex items-center justify-center shadow-lg hover:brightness-110 active:scale-95 transition-all z-10"
            >
              ✕
            </button>
            <img 
              src="/easter-egg.png" 
              alt="Easter Egg" 
              className="max-w-[80vw] max-h-[80vh] rounded-lg shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  )
}
