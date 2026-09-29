"use client"

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react"
import TasksGridScreen from "@/components/tasks-grid-screen"
import CalendarScreen from "@/components/calendar-screen"
import TaskDetailScreen from "@/components/task-detail-screen"
import AddTaskScreen from "@/components/add-task-screen"
import StartMenu from "@/components/start-menu"
import SettingsScreen from "@/components/settings-screen"
import LoginScreen from "@/components/login-screen"
import type { XpIconName } from "@/components/xp-icons"
import {
  animateGhost,
  prefersReducedMotion,
  WindowControlsProvider,
  XpBalloon,
  XpCopyDialog,
  XpDialog,
} from "@/components/xp-ui"
import {
  BootScreen,
  DesktopIcons,
  LogOffDialog,
  RemindersDialog,
  Taskbar,
  Wallpaper,
  WelcomeScreen,
} from "@/components/xp-shell"
import { useAuth } from "@/lib/auth-context"
import { getTasks as getLocalTasks, fileToBase64 } from "@/lib/storage-idb"
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
  onAlarmNotificationTap,
  scheduleTaskNotification,
  cancelTaskNotification,
} from "@/lib/notifications"
import {
  initializeForegroundReminders,
  startForegroundReminder,
  stopForegroundReminder,
} from "@/lib/web-notifications"
import { syncAlarmSchedule } from "@/lib/alarm-sync"
import { refreshPushSubscription } from "@/lib/push-subscription"
import {
  dismissMissedAlarms,
  subscribeToMissedAlarms,
  type MissedAlarm,
} from "@/lib/missed-alarms"
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
import { parseTaskDate } from '@/lib/task-dates'
import { storedTaskToTask, type Screen, type Task } from '@/lib/task'
import { daysFromToday } from '@/lib/task-display'


const WINDOW_INFO: Record<Screen, { title: string; icon: XpIconName }> = {
  tasks: { title: "My Tasks", icon: "folderTasks" },
  completed: { title: "Completed", icon: "folderDone" },
  calendar: { title: "Calendar", icon: "calendar" },
  settings: { title: "Settings", icon: "gear" },
  add: { title: "New Task", icon: "newTask" },
  detail: { title: "Properties", icon: "doc" },
}

/** How long the Explorer-style copy dialog shows after Save Task. */
const SAVE_ANIMATION_MS = 1300

