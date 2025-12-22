"use client"

import { Menu, ArrowLeft, Download, Upload, Calendar, Bell, Shield } from "lucide-react"
import { useState } from "react"
import type { Task } from "@/app/page"
import { exportData, importData } from "@/lib/storage-idb"
import { exportAllAlarmsToICS } from "@/lib/calendar-export"
import { requestWebNotificationPermission, isWebNotificationSupported } from "@/lib/web-notifications"

interface SettingsScreenProps {
  tasks: Task[]
  onBack: () => void
  onOpenDrawer: () => void
  onDataImported: () => void
}

export default function SettingsScreen({ tasks, onBack, onOpenDrawer, onDataImported }: SettingsScreenProps) {
  const [notificationStatus, setNotificationStatus] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window 
      ? Notification.permission 
      : 'not-supported'
  )
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null)

  const handleExportData = async () => {
    try {
      const jsonData = await exportData()
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
      if (!file) return
      
      try {
        const text = await file.text()
        const result = await importData(text)
        
        if (result.success) {
          setImportResult({ success: true, message: `Successfully imported ${result.count} tasks.` })
          onDataImported()
        } else {
          setImportResult({ success: false, message: result.error || 'Import failed.' })
        }
      } catch (error) {
        setImportResult({ success: false, message: 'Failed to read file.' })
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
    <div className="h-screen flex flex-col bg-[#0B0B0B] relative">
      {/* Header */}
      <div className="flex items-center justify-between p-6 pb-4">
        <button onClick={onOpenDrawer} className="p-2 hover:bg-[#1a1a1a] rounded-lg transition-colors">
          <Menu className="w-6 h-6 text-[#888]" />
        </button>
        <h1 className="text-sm font-medium tracking-[0.2em] text-[#888]">SETTINGS</h1>
        <button onClick={onBack} className="p-2 hover:bg-[#1a1a1a] rounded-lg transition-colors">
          <ArrowLeft className="w-6 h-6 text-[#888]" />
        </button>
      </div>

      {/* Settings Container */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-md mx-auto space-y-4">
          
          {/* Notifications Section */}
          <div className="border border-[#2a2a2a] rounded-2xl p-6 bg-[#0f0f0f]">
            <h2 className="text-sm text-[#888] mb-4 tracking-wider flex items-center gap-2">
              <Bell className="w-4 h-4" />
              NOTIFICATIONS
            </h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white">Web Notifications</p>
                  <p className="text-xs text-[#666] mt-1">
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
                    className="px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
                  >
                    Enable
                  </button>
                )}
                {notificationStatus === 'granted' && (
                  <div className="px-4 py-2 bg-[#34c759]/20 text-[#34c759] rounded-lg text-sm font-medium">
                    Enabled
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Calendar Export Section */}
          <div className="border border-[#2a2a2a] rounded-2xl p-6 bg-[#0f0f0f]">
            <h2 className="text-sm text-[#888] mb-4 tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              CALENDAR EXPORT
            </h2>
            
            <p className="text-xs text-[#666] mb-4">
              Export your task alarms to a .ics calendar file. This is especially useful for iOS 
              devices where PWA background notifications are limited.
            </p>
            
            <button
              onClick={handleExportCalendar}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#1a1a1a] border border-[#333] rounded-xl text-white hover:border-[#555] transition-colors"
            >
              <Calendar className="w-4 h-4" />
              Export Alarms to Calendar (.ics)
            </button>
          </div>

          {/* Data Management Section */}
          <div className="border border-[#2a2a2a] rounded-2xl p-6 bg-[#0f0f0f]">
            <h2 className="text-sm text-[#888] mb-4 tracking-wider flex items-center gap-2">
              <Shield className="w-4 h-4" />
              DATA MANAGEMENT
            </h2>
            
            <div className="space-y-3">
              <button
                onClick={handleExportData}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#1a1a1a] border border-[#333] rounded-xl text-white hover:border-[#555] transition-colors"
              >
                <Download className="w-4 h-4" />
                Export All Data (JSON)
              </button>
              
              <button
                onClick={handleImportData}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#1a1a1a] border border-[#333] rounded-xl text-white hover:border-[#555] transition-colors"
              >
                <Upload className="w-4 h-4" />
                Import Data (JSON)
              </button>
            </div>
            
            <p className="text-xs text-[#666] mt-4">
              Export creates a backup of all your tasks. Import will replace all existing data.
            </p>
          </div>

          {/* Import/Export Result Message */}
          {importResult && (
            <div className={`p-4 rounded-xl text-sm ${
              importResult.success 
                ? 'bg-[#34c759]/20 text-[#34c759] border border-[#34c759]/30' 
                : 'bg-[#ff3b30]/20 text-[#ff3b30] border border-[#ff3b30]/30'
            }`}>
              {importResult.message}
            </div>
          )}

          {/* App Info */}
          <div className="border border-[#2a2a2a] rounded-2xl p-6 bg-[#0f0f0f]">
            <h2 className="text-sm text-[#888] mb-4 tracking-wider">ABOUT</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#888]">Version</span>
                <span className="text-white">1.1.0 (PWA)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#888]">Tasks</span>
                <span className="text-white">{tasks.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#888]">Storage</span>
                <span className="text-white">IndexedDB (Offline)</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
