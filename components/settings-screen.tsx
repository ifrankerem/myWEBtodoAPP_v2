"use client"

import { useEffect, useState } from "react"
import type { Task } from "@/lib/task"
import { exportAllAlarmsToICS } from "@/lib/calendar-export"
import { saveTextFile } from "@/lib/save-file"
import { isWebNotificationSupported, requestWebNotificationPermission } from "@/lib/web-notifications"
import {
  disablePush,
  enablePush,
  getPushEnvironment,
  isPushEnabled,
  type PushBlockReason,
} from "@/lib/push-subscription"
import { useAuth } from "@/lib/auth-context"
import { Capacitor } from "@capacitor/core"
import {
  canScheduleExactAlarms,
  checkNativeNotificationPermission,
  openExactAlarmSettings,
  requestNotificationPermissions,
} from "@/lib/notifications"
import { createCloudTask } from "@/lib/storage-cloud"
import { XpIcon } from "@/components/xp-icons"
import {
  SCHEMES,
  useScheme,
  XpDialog,
  XpMessage,
  XpStatusBar,
  XpSynced,
  XpToolbar,
  XpToolButton,
  XpWindow,
} from "@/components/xp-ui"

interface SettingsScreenProps {
  tasks: Task[]
  onBack: () => void
  onLogOff: () => void
  onDataImported: () => void
}

type NotificationStatus = NotificationPermission | "not-supported" | "checking"
type ImportResult = { success: boolean; message: string }
type PushState = "checking" | "on" | "off" | "blocked"

const PUSH_BLOCK_COPY: Record<PushBlockReason, string> = {
  "ios-needs-home-screen":
    "On iPhone and iPad, background alarms only work once the app is installed: tap Share, then Add to Home Screen, and open it from there.",
  "ios-too-old": "Background alarms need iOS 16.4 or newer.",
  "unsupported-browser": "This browser does not support background push notifications.",
  "missing-vapid-key": "Push is not configured on this deployment (NEXT_PUBLIC_VAPID_PUBLIC_KEY is missing).",
  "permission-denied": "Notifications are blocked. Enable them for this app in the system settings.",
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === "string" && value.length > 0 ? value : undefined
}

type NativeAlarmStatus = {
  permission: "granted" | "denied" | "prompt"
  exact: boolean
}

// The Android app schedules alarms with the OS alarm manager, so the Web Push
// and web notification controls do not apply. This shows what the OS allows.
function NativeAlarmSettings() {
  const [status, setStatus] = useState<NativeAlarmStatus | null>(null)

  const refresh = async () => {
    const [permission, exact] = await Promise.all([checkNativeNotificationPermission(), canScheduleExactAlarms()])
    setStatus({ permission, exact })
  }

  useEffect(() => {
    refresh().catch((error) => console.error("Could not read alarm permissions:", error))
  }, [])

  const handleAllowNotifications = async () => {
    await requestNotificationPermissions()
    await refresh()
  }

  const handleAllowExact = async () => {
    await openExactAlarmSettings().catch(() => false)
    await refresh()
  }

  const notificationCopy = status === null
    ? "Checking this device..."
    : status.permission === "granted"
      ? "On. Alarms ring even when the app is closed."
      : status.permission === "denied"
        ? "Blocked. Turn on notifications for Task Manager in Android settings."
        : "Allow notifications so alarms can ring."

  return (
    <>
      <div className="xp-setting-row">
        <div><strong>Alarm notifications</strong><p>{notificationCopy}</p></div>
        {status?.permission === "granted" && <StatusOk />}
        {status?.permission === "prompt" && <button type="button" className="xp-btn is-small" onClick={handleAllowNotifications}>Allow</button>}
      </div>
      <div className="xp-setting-row">
        <div>
          <strong>Exact alarm timing</strong>
          <p>{status === null ? "Checking..." : status.exact ? "Alarms ring on the exact minute." : "Off. Android may delay alarms by several minutes."}</p>
        </div>
        {status?.exact && <StatusOk />}
        {status && !status.exact && <button type="button" className="xp-btn is-small" onClick={handleAllowExact}>Allow</button>}
      </div>
    </>
  )
}

function StatusOk() {
  return <span className="xp-status-ok"><XpIcon name="check" size={14} /> On</span>
}

function Appearance() {
  const { scheme, changeScheme } = useScheme()
  return (
    <>
      <div className="xp-monitor" aria-hidden="true">
        <div className="xp-mon-screen"><span className="xp-mon-hill" /><span className="xp-mon-win" /><span className="xp-mon-bar" /></div>
        <div className="xp-mon-stand" />
        <div className="xp-mon-base" />
      </div>
      <div className="xp-radios" role="radiogroup" aria-label="Color scheme">
        {SCHEMES.map(({ theme, label }) => (
          <label key={theme} className="xp-rb">
            <input type="radio" name="color-scheme" value={theme} checked={scheme === theme} onChange={() => changeScheme(theme)} />
            <i aria-hidden="true" />
            {label}
          </label>
        ))}
      </div>
    </>
  )
}

