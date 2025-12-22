// Notification service for scheduling alarms using Capacitor Local Notifications
// Works on real Android/iOS devices

import { Capacitor } from '@capacitor/core';
import { LocalNotifications, Channel } from '@capacitor/local-notifications';

// Day name to weekday number mapping (Sunday = 1, Monday = 2, etc. for LocalNotifications)
const dayToWeekday: Record<string, number> = {
  'Sun': 1,
  'Mon': 2,
  'Tue': 3,
  'Wed': 4,
  'Thu': 5,
  'Fri': 6,
  'Sat': 7,
};

// Alarm channel ID
const ALARM_CHANNEL_ID = 'task-alarms';

// Parse alarm time string (24-hour format like "14:30" or "09:15")
function parseAlarmTime(alarmString: string): { hour: number; minute: number } | null {
  if (!alarmString) return null;
  
  // Handle 24-hour format: "HH:MM"
  const match = alarmString.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  
  return { hour, minute };
}

// Generate a unique notification ID from task ID
function generateNotificationId(taskId: string, daySuffix?: string): number {
  const str = taskId + (daySuffix || '');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

// Create alarm notification channel with high importance
async function createAlarmChannel(): Promise<void> {
  try {
    const channel: Channel = {
      id: ALARM_CHANNEL_ID,
      name: 'Task Alarms',
      description: 'Alarm notifications for your tasks',
      importance: 5, // Max importance (IMPORTANCE_HIGH) - makes sound and shows heads-up
      visibility: 1, // Public - show on lock screen
      sound: 'alarm_sound.wav', // Custom alarm sound
      vibration: true,
      lights: true,
      lightColor: '#00FF88',
    };
    
    await LocalNotifications.createChannel(channel);
    console.log('Alarm channel created successfully');
  } catch (error) {
    console.error('Error creating alarm channel:', error);
  }
}

// Request notification permissions
export async function requestNotificationPermissions(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    console.log('Notifications only work on native platforms');
    return false;
  }
  
  try {
    const permStatus = await LocalNotifications.checkPermissions();
    
    if (permStatus.display === 'granted') {
      return true;
    }
    
    if (permStatus.display === 'denied') {
      console.log('Notification permissions denied');
      return false;
    }
    
    const request = await LocalNotifications.requestPermissions();
    return request.display === 'granted';
  } catch (error) {
    console.error('Error requesting notification permissions:', error);
    return false;
  }
}

// Schedule a notification for a task
export async function scheduleTaskNotification(task: {
  id: string;
  title: string;
  alarm?: string;
  repeats?: string;
  detail?: string;
}): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    console.log('Skipping notification scheduling on web');
    return;
  }
  
  if (!task.alarm) {
    console.log('No alarm set for task');
    return;
  }
  
  const time = parseAlarmTime(task.alarm);
  if (!time) {
    console.error('Invalid alarm time format:', task.alarm);
    return;
  }
  
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) {
    console.log('No notification permission');
    return;
  }
  
  // Cancel any existing notifications for this task first
  await cancelTaskNotification(task.id);
  
  const notifications: any[] = [];
  
  if (task.repeats) {
    // Repeating alarm - schedule for each selected day
    const days = task.repeats.split(',').map(d => d.trim());
    
    for (const dayName of days) {
      const weekday = dayToWeekday[dayName];
      if (!weekday) continue;
      
      notifications.push({
        id: generateNotificationId(task.id, dayName),
        title: '🔔 ALARM',
        body: task.title,
        channelId: ALARM_CHANNEL_ID,
        schedule: {
          on: {
            weekday,
            hour: time.hour,
            minute: time.minute,
          },
          allowWhileIdle: true,
        },
        sound: 'alarm_sound.wav',
        smallIcon: 'ic_launcher',
        largeIcon: 'ic_launcher',
        ongoing: true, // Makes notification persistent until dismissed
        autoCancel: false, // Don't auto-dismiss when tapped
      });
    }
  } else {
    // One-time alarm - schedule for today at the specified time
    const now = new Date();
    const scheduleDate = new Date();
    scheduleDate.setHours(time.hour, time.minute, 0, 0);
    
    // Only schedule if the time hasn't passed yet today
    if (scheduleDate <= now) {
      console.log('Alarm time has passed today, not scheduling');
      return;
    }
    
    notifications.push({
      id: generateNotificationId(task.id),
      title: '🔔 ALARM',
      body: task.title,
      channelId: ALARM_CHANNEL_ID,
      schedule: {
        at: scheduleDate,
        allowWhileIdle: true,
      },
      sound: 'alarm_sound.wav',
      smallIcon: 'ic_launcher',
      largeIcon: 'ic_launcher',
      ongoing: true, // Makes notification persistent until dismissed
      autoCancel: false, // Don't auto-dismiss when tapped
    });
  }
  
  if (notifications.length > 0) {
    try {
      await LocalNotifications.schedule({ notifications });
      console.log('Scheduled alarm notifications:', notifications.length);
    } catch (error) {
      console.error('Error scheduling notifications:', error);
    }
  }
}

// Cancel all notifications for a task
export async function cancelTaskNotification(taskId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  
  try {
    const pending = await LocalNotifications.getPending();
    const taskNotificationIds = pending.notifications
      .filter(n => {
        // Check if notification ID matches any possible ID for this task
        const baseId = generateNotificationId(taskId);
        if (n.id === baseId) return true;
        
        // Check day-specific IDs
        for (const day of Object.keys(dayToWeekday)) {
          if (n.id === generateNotificationId(taskId, day)) return true;
        }
        return false;
      })
      .map(n => ({ id: n.id }));
    
    if (taskNotificationIds.length > 0) {
      await LocalNotifications.cancel({ notifications: taskNotificationIds });
      console.log('Cancelled notifications:', taskNotificationIds.length);
    }
  } catch (error) {
    console.error('Error cancelling notifications:', error);
  }
}

// Initialize notifications and reschedule all alarms
export async function initializeNotifications(tasks: Array<{
  id: string;
  title: string;
  alarm?: string;
  repeats?: string;
  completed?: boolean;
}>): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;
  
  // Create alarm channel for high-priority notifications
  await createAlarmChannel();
  
  // Cancel notifications for any completed tasks (cleanup)
  for (const task of tasks) {
    if (task.completed) {
      await cancelTaskNotification(task.id);
    }
  }
  
  // Schedule notifications for all incomplete tasks with alarms
  for (const task of tasks) {
    if (!task.completed && task.alarm) {
      await scheduleTaskNotification(task);
    }
  }
}
