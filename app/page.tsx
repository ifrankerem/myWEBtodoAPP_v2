"use client"

import { useState, useEffect, useRef } from "react"
import TasksGridScreen from "@/components/tasks-grid-screen"
import CalendarScreen from "@/components/calendar-screen"
import TaskDetailScreen from "@/components/task-detail-screen"
import AddTaskScreen from "@/components/add-task-screen"
import SlidingDrawer from "@/components/sliding-drawer"
import SettingsScreen from "@/components/settings-screen"
import LoginScreen from "@/components/login-screen"
import { useAuth } from "@/lib/auth-context"
import { 
  getTasks as getLocalTasks, 
  fileToBase64,
  type TaskRecord as StoredTask 
} from "@/lib/storage-idb"
import {
  subscribeToTasks,
  createCloudTask,
  updateCloudTask,
  deleteCloudTask,
  toggleCloudTaskComplete,
  saveCloudTasks,
  migrateLocalToCloud,
} from "@/lib/storage-cloud"
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
  photo?: string | null
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
  const { user, loading: authLoading } = useAuth()
  const [currentScreen, setCurrentScreen] = useState<Screen>("tasks")
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [showEasterEgg, setShowEasterEgg] = useState(false)
  const [migrationDone, setMigrationDone] = useState(false)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  // Subscribe to cloud tasks when user is signed in
  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setLoading(false)
      setTasks([])
      // Cleanup previous subscription
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
      return
    }

    // Migrate local data to cloud on first sign-in
    async function migrateAndSubscribe() {
      if (!user) return

      // One-time migration from IndexedDB to Firestore
      if (!migrationDone) {
        try {
          const localTasks = await getLocalTasks()
          if (localTasks.length > 0) {
            const result = await migrateLocalToCloud(user.uid, localTasks)
            if (result.migrated > 0) {
              console.log(`Migrated ${result.migrated} tasks to cloud`)
            }
          }
        } catch (err) {
          console.error('Migration error:', err)
        }
        setMigrationDone(true)
      }

      // Subscribe to real-time cloud updates
      const unsubscribe = subscribeToTasks(user.uid, (cloudTasks) => {
        const loadedTasks = cloudTasks.map(storedTaskToTask)
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
        
        initializeNotifications(taskData)
        initializeForegroundReminders(taskData)
      })

      unsubscribeRef.current = unsubscribe

      // Hide splash screen after content is loaded
      if (Capacitor.isNativePlatform()) {
        SplashScreen.hide()
      }
    }

    migrateAndSubscribe()

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
    }
  }, [user, authLoading])

  // Handle hardware back button on Android
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handleBackButton = () => {
      if (drawerOpen) {
        setDrawerOpen(false);
        return;
      }

      switch (currentScreen) {
        case 'detail':
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
    if (!user) return

    // Navigate back immediately so offline doesn't block the UI
    setCurrentScreen("tasks")

    // Easter egg: Check if due date is December 20
    if (newTask.dueDate) {
      const dueDate = new Date(newTask.dueDate)
      if (dueDate.getMonth() === 11 && dueDate.getDate() === 20) {
        setShowEasterEgg(true)
      }
    }

    // Fire-and-forget: Firestore will queue offline writes automatically
    ;(async () => {
      try {
        let photoBase64: string | undefined
        
        if (photoFile) {
          photoBase64 = await fileToBase64(photoFile)
        }
        
        const created = await createCloudTask(user.uid, {
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
          
          startForegroundReminder({
            id: created.id,
            title: created.title,
            alarm: created.alarm,
            repeats: created.repeats,
            dueDate: created.dueDate,
          })
        }
      } catch (err) {
        console.error('Error creating task:', err)
      }
    })()
  }

  const handleDeleteTask = async (taskId: string) => {
    if (!user) return
    cancelTaskNotification(taskId)
    stopForegroundReminder(taskId)
    await deleteCloudTask(user.uid, taskId)
  }

  const handleToggleComplete = async (taskId: string) => {
    if (!user) return
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    
    await toggleCloudTaskComplete(user.uid, taskId, task.completed || false)
    
    if (!task.completed) {
      cancelTaskNotification(taskId)
      stopForegroundReminder(taskId)
    } else if (task.completed && task.alarm) {
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
  }

  const handleUpdateTask = async (taskId: string, updates: Partial<Task>) => {
    if (!user) return
    
    const storageUpdates: Partial<StoredTask> = {}
    if (updates.title) storageUpdates.title = updates.title
    if (updates.detail !== undefined) storageUpdates.detail = updates.detail
    if ('photo' in updates) storageUpdates.photo = updates.photo || undefined
    if (updates.dueDate !== undefined) storageUpdates.dueDate = updates.dueDate
    if (updates.alarm !== undefined) storageUpdates.alarm = updates.alarm
    if (updates.repeats !== undefined) storageUpdates.repeats = updates.repeats
    
    await updateCloudTask(user.uid, taskId, storageUpdates)
    
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
        cancelTaskNotification(taskId)
        stopForegroundReminder(taskId)
      }
    }
    
    // Update local state immediately for responsiveness
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
    // No-op: real-time subscription handles this automatically
  }

  // Auth loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[var(--obsidian)] text-[var(--metal-bright)] flex items-center justify-center relative z-10">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="w-3 h-3 rounded-full bg-[var(--ember)]" style={{ animation: 'pulseGlow 2s ease-in-out infinite' }} />
          <div className="text-[var(--metal-muted)] text-sm font-light tracking-widest" style={{ fontFamily: 'var(--font-display)' }}>LOADING</div>
        </div>
      </div>
    )
  }

  // Show login screen if not authenticated
  if (!user) {
    return <LoginScreen />
  }

  // Loading tasks state
  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--obsidian)] text-[var(--metal-bright)] flex items-center justify-center relative z-10">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="w-3 h-3 rounded-full bg-[var(--ember)]" style={{ animation: 'pulseGlow 2s ease-in-out infinite' }} />
          <div className="text-[var(--metal-muted)] text-sm font-light tracking-widest" style={{ fontFamily: 'var(--font-display)' }}>SYNCING</div>
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
              if (!user) return
              const completedTasks = tasks.filter(t => t.completed)
              const allTasks = [...reorderedTasks, ...completedTasks]
              setTasks(allTasks)
              await saveCloudTasks(user.uid, allTasks.map(t => ({
                id: t.id,
                title: t.title,
                detail: t.detail,
                photo: t.photo || undefined,
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
