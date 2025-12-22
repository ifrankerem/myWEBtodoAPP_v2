// Web Notifications service for PWA
// Works alongside Capacitor notifications for web-only scenarios

import { Capacitor } from '@capacitor/core';

// Store for active foreground reminders
const activeReminders = new Map<string, number>();

// Check if Web Notifications are supported
export function isWebNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

// Request notification permission
export async function requestWebNotificationPermission(): Promise<boolean> {
  if (!isWebNotificationSupported()) return false;
  
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  
  const result = await Notification.requestPermission();
  return result === 'granted';
}

// Show a web notification
export function showWebNotification(title: string, options?: NotificationOptions): void {
  if (!isWebNotificationSupported()) return;
  if (Notification.permission !== 'granted') return;
  
  new Notification(title, {
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    ...options
  });
}

// Parse alarm time string (24-hour format like "14:30" or "09:15")
function parseAlarmTime(alarmString: string): { hour: number; minute: number } | null {
  if (!alarmString) return null;
  
  const match = alarmString.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  
  return { hour, minute };
}

// Day name mapping
const dayNameToIndex: Record<string, number> = {
  'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6,
};

// Check if task should trigger today
function shouldTriggerToday(task: {
  alarm?: string;
  repeats?: string;
  dueDate?: string;
  completed?: boolean;
}): boolean {
  if (task.completed) return false;
  if (!task.alarm) return false;
  
  const today = new Date();
  const todayDayIndex = today.getDay();
  
  // If has repeat days, check if today is one of them
  if (task.repeats) {
    const repeatDays = task.repeats.split(',').map(d => d.trim());
    return repeatDays.some(day => dayNameToIndex[day] === todayDayIndex);
  }
  
  // If has due date, check if it's today
  if (task.dueDate) {
    const dueDate = new Date(task.dueDate);
    return dueDate.toDateString() === today.toDateString();
  }
  
  // One-time alarm defaults to today
  return true;
}

// Calculate next trigger time for a task
function getNextTriggerTime(task: {
  alarm?: string;
  repeats?: string;
}): Date | null {
  if (!task.alarm) return null;
  
  const time = parseAlarmTime(task.alarm);
  if (!time) return null;
  
  const now = new Date();
  const triggerTime = new Date();
  triggerTime.setHours(time.hour, time.minute, 0, 0);
  
  // If time has passed today, don't trigger
  if (triggerTime <= now) return null;
  
  return triggerTime;
}

// Start foreground reminder checking for a task
export function startForegroundReminder(task: {
  id: string;
  title: string;
  alarm?: string;
  repeats?: string;
  dueDate?: string;
  completed?: boolean;
}): void {
  // Cancel any existing reminder for this task
  stopForegroundReminder(task.id);
  
  if (!task.alarm || task.completed) return;
  if (!shouldTriggerToday(task)) return;
  
  const triggerTime = getNextTriggerTime(task);
  if (!triggerTime) return;
  
  const now = new Date();
  const delay = triggerTime.getTime() - now.getTime();
  
  if (delay <= 0) return;
  
  console.log(`Scheduling foreground reminder for "${task.title}" in ${Math.round(delay / 1000 / 60)} minutes`);
  
  const timeoutId = window.setTimeout(() => {
    // Play sound
    playAlarmSound();
    
    // Show notification if we have permission
    if (Notification.permission === 'granted') {
      showWebNotification('🔔 ALARM', {
        body: task.title,
        tag: task.id,
        requireInteraction: true,
      });
    }
    
    // Also show in-app alert
    showInAppAlert(task.title);
    
    activeReminders.delete(task.id);
  }, delay);
  
  activeReminders.set(task.id, timeoutId);
}

// Stop foreground reminder for a task
export function stopForegroundReminder(taskId: string): void {
  const timeoutId = activeReminders.get(taskId);
  if (timeoutId) {
    clearTimeout(timeoutId);
    activeReminders.delete(taskId);
  }
}

// Stop all foreground reminders
export function stopAllForegroundReminders(): void {
  activeReminders.forEach((timeoutId) => {
    clearTimeout(timeoutId);
  });
  activeReminders.clear();
}

// Play alarm sound
function playAlarmSound(): void {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Play a two-tone alarm sound
    const playTone = (frequency: number, startTime: number, duration: number) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime + startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + startTime + duration);
      
      oscillator.start(audioContext.currentTime + startTime);
      oscillator.stop(audioContext.currentTime + startTime + duration);
    };
    
    // Play 3 sets of tones
    for (let i = 0; i < 3; i++) {
      playTone(800, i * 0.4, 0.15);
      playTone(1000, i * 0.4 + 0.15, 0.15);
    }
  } catch (error) {
    console.error('Error playing alarm sound:', error);
  }
}

// Show in-app alert (creates a temporary popup)
function showInAppAlert(message: string): void {
  // Create alert element
  const alert = document.createElement('div');
  alert.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #ff3b30, #ff6b6b);
    color: white;
    padding: 16px 24px;
    border-radius: 12px;
    font-weight: 600;
    z-index: 10000;
    box-shadow: 0 4px 20px rgba(255, 59, 48, 0.4);
    animation: slideDown 0.3s ease-out;
    max-width: 90%;
    text-align: center;
  `;
  
  alert.innerHTML = `
    <div style="font-size: 20px; margin-bottom: 4px;">🔔 ALARM</div>
    <div style="font-size: 14px; opacity: 0.9;">${message}</div>
  `;
  
  // Add animation keyframes
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideDown {
      from { transform: translateX(-50%) translateY(-100%); opacity: 0; }
      to { transform: translateX(-50%) translateY(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(alert);
  
  // Remove after 5 seconds
  setTimeout(() => {
    alert.style.animation = 'slideDown 0.3s ease-out reverse';
    setTimeout(() => {
      alert.remove();
      style.remove();
    }, 300);
  }, 5000);
}

// Initialize foreground reminders for all tasks
export function initializeForegroundReminders(tasks: Array<{
  id: string;
  title: string;
  alarm?: string;
  repeats?: string;
  dueDate?: string;
  completed?: boolean;
}>): void {
  // Only run on web platforms (not native Capacitor)
  if (Capacitor.isNativePlatform()) return;
  
  // Request notification permission
  requestWebNotificationPermission();
  
  // Stop any existing reminders
  stopAllForegroundReminders();
  
  // Start reminders for all applicable tasks
  tasks.forEach(task => {
    if (!task.completed && task.alarm) {
      startForegroundReminder(task);
    }
  });
}
