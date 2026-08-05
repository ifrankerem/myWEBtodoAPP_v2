// Web Notifications service for PWA
// Works alongside Capacitor notifications for web-only scenarios

import { Capacitor } from '@capacitor/core';
import { parseAlarmTime, parseTaskDate } from './task-dates';

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
    const dueDate = parseTaskDate(task.dueDate);
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
    if (isWebNotificationSupported() && Notification.permission === 'granted') {
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
async function playAlarmSound(): Promise<void> {
  try {
    const audioWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
    const AudioContextConstructor = window.AudioContext || audioWindow.webkitAudioContext;
    if (!AudioContextConstructor) return;
    const audioContext = new AudioContextConstructor();
    
    // Resume the audio context (required by autoplay policy)
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    
    // Play a two-tone alarm sound
    const playTone = (frequency: number, startTime: number, duration: number) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.5, audioContext.currentTime + startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + startTime + duration);
      
      oscillator.start(audioContext.currentTime + startTime);
      oscillator.stop(audioContext.currentTime + startTime + duration);
    };
    
    // Play 5 sets of tones for louder effect
    for (let i = 0; i < 5; i++) {
      playTone(800, i * 0.4, 0.15);
      playTone(1000, i * 0.4 + 0.15, 0.15);
    }
    
    console.log('Alarm sound played successfully');
  } catch (error) {
    console.error('Error playing alarm sound:', error);
  }
}

// Show in-app alert (creates a temporary popup)
function showInAppAlert(message: string): void {
  const alert = document.createElement('div');
  alert.className = 'xp-alarm-toast';
  alert.setAttribute('role', 'alert');
  alert.setAttribute('aria-live', 'assertive');

  const title = document.createElement('div');
  title.className = 'xp-alarm-toast-title';
  title.textContent = 'Alarm';

  const body = document.createElement('div');
  body.className = 'xp-alarm-toast-body';
  body.textContent = message;

  alert.append(title, body);
  document.body.appendChild(alert);
  
  // Remove after 5 seconds
  setTimeout(() => {
    alert.classList.add('xp-alarm-toast-closing');
    setTimeout(() => {
      alert.remove();
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
  
  // Stop any existing reminders
  stopAllForegroundReminders();
  
  // Start reminders for all applicable tasks
  tasks.forEach(task => {
    if (!task.completed && task.alarm) {
      startForegroundReminder(task);
    }
  });
}
