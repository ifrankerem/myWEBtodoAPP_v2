"use client"

import { Bell, Calendar, Cloud, Download, LogOut, Shield, Upload, User } from "lucide-react"
import { useEffect, useState } from "react"
import type { Task } from "@/app/page"
import { exportAllAlarmsToICS } from "@/lib/calendar-export"
import { isWebNotificationSupported, requestWebNotificationPermission } from "@/lib/web-notifications"
import { useAuth } from "@/lib/auth-context"
import { createCloudTask } from "@/lib/storage-cloud"
import { XpHeader, XpStatusBar } from "@/components/xp-ui"

interface SettingsScreenProps {
  tasks: Task[]
  onBack: () => void
  onOpenDrawer: () => void
  onDataImported: () => void
}

type NotificationStatus = NotificationPermission | "not-supported" | "checking"
type ImportResult = { success: boolean; message: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === "string" && value.length > 0 ? value : undefined
}

export default function SettingsScreen({ tasks, onBack, onOpenDrawer, onDataImported }: SettingsScreenProps) {
  const { user, signOut } = useAuth()
  const [notificationStatus, setNotificationStatus] = useState<NotificationStatus>("checking")
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    setNotificationStatus(isWebNotificationSupported() ? Notification.permission : "not-supported")
  }, [])

  const showResult = (result: ImportResult) => {
    setImportResult(result)
    window.setTimeout(() => setImportResult(null), 3000)
  }

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await signOut()
    } catch {
      setSigningOut(false)
    }
  }

  const handleExportData = () => {
    try {
      const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `task-manager-backup-${new Date().toISOString().split("T")[0]}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
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

  const handleExportCalendar = () => {
    const tasksWithAlarms = tasks.filter((task) => task.alarm && !task.completed)
    if (tasksWithAlarms.length === 0) {
      showResult({ success: false, message: "No tasks with alarms to export." })
      return
    }

    exportAllAlarmsToICS(tasksWithAlarms.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.detail,
      alarm: task.alarm!,
      repeats: task.repeats,
      dueDate: task.dueDate,
    })))
    showResult({ success: true, message: `Exported ${tasksWithAlarms.length} alarms to calendar.` })
  }

  const handleRequestNotifications = async () => {
    const granted = await requestWebNotificationPermission()
    setNotificationStatus(granted ? "granted" : "denied")
  }

  const notificationCopy = notificationStatus === "granted"
    ? "Enabled — reminders may appear while the app is open."
    : notificationStatus === "denied"
      ? "Blocked — enable notifications in the browser settings."
      : notificationStatus === "not-supported"
        ? "This browser does not support web notifications."
        : notificationStatus === "checking"
          ? "Checking browser support..."
          : "Permission has not been requested yet."

  return (
    <section className="xp-screen xp-settings" aria-label="Settings">
      <XpHeader title="Settings" onOpenDrawer={onOpenDrawer} onBack={onBack} />
      <main className="xp-content">
        <div className="xp-settings-sheet">
          <section className="xp-groupbox">
            <span className="xp-groupbox-title"><User /> Account</span>
            <div className="xp-account-row">
              <div className="xp-user-tile" aria-hidden="true">{user?.email?.charAt(0).toUpperCase() || "?"}</div>
              <div className="xp-account-copy">
                <strong>{user?.email || "Unknown"}</strong>
                <span><Cloud /> Synced across devices</span>
              </div>
              <button type="button" className="xp-button xp-button-danger" onClick={handleSignOut} disabled={signingOut}><LogOut /> {signingOut ? "Signing out..." : "Sign Out"}</button>
            </div>
          </section>

          <section className="xp-groupbox">
            <span className="xp-groupbox-title"><Bell /> Notifications</span>
            <div className="xp-settings-row">
              <div><strong>Web Notifications</strong><p>{notificationCopy}</p></div>
              {notificationStatus !== "checking" && notificationStatus !== "not-supported" && notificationStatus !== "granted" && <button type="button" className="xp-button" onClick={handleRequestNotifications}>Enable</button>}
              {notificationStatus === "granted" && <span className="xp-badge xp-badge-success">Enabled</span>}
            </div>
          </section>

          <section className="xp-groupbox">
            <span className="xp-groupbox-title"><Calendar /> Calendar Export</span>
            <p className="xp-settings-help">Export task alarms to an .ics file. This is useful on platforms where PWA background notifications are limited.</p>
            <button type="button" className="xp-button xp-settings-wide-button" onClick={handleExportCalendar}><Calendar /> Export Alarms to Calendar (.ics)</button>
          </section>

          <section className="xp-groupbox">
            <span className="xp-groupbox-title"><Shield /> Data Management</span>
            <div className="xp-settings-actions">
              <button type="button" className="xp-button" onClick={handleExportData}><Download /> Export All Data (JSON)</button>
              <button type="button" className="xp-button" onClick={handleImportData}><Upload /> Import Data (JSON)</button>
            </div>
            <p className="xp-settings-help">Export creates a backup of all tasks. Import appends valid tasks from a backup to the current account.</p>
          </section>

          {importResult && <div className={`xp-alert ${importResult.success ? "xp-alert-success" : "xp-alert-error"}`} role="status">{importResult.message}</div>}

          <section className="xp-groupbox">
            <span className="xp-groupbox-title">About</span>
            <dl className="xp-settings-about">
              <div><dt>Version</dt><dd>2.0.0 (Cloud Sync)</dd></div>
              <div><dt>Tasks</dt><dd>{tasks.length}</dd></div>
              <div><dt>Storage</dt><dd>Cloud (Firebase)</dd></div>
            </dl>
          </section>
        </div>
      </main>
      <XpStatusBar><span className="flex-1">Preferences</span><span>{tasks.length} tasks</span></XpStatusBar>
    </section>
  )
}