export default function Page() {
  const { user, loading: authLoading, signOut } = useAuth()
  const [currentScreen, setCurrentScreen] = useState<Screen>("tasks")
  const [startOpen, setStartOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [windowed, setWindowed] = useState(false)
  const [logOffOpen, setLogOffOpen] = useState(false)
  const [remindersOpen, setRemindersOpen] = useState(false)
  const [balloonClosed, setBalloonClosed] = useState(false)
  const [savingTitle, setSavingTitle] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<"general" | "reminder">("general")
  // Where the next window-open animation starts (start button, desktop icon, task tile).
  const openOriginRef = useRef<DOMRect | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [showEasterEgg, setShowEasterEgg] = useState(false)
  const [calendarDueDate, setCalendarDueDate] = useState<string | undefined>(undefined)
  const [returnScreen, setReturnScreen] = useState<Screen>("tasks")
  const [missedAlarms, setMissedAlarms] = useState<MissedAlarm[]>([])
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const migrationDoneRef = useRef(false)
  // Task id from a ?task=<id> notification deep link, held until tasks load.
  const pendingTaskIdRef = useRef<string | null>(null)

  // Read the deep link once, before the task list arrives. The URL is cleaned
  // immediately so a refresh does not keep reopening the same task.
  useEffect(() => {
    const taskId = new URLSearchParams(window.location.search).get("task")
    if (!taskId) return

    pendingTaskIdRef.current = taskId
    const url = new URL(window.location.href)
    url.searchParams.delete("task")
    window.history.replaceState({}, "", url.pathname + url.search + url.hash)
  }, [])

  // Native alarm tapped. Cold starts deliver this before tasks load, so it
  // goes through the same pending ref as the ?task= deep link.
  useEffect(() => {
    return onAlarmNotificationTap((taskId) => {
      pendingTaskIdRef.current = taskId
      setTasks((current) => [...current])
    })
  }, [])

  // Once tasks are loaded, open the one the notification pointed at.
  useEffect(() => {
    const taskId = pendingTaskIdRef.current
    if (!taskId || tasks.length === 0) return

    const target = tasks.find((task) => task.id === taskId)
    pendingTaskIdRef.current = null
    if (!target) return

    setSelectedTask(target)
    setReturnScreen("tasks")
    setCurrentScreen("detail")
  }, [tasks])

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
          repeatRule: t.repeatRule,
          dueDate: t.dueDate,
          completed: t.completed,
        }))
        
        initializeNotifications(taskData)
        initializeForegroundReminders(taskData)

        // Foreground timers die the moment iOS suspends the PWA, so mirror the
        // schedule to Firestore and let the push worker deliver it instead.
        syncAlarmSchedule(user.uid, taskData).catch((err) => {
          console.error('Alarm schedule sync failed:', err)
        })
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

  // Alarms the worker judged too late to deliver. Reported once so a missed
  // reminder is never silently dropped.
  useEffect(() => {
    if (!user) {
      setMissedAlarms([])
      return
    }
    return subscribeToMissedAlarms(user.uid, setMissedAlarms)
  }, [user])

  // Keep the stored push endpoint fresh — iOS rotates endpoints, and the
  // worker can only reach devices it finds in Firestore.
  useEffect(() => {
    if (!user) return

    refreshPushSubscription(user.uid)

    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'pushsubscriptionchange') {
        refreshPushSubscription(user.uid)
      }

      // Notification tapped while the app was already open.
      if (event.data?.type === 'open-task' && typeof event.data.taskId === 'string') {
        pendingTaskIdRef.current = event.data.taskId
        setTasks((current) => [...current])
      }
    }

    navigator.serviceWorker.addEventListener('message', handleMessage)
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage)
  }, [user])

  // Open a window. With an origin element, the XP "zoom rectangle" grows from it.
  const navigate = useCallback((screen: Screen, origin?: Element | null) => {
    openOriginRef.current = origin && !prefersReducedMotion() ? origin.getBoundingClientRect() : null
    setStartOpen(false)
    setMinimized(false)
    setCurrentScreen(screen)
  }, [])

  useLayoutEffect(() => {
    const origin = openOriginRef.current
    openOriginRef.current = null
    if (!origin || minimized) return
    const win = document.querySelector<HTMLElement>("[data-xp-window]")
    if (!win) return
    win.classList.add("is-hidden")
    animateGhost({ x: origin.left, y: origin.top, w: origin.width, h: origin.height }, win).finally(() => {
      win.classList.remove("is-hidden")
    })
  }, [currentScreen, minimized])

  const minimize = useCallback(async () => {
    const win = document.querySelector<HTMLElement>("[data-xp-window]")
    const button = document.querySelector("[data-xp-winbtn]")
    if (win && button) {
      win.classList.add("is-hidden")
      await animateGhost(win, button, 210)
    }
    setStartOpen(false)
    setMinimized(true)
  }, [])

  // Handle hardware back button on Android
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handleBackButton = () => {
      if (startOpen) {
        setStartOpen(false);
        return;
      }
      if (logOffOpen || remindersOpen) {
        setLogOffOpen(false);
        setRemindersOpen(false);
        return;
      }
      if (minimized) {
        App.exitApp();
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
  }, [currentScreen, startOpen, logOffOpen, remindersOpen, minimized, returnScreen]);

  const handleTaskClick = (task: Task, origin?: Element) => {
    setReturnScreen(currentScreen === "detail" || currentScreen === "add" ? returnScreen : currentScreen)
    setSelectedTask(task)
    setDetailTab("general")
    navigate("detail", origin)
  }

  const handleNavigate = (screen: Screen, origin?: Element | null) => {
    if (screen === "settings" || screen === "add") {
      setReturnScreen(currentScreen === "detail" || currentScreen === "add" || currentScreen === "settings" ? returnScreen : currentScreen)
    }
    navigate(screen, origin)
  }

  const handleAddTask = async (newTask: Omit<Task, "id" | "createdDate" | "lastEditedDate">, photoFile?: File) => {
    if (!user) return

    // Navigate back immediately so offline doesn't block the UI
    setCurrentScreen(returnScreen)
    setSavingTitle(newTask.title)
    window.setTimeout(() => setSavingTitle(null), prefersReducedMotion() ? 0 : SAVE_ANIMATION_MS)

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
          title: newTask.title,
          detail: newTask.detail,
          photo: photoBase64,
          alarm: newTask.alarm,
          repeats: newTask.repeats,
          repeatRule: newTask.repeatRule,
          dueDate: newTask.dueDate,
        })
        
        // Schedule notification if alarm is set
        if (newTask.alarm) {
          scheduleTaskNotification({
            id: created.id,
            title: created.title,
            alarm: created.alarm,
            repeats: created.repeats,
            repeatRule: created.repeatRule,
            dueDate: created.dueDate,
          })
          
          startForegroundReminder({
            id: created.id,
            title: created.title,
            alarm: created.alarm,
            repeats: created.repeats,
            repeatRule: created.repeatRule,
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
        repeatRule: task.repeatRule,
        dueDate: task.dueDate,
      })
      startForegroundReminder({
        id: task.id,
        title: task.title,
        alarm: task.alarm,
        repeats: task.repeats,
        repeatRule: task.repeatRule,
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
    if ('repeatRule' in updates) storageUpdates.repeatRule = updates.repeatRule ?? null
    
    await updateCloudTask(user.uid, taskId, storageUpdates)
    
    // Update notification if alarm changed
    const task = tasks.find(t => t.id === taskId)
    if (task) {
      const newAlarm = 'alarm' in updates ? updates.alarm : task.alarm
      const newRepeats = 'repeats' in updates ? updates.repeats : task.repeats
      const newRepeatRule = 'repeatRule' in updates ? updates.repeatRule : task.repeatRule
      const newTitle = updates.title || task.title
      const newDueDate = 'dueDate' in updates ? updates.dueDate : task.dueDate
      
      if (newAlarm) {
        scheduleTaskNotification({
          id: taskId,
          title: newTitle,
          alarm: newAlarm,
          repeats: newRepeats,
          repeatRule: newRepeatRule,
          dueDate: newDueDate,
        })
        startForegroundReminder({
          id: taskId,
          title: newTitle,
          alarm: newAlarm,
          repeats: newRepeats,
          repeatRule: newRepeatRule,
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
    return <BootScreen />
  }

  // Show login screen if not authenticated
  if (!user) {
    return <LoginScreen />
  }

  // Loading tasks state
  if (loading) {
    return <WelcomeScreen message="Syncing your tasks…" />
  }

  const handleMissedAlarmClick = (missed: MissedAlarm) => {
    const target = tasks.find((task) => task.id === missed.taskId)
    setRemindersOpen(false)
    if (!target) return
    setReturnScreen("tasks")
    setSelectedTask(target)
    setDetailTab("reminder")
    navigate("detail")
  }

  const handleLogOff = async () => {
    setLogOffOpen(false)
    try {
      await signOut()
    } catch (err) {
      console.error('Sign out failed:', err)
    }
  }

  const openLogOff = () => {
    setStartOpen(false)
    setLogOffOpen(true)
  }

  const openTasks = tasks.filter((t) => !t.completed)
  const counts = {
    open: openTasks.length,
    dueThisWeek: openTasks.filter((t) => {
      if (!t.dueDate) return false
      const days = daysFromToday(parseTaskDate(t.dueDate))
      return days >= 0 && days < 7
    }).length,
    done: tasks.length - openTasks.length,
  }

  const info = WINDOW_INFO[currentScreen]
  const windowTitle = currentScreen === "detail" && selectedTask ? `${selectedTask.title} Properties` : info.title
  const showBalloon = missedAlarms.length > 0 && !balloonClosed && !remindersOpen

  const goBackToTasks = () => setCurrentScreen("tasks")

  return (
    <WindowControlsProvider
      value={{
        windowed,
        onMinimize: minimize,
        onToggleWindowed: () => setWindowed((value) => !value),
        onClose: () => (currentScreen === "tasks" ? minimize() : setCurrentScreen("tasks")),
      }}
    >
      <div className={`xp-shell${logOffOpen ? " is-gray" : ""}`}>
        <Wallpaper />

        {minimized ? (
          <DesktopIcons onOpen={(screen, origin) => handleNavigate(screen, origin)} />
        ) : (
          <>
            {currentScreen === "tasks" && (
              <TasksGridScreen
                tasks={openTasks}
                onTaskClick={handleTaskClick}
                onAddTask={() => {
                  setReturnScreen("tasks")
                  navigate("add")
                }}
                onDeleteTask={handleDeleteTask}
                onToggleComplete={handleToggleComplete}
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
                    repeatRule: t.repeatRule,
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
                  navigate("add")
                }}
                onDeleteTask={handleDeleteTask}
                onToggleComplete={handleToggleComplete}
                onBack={goBackToTasks}
                isCompletedView={true}
              />
            )}
            {currentScreen === "calendar" && (
              <CalendarScreen
                tasks={tasks}
                onBack={goBackToTasks}
                onSelectTask={handleTaskClick}
                onAddTask={(date) => {
                  setCalendarDueDate(date)
                  setReturnScreen("calendar")
                  navigate("add")
                }}
              />
            )}
            {currentScreen === "detail" && selectedTask && (
              <TaskDetailScreen
                task={selectedTask}
                initialTab={detailTab}
                onBack={() => setCurrentScreen(returnScreen)}
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
                initialDueDate={calendarDueDate}
              />
            )}
            {currentScreen === "settings" && (
              <SettingsScreen
                tasks={tasks}
                onBack={() => setCurrentScreen(returnScreen)}
                onLogOff={openLogOff}
                onDataImported={handleReloadTasks}
              />
            )}
          </>
        )}

        <Taskbar
          startOpen={startOpen}
          onStart={() => setStartOpen((open) => !open)}
          windowButton={{ title: windowTitle, icon: info.icon, active: !minimized }}
          onWindowButton={() => (minimized ? navigate(currentScreen, document.querySelector("[data-xp-winbtn]")) : minimize())}
          missedCount={missedAlarms.length}
          onReminders={() => {
            setStartOpen(false)
            setRemindersOpen(true)
          }}
        />

        {startOpen && (
          <StartMenu
            email={user.email ?? "Signed in"}
            currentScreen={currentScreen}
            counts={counts}
            onNavigate={(screen) => handleNavigate(screen, document.querySelector("[data-xp-start]"))}
            onNewTask={() => {
              setReturnScreen(currentScreen === "detail" || currentScreen === "add" ? returnScreen : currentScreen)
              navigate("add", document.querySelector("[data-xp-start]"))
            }}
            onShowReminders={() => {
              setStartOpen(false)
              setRemindersOpen(true)
            }}
            onLogOff={openLogOff}
            onClose={() => setStartOpen(false)}
          />
        )}

        {showBalloon && (
          <XpBalloon
            title={missedAlarms.length === 1 ? "Missed reminder" : `${missedAlarms.length} missed reminders`}
            onOpen={() => setRemindersOpen(true)}
            onClose={() => setBalloonClosed(true)}
          >
            {missedAlarms.length === 1
              ? `“${missedAlarms[0].title}” rang while Task Manager was closed. Tap to review it.`
              : "Some alarms rang while Task Manager was closed. Tap to review them."}
          </XpBalloon>
        )}

        {remindersOpen && (
          <RemindersDialog
            missed={missedAlarms}
            onOpenTask={handleMissedAlarmClick}
            onDismissAll={() => {
              setRemindersOpen(false)
              if (user) dismissMissedAlarms(user.uid)
            }}
            onClose={() => setRemindersOpen(false)}
          />
        )}

        {savingTitle !== null && <XpCopyDialog title={savingTitle} />}

        {/* Easter Egg Modal - December 20 */}
        {showEasterEgg && (
          <XpDialog
            title="December 20"
            icon="info"
            onClose={() => setShowEasterEgg(false)}
            maxWidth={560}
            buttons={<button type="button" className="xp-btn is-default" onClick={() => setShowEasterEgg(false)}>OK</button>}
          >
            <div className="xp-photo-view">
              <img src="/easter-egg.png" alt="Easter Egg" />
            </div>
          </XpDialog>
        )}
      </div>

      {logOffOpen && <LogOffDialog onLogOff={handleLogOff} onCancel={() => setLogOffOpen(false)} />}
    </WindowControlsProvider>
  )
}
