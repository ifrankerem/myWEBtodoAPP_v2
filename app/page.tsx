"use client"

import { useState, useEffect, useRef } from "react"
import TasksGridScreen from "@/components/tasks-grid-screen"
import CalendarScreen from "@/components/calendar-screen"
import TaskDetailScreen from "@/components/task-detail-screen"
import AddTaskScreen from "@/components/add-task-screen"
import SlidingDrawer from "@/components/sliding-drawer"
import SettingsScreen from "@/components/settings-screen"
import LoginScreen from "@/components/login-screen"
import { XpHeader, XpStatusBar } from "@/components/xp-ui"
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
  type CloudTaskUpdates,
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
import { parseTaskDate } from '@/lib/task-dates'

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

function LoadingScreen({ label }: { label: string }) {
  return (
    <section className="xp-screen" aria-live="polite" aria-busy="true">
      <XpHeader title="Starting" />
      <main className="xp-content grid place-items-center">
        <div className="xp-loading-dialog">
          <strong>Task Manager</strong>
          <p>{label}...</p>
          <div className="xp-progress" aria-hidden="true"><span /></div>
        </div>
      </main>
      <XpStatusBar><span className="flex-1">Please wait</span></XpStatusBar>
    </section>
  )
}

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
  const [calendarDueDate, setCalendarDueDate] = useState<string | undefined>(undefined)
  const [returnScreen, setReturnScreen] = useState<Screen>("tasks")
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const migrationDoneRef = useRef(false)

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
      if (!migrationDoneRef.current) {
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
        migrationDoneRef.current = true
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
          dueDate: t.dueDate,
          completed: t.completed,
        }))
        
        initializeNotifications(taskData)
        initializeForegroundReminders(taskData)
      }, () => {
        // Avoid trapping the user on the loading screen when Firestore is unavailable.
        setLoading(false)
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
          setCurrentScreen(returnScreen);
          break;
        case 'add':
        case 'settings':
          setCurrentScreen(returnScreen);
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
  }, [currentScreen, drawerOpen, returnScreen]);

  const handleTaskClick = (task: Task) => {
    setReturnScreen(currentScreen)
    setSelectedTask(task)
    setCurrentScreen("detail")
  }

  const handleNavigate = (screen: Screen) => {
    if (screen === "settings") setReturnScreen(currentScreen)
    setCurrentScreen(screen)
    setDrawerOpen(false)
  }

  const handleAddTask = async (newTask: Omit<Task, "id" | "createdDate" | "lastEditedDate">, photoFile?: File) => {
    if (!user) return

    // Navigate back immediately so offline doesn't block the UI
    setCurrentScreen(returnScreen)

    // Easter egg: Check if due date is December 20
    if (newTask.dueDate) {
      const dueDate = parseTaskDate(newTask.dueDate)
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
            dueDate: created.dueDate,
          })
          
          startForegroundReminder({
            id: created.id,
            title: created.title,
            alarm: created.alarm,
            repeats: created.repeats,
            dueDate: created.dueDate,
          })
        }

        // Add birthday task automatically if December 20
        if (newTask.dueDate) {
          const dueDate = parseTaskDate(newTask.dueDate)
          if (dueDate.getMonth() === 11 && dueDate.getDate() === 20) {
            const hasBirthdayTask = tasks.some(
              (t) => t.title === "İrfan Kerem Arslan DOGUM GÜNÜ" && t.dueDate === newTask.dueDate
            )
            if (!hasBirthdayTask) {
              await createCloudTask(user.uid, {
                title: "İrfan Kerem Arslan DOGUM GÜNÜ",
                dueDate: newTask.dueDate,
              })
            }
          }
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
        dueDate: task.dueDate,
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
    
    const storageUpdates: CloudTaskUpdates = {}
    if (updates.title) storageUpdates.title = updates.title
    if ('detail' in updates) storageUpdates.detail = updates.detail ?? null
    if ('photo' in updates) storageUpdates.photo = updates.photo ?? null
    if ('dueDate' in updates) storageUpdates.dueDate = updates.dueDate ?? null
    if ('alarm' in updates) storageUpdates.alarm = updates.alarm ?? null
    if ('repeats' in updates) storageUpdates.repeats = updates.repeats ?? null
    
    await updateCloudTask(user.uid, taskId, storageUpdates)
    
    // Update notification if alarm changed
    const task = tasks.find(t => t.id === taskId)
    if (task) {
      const newAlarm = 'alarm' in updates ? updates.alarm : task.alarm
      const newRepeats = 'repeats' in updates ? updates.repeats : task.repeats
      const newTitle = updates.title || task.title
      const newDueDate = 'dueDate' in updates ? updates.dueDate : task.dueDate
      
      if (newAlarm) {
        scheduleTaskNotification({
          id: taskId,
          title: newTitle,
          alarm: newAlarm,
          repeats: newRepeats,
          dueDate: newDueDate,
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
    return <LoadingScreen label="Loading your account" />
  }

  // Show login screen if not authenticated
  if (!user) {
    return <LoginScreen />
  }

  // Loading tasks state
  if (loading) {
    return <LoadingScreen label="Synchronizing tasks" />
  }

  return (
    <div className="xp-app-shell">
      {/* Drawer Overlay */}
      {drawerOpen && (
        <button
          type="button"
          className="xp-drawer-overlay"
          aria-label="Close menu"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Sliding Drawer */}
      <SlidingDrawer 
        isOpen={drawerOpen} 
        currentScreen={currentScreen} 
        onNavigate={handleNavigate}
      />

      {/* Main Content */}
      <div className="relative z-10 h-full">
        {currentScreen === "tasks" && (
          <TasksGridScreen
            tasks={tasks.filter((t) => !t.completed)}
            onTaskClick={handleTaskClick}
            onAddTask={() => {
              setReturnScreen("tasks")
              setCurrentScreen("add")
            }}
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
            onAddTask={() => {
              setReturnScreen("completed")
              setCurrentScreen("add")
            }}
            onDeleteTask={handleDeleteTask}
            onOpenDrawer={() => setDrawerOpen(true)}
            isCompletedView={true}
          />
        )}
        {currentScreen === "calendar" && (
          <CalendarScreen 
            tasks={tasks} 
            onOpenDrawer={() => setDrawerOpen(true)} 
            onSelectTask={handleTaskClick}
            onAddTask={(date) => {
              setCalendarDueDate(date)
              setReturnScreen("calendar")
              setCurrentScreen("add")
            }}
          />
        )}
        {currentScreen === "detail" && selectedTask && (
          <TaskDetailScreen
            task={selectedTask}
            onBack={() => setCurrentScreen(returnScreen)}
            onOpenDrawer={() => setDrawerOpen(true)}
            onToggleComplete={handleToggleComplete}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
          />
        )}
        {currentScreen === "add" && (
          <AddTaskScreen
            onSave={(task, photoFile) => {
              setCalendarDueDate(undefined)
              handleAddTask(task, photoFile)
            }}
            onCancel={() => {
              setCalendarDueDate(undefined)
              setCurrentScreen(returnScreen)
            }}
            onOpenDrawer={() => setDrawerOpen(true)}
            initialDueDate={calendarDueDate}
          />
        )}
        {currentScreen === "settings" && (
          <SettingsScreen
            tasks={tasks}
            onBack={() => setCurrentScreen(returnScreen)}
            onOpenDrawer={() => setDrawerOpen(true)}
            onDataImported={handleReloadTasks}
          />
        )}
      </div>

      {/* Easter Egg Modal - December 20 */}
      {showEasterEgg && (
        <div className="xp-modal-backdrop">
          <div className="xp-dialog" role="dialog" aria-modal="true" aria-label="December 20">
            <div className="xp-titlebar">
              <div className="xp-titlebar-caption">December 20</div>
              <button type="button" className="xp-dialog-close" onClick={() => setShowEasterEgg(false)} aria-label="Close">✕</button>
            </div>
            <div className="xp-dialog-body">
            <img 
              src="/easter-egg.png" 
              alt="Easter Egg" 
              className="max-w-[80vw] max-h-[72vh] object-contain"
            />
            </div>
            <div className="xp-actionbar"><button type="button" className="xp-button" onClick={() => setShowEasterEgg(false)}>OK</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