export default function SettingsScreen({ tasks, onBack, onLogOff, onDataImported }: SettingsScreenProps) {
  const { user } = useAuth()
  const [notificationStatus, setNotificationStatus] = useState<NotificationStatus>("checking")
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [pushState, setPushState] = useState<PushState>("checking")
  const [pushBlockedBy, setPushBlockedBy] = useState<PushBlockReason | null>(null)
  const [pushBusy, setPushBusy] = useState(false)

  useEffect(() => {
    setNotificationStatus(isWebNotificationSupported() ? Notification.permission : "not-supported")
  }, [])

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return
    let cancelled = false

    const environment = getPushEnvironment()
    if (environment.blockedBy) {
      setPushBlockedBy(environment.blockedBy)
      setPushState("blocked")
      return
    }

    isPushEnabled().then((enabled) => {
      if (cancelled) return
      setPushBlockedBy(null)
      setPushState(enabled ? "on" : "off")
    })

    return () => {
      cancelled = true
    }
  }, [])

  const showResult = (result: ImportResult) => {
    setImportResult(result)
  }

  const handleExportData = async () => {
    try {
      await saveTextFile(
        `task-manager-backup-${new Date().toISOString().split("T")[0]}.json`,
        JSON.stringify(tasks, null, 2),
        "application/json",
      )
    } catch (error) {
      console.error("Export failed:", error)
      showResult({ success: false, message: "Could not export the backup." })
    }
  }

  const handleImportData = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".json,application/json"
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0]
      if (!file || !user) return

      try {
        const parsed: unknown = JSON.parse(await file.text())
        const tasksArray = Array.isArray(parsed) ? parsed : isRecord(parsed) ? parsed.tasks : undefined
        if (!Array.isArray(tasksArray)) {
          showResult({ success: false, message: "Invalid format. Expected an array of tasks." })
          return
        }

        let imported = 0
        for (const candidate of tasksArray) {
          if (!isRecord(candidate)) continue
          const title = optionalString(candidate, "title")?.trim()
          if (!title) continue

          const taskData: Parameters<typeof createCloudTask>[1] = {
            title,
            detail: optionalString(candidate, "detail") ?? optionalString(candidate, "description"),
            photo: optionalString(candidate, "photo"),
            alarm: optionalString(candidate, "alarm"),
            repeats: optionalString(candidate, "repeats"),
            dueDate: optionalString(candidate, "dueDate"),
            // A restore must not silently reopen finished tasks or flatten a
            // repeat rule down to its legacy weekday string.
            completed: candidate.completed === true,
            repeatRule: candidate.repeatRule as Parameters<typeof createCloudTask>[1]["repeatRule"],
          }

          try {
            await createCloudTask(user.uid, taskData)
            imported += 1
          } catch (error) {
            console.error("Error importing task:", title, error)
          }
        }

        showResult({ success: true, message: `Successfully imported ${imported} tasks.` })
        onDataImported()
      } catch (error) {
        console.error("Import error:", error)
        showResult({ success: false, message: "Failed to read or parse file." })
      }
    }
    input.click()
  }

  const handleExportCalendar = async () => {
    const tasksWithAlarms = tasks.filter((task) => task.alarm && !task.completed)
    if (tasksWithAlarms.length === 0) {
      showResult({ success: false, message: "No tasks with alarms to export." })
      return
    }

    try {
      await exportAllAlarmsToICS(tasksWithAlarms.map((task) => ({
        id: task.id,
        title: task.title,
        description: task.detail,
        alarm: task.alarm!,
        repeats: task.repeats,
        dueDate: task.dueDate,
      })))
      showResult({ success: true, message: `Exported ${tasksWithAlarms.length} alarms to calendar.` })
    } catch (error) {
      console.error("Calendar export failed:", error)
      showResult({ success: false, message: "Could not export the calendar file." })
    }
  }

  const handleRequestNotifications = async () => {
    const granted = await requestWebNotificationPermission()
    setNotificationStatus(granted ? "granted" : "denied")
  }

  const handleTogglePush = async () => {
    if (!user) return
    setPushBusy(true)

    try {
      if (pushState === "on") {
        await disablePush(user.uid)
        setPushState("off")
        showResult({ success: true, message: "Background alarms turned off." })
        return
      }

      const result = await enablePush(user.uid)
      if (result.ok) {
        setPushBlockedBy(null)
        setPushState("on")
        setNotificationStatus("granted")
        showResult({ success: true, message: "Background alarms are on for this device." })
        return
      }

      if (result.reason === "subscribe-failed" || !result.reason) {
        showResult({ success: false, message: "Could not register this device for push." })
        setPushState("off")
        return
      }

      setPushBlockedBy(result.reason)
      setPushState("blocked")
    } finally {
      setPushBusy(false)
    }
  }

  const pushCopy =
    pushState === "checking"
      ? "Checking this device..."
      : pushState === "on"
        ? "On. Alarms arrive even when the app is closed."
        : pushState === "blocked"
          ? PUSH_BLOCK_COPY[pushBlockedBy ?? "unsupported-browser"]
          : "Off. Alarms only ring while the app is open on screen."

  const notificationCopy = notificationStatus === "granted"
    ? "On. Reminders appear while the app is open."
    : notificationStatus === "denied"
      ? "Blocked. Turn on notifications in the browser settings."
      : notificationStatus === "not-supported"
        ? "This browser does not support web notifications."
        : notificationStatus === "checking"
          ? "Checking browser support..."
          : "Permission has not been requested yet."

  return (
    <XpWindow title="Settings" icon="gear">
      <XpToolbar label="Settings commands">
        <XpToolButton icon="back" label="Back" onClick={onBack} />
      </XpToolbar>
      <div className="xp-window-body is-chrome">
        <div className="xp-settings">
          <section className="xp-category" aria-labelledby="set-account">
            <XpIcon name="user" size={40} />
            <div>
              <h3 id="set-account">Account</h3>
              <p><b>{user?.email || "Unknown account"}</b><br />Your tasks sync to this account across devices.</p>
              <div className="xp-row-buttons">
                <button type="button" className="xp-btn" onClick={onLogOff}><XpIcon name="logoff" size={16} /> Log Off</button>
              </div>
            </div>
          </section>

          <section className="xp-category" aria-labelledby="set-reminders">
            <XpIcon name="bell" size={40} />
            <div>
              <h3 id="set-reminders">Reminders</h3>
              {Capacitor.isNativePlatform() ? <NativeAlarmSettings /> : (
                <>
                  <div className="xp-setting-row">
                    <div><strong>Background alarms</strong><p>{pushCopy}</p></div>
                    {pushState === "on" ? (
                      <button type="button" className="xp-btn is-small" onClick={handleTogglePush} disabled={pushBusy}>{pushBusy ? "Working..." : "Turn Off"}</button>
                    ) : (pushState === "off" || pushState === "blocked") && (
                      <button
                        type="button"
                        className="xp-btn is-small"
                        onClick={handleTogglePush}
                        disabled={pushBusy || pushBlockedBy === "ios-needs-home-screen" || pushBlockedBy === "ios-too-old" || pushBlockedBy === "unsupported-browser" || pushBlockedBy === "missing-vapid-key"}
                      >
                        {pushBusy ? "Working..." : "Turn On"}
                      </button>
                    )}
                  </div>
                  <div className="xp-setting-row">
                    <div><strong>Web notifications</strong><p>{notificationCopy}</p></div>
                    {notificationStatus === "granted" && <StatusOk />}
                    {notificationStatus !== "checking" && notificationStatus !== "not-supported" && notificationStatus !== "granted" && (
                      <button type="button" className="xp-btn is-small" onClick={handleRequestNotifications}>Allow</button>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="xp-category" aria-labelledby="set-appearance">
            <XpIcon name="monitor" size={40} />
            <div>
              <h3 id="set-appearance">Appearance</h3>
              <Appearance />
            </div>
          </section>

          <section className="xp-category" aria-labelledby="set-calendar">
            <XpIcon name="ics" size={40} />
            <div>
              <h3 id="set-calendar">Calendar</h3>
              <p>Add every task that has an alarm to Google Calendar, Outlook or another calendar app, as an .ics file.</p>
              <div className="xp-row-buttons">
                <button type="button" className="xp-btn" onClick={handleExportCalendar}>Export alarms (.ics)</button>
              </div>
            </div>
          </section>

          <section className="xp-category" aria-labelledby="set-backup">
            <XpIcon name="floppy" size={40} />
            <div>
              <h3 id="set-backup">Backup</h3>
              <p>Save all tasks to a file, or add the tasks from a backup to this account.</p>
              <div className="xp-row-buttons">
                <button type="button" className="xp-btn" onClick={handleExportData}>Back up (.json)</button>
                <button type="button" className="xp-btn" onClick={handleImportData}>Restore…</button>
              </div>
            </div>
          </section>

          <section className="xp-category" aria-labelledby="set-about">
            <XpIcon name="info" size={40} />
            <div>
              <h3 id="set-about">About</h3>
              <p><b>Task Manager 2.0.0</b><br />{tasks.length} task{tasks.length === 1 ? "" : "s"} stored in the cloud.</p>
            </div>
          </section>
        </div>
      </div>
      <XpStatusBar>
        <span className="xp-sb is-grow"><span>{user?.email ? `Signed in as ${user.email}` : "Settings"}</span></span>
        <XpSynced />
      </XpStatusBar>

      {importResult && (
        <XpDialog
          title={importResult.success ? "Done" : "Something went wrong"}
          icon={importResult.success ? "info" : "warning"}
          onClose={() => setImportResult(null)}
          buttons={<button type="button" className="xp-btn is-default" onClick={() => setImportResult(null)} autoFocus>OK</button>}
        >
          <XpMessage icon={importResult.success ? "info" : "warning"}><p>{importResult.message}</p></XpMessage>
        </XpDialog>
      )}
    </XpWindow>
  )
}
