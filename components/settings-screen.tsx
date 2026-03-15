"use client"

import { Menu, ArrowLeft, Download, Upload, Calendar, Bell, Shield, User, LogOut, Cloud } from "lucide-react"
import { useState } from "react"
import type { Task } from "@/app/page"
import { exportAllAlarmsToICS } from "@/lib/calendar-export"
import { requestWebNotificationPermission, isWebNotificationSupported } from "@/lib/web-notifications"
import { useAuth } from "@/lib/auth-context"
import { createCloudTask } from "@/lib/storage-cloud"

interface SettingsScreenProps {
  tasks: Task[]
  onBack: () => void
  onOpenDrawer: () => void
  onDataImported: () => void
}

export default function SettingsScreen({ tasks, onBack, onOpenDrawer, onDataImported }: SettingsScreenProps) {
  const { user, signOut } = useAuth()
  const [notificationStatus, setNotificationStatus] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window 
      ? Notification.permission 
      : 'not-supported'
  )
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await signOut()
    } catch {
      setSigningOut(false)
    }
  }

  const handleExportData = async () => {
    try {
      // Export current tasks (from Firestore) as JSON
      const jsonData = JSON.stringify(tasks, null, 2)
      const blob = new Blob([jsonData], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      
      const link = document.createElement('a')
      link.href = url
      link.download = `task-manager-backup-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Export failed:', error)
    }
  }

  const handleImportData = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file || !user) return
      
      try {
        const text = await file.text()
        const parsed = JSON.parse(text)
        
        // Support both array format and {tasks: [...]} format
        const tasksArray = Array.isArray(parsed) ? parsed : parsed.tasks
        
        if (!Array.isArray(tasksArray)) {
          setImportResult({ success: false, message: 'Invalid format. Expected an array of tasks.' })
          setTimeout(() => setImportResult(null), 3000)
          return
        }

        let imported = 0
        for (const task of tasksArray) {
          if (task.title) {
            await createCloudTask(user.uid, {
              title: task.title,
              detail: task.detail || task.description,
              photo: task.photo,
              alarm: task.alarm,
              repeats: task.repeats,
              dueDate: task.dueDate,
            })
            imported++
          }
        }
        
        setImportResult({ success: true, message: `Successfully imported ${imported} tasks.` })
        onDataImported()
      } catch (error) {
        setImportResult({ success: false, message: 'Failed to read or parse file.' })
      }
      
      // Clear message after 3 seconds
      setTimeout(() => setImportResult(null), 3000)
    }
    
    input.click()
  }

  const handleExportCalendar = () => {
    const tasksWithAlarms = tasks.filter(t => t.alarm && !t.completed)
    
    if (tasksWithAlarms.length === 0) {
      setImportResult({ success: false, message: 'No tasks with alarms to export.' })
      setTimeout(() => setImportResult(null), 3000)
      return
    }
    
    exportAllAlarmsToICS(tasksWithAlarms.map(t => ({
      id: t.id,
      title: t.title,
      description: t.detail,
      alarm: t.alarm!,
      repeats: t.repeats,
      dueDate: t.dueDate,
    })))
    
    setImportResult({ success: true, message: `Exported ${tasksWithAlarms.length} alarms to calendar.` })
    setTimeout(() => setImportResult(null), 3000)
  }

  const handleRequestNotifications = async () => {
    const granted = await requestWebNotificationPermission()
    setNotificationStatus(granted ? 'granted' : 'denied')
  }

  return (
    <div className="h-screen flex flex-col bg-transparent relative">
      {/* Header */}
      <div className="flex items-center justify-between p-6 pb-4 animate-fade-in">
        <button onClick={onOpenDrawer} className="p-2 hover:bg-[var(--obsidian-2)] rounded-lg transition-colors">
          <Menu className="w-6 h-6 text-[var(--metal-muted)]" />
        </button>
        <h1 
          className="text-sm font-bold tracking-[0.2em] text-[var(--metal-muted)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          SETTINGS
        </h1>
        <button onClick={onBack} className="p-2 hover:bg-[var(--obsidian-2)] rounded-lg transition-colors">
          <ArrowLeft className="w-6 h-6 text-[var(--metal-muted)]" />
        </button>
      </div>

      {/* Settings Container */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-md mx-auto space-y-4">

          {/* Account Section */}
          <div className="border border-[var(--obsidian-border)] rounded-2xl p-6 bg-[var(--obsidian-1)] animate-fade-in-up">
            <h2 
              className="text-sm text-[var(--metal-muted)] mb-4 tracking-wider flex items-center gap-2"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
            >
              <User className="w-4 h-4" />
              ACCOUNT
            </h2>
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[var(--ember)]/20 flex items-center justify-center">
                  <span className="text-[var(--ember)] font-bold text-sm" style={{ fontFamily: 'var(--font-display)' }}>
                    {user?.email?.charAt(0).toUpperCase() || '?'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--metal-bright)] truncate">{user?.email || 'Unknown'}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Cloud className="w-3 h-3 text-[var(--forge-green)]" />
                    <p className="text-xs text-[var(--forge-green)] font-light">Synced across devices</p>
                  </div>
                </div>
              </div>
              
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[var(--obsidian)] border border-[var(--forge-red)]/30 rounded-xl text-[var(--forge-red)] hover:bg-[var(--forge-red)]/10 disabled:opacity-50 transition-all duration-300 text-sm"
              >
                <LogOut className="w-4 h-4" />
                {signingOut ? 'Signing out...' : 'Sign Out'}
              </button>
            </div>
          </div>
          
          {/* Notifications Section */}
          <div className="border border-[var(--obsidian-border)] rounded-2xl p-6 bg-[var(--obsidian-1)] animate-fade-in-up stagger-1">
            <h2 
              className="text-sm text-[var(--metal-muted)] mb-4 tracking-wider flex items-center gap-2"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
            >
              <Bell className="w-4 h-4" />
              NOTIFICATIONS
            </h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--metal-bright)]">Web Notifications</p>
                  <p className="text-xs text-[var(--metal-muted)] mt-1 font-light">
                    {notificationStatus === 'granted' 
                      ? 'Enabled - you will receive reminders'
                      : notificationStatus === 'denied'
                        ? 'Blocked - enable in browser settings'
                        : notificationStatus === 'not-supported'
                          ? 'Not supported in this browser'
                          : 'Not enabled yet'}
                  </p>
                </div>
                {isWebNotificationSupported() && notificationStatus !== 'granted' && (
                  <button
                    onClick={handleRequestNotifications}
                    className="px-4 py-2 bg-[var(--ember)] text-[var(--obsidian)] rounded-lg text-sm font-medium hover:brightness-110 transition-all shadow-[0_0_10px_rgba(var(--ember-rgb),0.2)]"
                  >
                    Enable
                  </button>
                )}
                {notificationStatus === 'granted' && (
                  <div className="px-4 py-2 bg-[var(--forge-green)]/15 text-[var(--forge-green)] rounded-lg text-sm font-medium">
                    Enabled
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Calendar Export Section */}
          <div className="border border-[var(--obsidian-border)] rounded-2xl p-6 bg-[var(--obsidian-1)] animate-fade-in-up stagger-2">
            <h2 
              className="text-sm text-[var(--metal-muted)] mb-4 tracking-wider flex items-center gap-2"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
            >
              <Calendar className="w-4 h-4" />
              CALENDAR EXPORT
            </h2>
            
            <p className="text-xs text-[var(--metal-muted)] mb-4 font-light">
              Export your task alarms to a .ics calendar file. This is especially useful for iOS 
              devices where PWA background notifications are limited.
            </p>
            
            <button
              onClick={handleExportCalendar}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[var(--obsidian)] border border-[var(--obsidian-border)] rounded-xl text-[var(--metal-bright)] hover:border-[var(--ember)] hover:shadow-[0_0_10px_rgba(var(--ember-rgb),0.1)] transition-all duration-300"
            >
              <Calendar className="w-4 h-4" />
              Export Alarms to Calendar (.ics)
            </button>
          </div>

          {/* Data Management Section */}
          <div className="border border-[var(--obsidian-border)] rounded-2xl p-6 bg-[var(--obsidian-1)] animate-fade-in-up stagger-3">
            <h2 
              className="text-sm text-[var(--metal-muted)] mb-4 tracking-wider flex items-center gap-2"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
            >
              <Shield className="w-4 h-4" />
              DATA MANAGEMENT
            </h2>
            
            <div className="space-y-3">
              <button
                onClick={handleExportData}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[var(--obsidian)] border border-[var(--obsidian-border)] rounded-xl text-[var(--metal-bright)] hover:border-[var(--ember)] hover:shadow-[0_0_10px_rgba(var(--ember-rgb),0.1)] transition-all duration-300"
              >
                <Download className="w-4 h-4" />
                Export All Data (JSON)
              </button>
              
              <button
                onClick={handleImportData}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[var(--obsidian)] border border-[var(--obsidian-border)] rounded-xl text-[var(--metal-bright)] hover:border-[var(--ember)] hover:shadow-[0_0_10px_rgba(var(--ember-rgb),0.1)] transition-all duration-300"
              >
                <Upload className="w-4 h-4" />
                Import Data (JSON)
              </button>
            </div>
            
            <p className="text-xs text-[var(--metal-muted)] mt-4 font-light">
              Export creates a backup of all your tasks. Import will replace all existing data.
            </p>
          </div>

          {/* Import/Export Result Message */}
          {importResult && (
            <div className={`p-4 rounded-xl text-sm ${
              importResult.success 
                ? 'bg-[var(--forge-green)]/15 text-[var(--forge-green)] border border-[var(--forge-green)]/30' 
                : 'bg-[var(--forge-red)]/15 text-[var(--forge-red)] border border-[var(--forge-red)]/30'
            }`}>
              {importResult.message}
            </div>
          )}

          {/* App Info */}
          <div className="border border-[var(--obsidian-border)] rounded-2xl p-6 bg-[var(--obsidian-1)] animate-fade-in-up stagger-4">
            <h2 
              className="text-sm text-[var(--metal-muted)] mb-4 tracking-wider"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
            >
              ABOUT
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--metal-muted)] font-light">Version</span>
                <span className="text-[var(--metal-bright)]">2.0.0 (Cloud Sync)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--metal-muted)] font-light">Tasks</span>
                <span className="text-[var(--ember)]">{tasks.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--metal-muted)] font-light">Storage</span>
                <span className="text-[var(--metal-bright)]">Cloud (Firebase)</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
