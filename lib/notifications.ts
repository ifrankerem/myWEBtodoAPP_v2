// Notification service for scheduling alarms using Capacitor Local Notifications
// Works on real Android/iOS devices

import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type Channel, type LocalNotificationSchema } from '@capacitor/local-notifications';
import { getNextFireAt, type AlarmTaskInput } from './alarm-schedule';
import { DAY_NAMES, toRepeatRule } from './repeat-rule';
import { parseAlarmTime } from './task-dates';

// LocalNotifications numbers weekdays from 1 (Sunday), Date#getDay from 0.
function toCapacitorWeekday(dayIndex: number): number {
  return dayIndex + 1;
}

// Alarm channel ID
const ALARM_CHANNEL_ID = 'task-alarms';

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
export async function scheduleTaskNotification(task: AlarmTaskInput): Promise<void> {
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
  
  const notifications: LocalNotificationSchema[] = [];
  
  const rule = toRepeatRule(task);

  const alarmDefaults = {
    title: '🔔 ALARM',
    body: task.title,
    channelId: ALARM_CHANNEL_ID,
    sound: 'alarm_sound.wav',
    smallIcon: 'ic_launcher',
    largeIcon: 'ic_launcher',
    ongoing: true, // Makes notification persistent until dismissed
    autoCancel: false, // Don't auto-dismiss when tapped
  } as const;

  if (rule.kind === 'weekly' && rule.interval === 1) {
    // The only shape LocalNotifications can repeat natively: same weekday every
    // week. One notification per selected day.
    for (const dayIndex of rule.days) {
      notifications.push({
        ...alarmDefaults,
        id: generateNotificationId(task.id, DAY_NAMES[dayIndex]),
        schedule: {
          on: {
            weekday: toCapacitorWeekday(dayIndex),
            hour: time.hour,
            minute: time.minute,
          },
          allowWhileIdle: true,
        },
      });
    }
  } else {
    // Everything else — one-shot alarms, and repeats the native scheduler
    // cannot express (intervals, monthly) — is scheduled as the single next
    // occurrence. It is re-scheduled whenever the task list changes.
    const fireAt = getNextFireAt(task);
    if (fireAt === null) {
      console.log('No upcoming occurrence to schedule for', task.id);
      return;
    }

    notifications.push({
      ...alarmDefaults,
      id: generateNotificationId(task.id),
      schedule: {
        at: new Date(fireAt),
        allowWhileIdle: true,
      },
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
        for (const day of DAY_NAMES) {
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
export async function initializeNotifications(tasks: AlarmTaskInput[]): Promise<void> {
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
