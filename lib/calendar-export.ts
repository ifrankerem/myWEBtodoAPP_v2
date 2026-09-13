// Calendar export utility for iOS PWA alarm fallback
// Generates .ics files that can be imported into native calendar apps

import { isRepeating, toRepeatRule, type RepeatRule } from './repeat-rule';
import { parseAlarmTime, parseTaskDate } from './task-dates';
import { saveTextFile } from './save-file';

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  alarm: string; // "HH:MM" format
  repeats?: string; // legacy "Mon, Wed, Fri" format
  repeatRule?: RepeatRule;
  dueDate?: string; // "YYYY-MM-DD" format
}

// Weekday index (0 = Sunday) to RRULE day abbreviation
const RRULE_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// Build the RRULE line for a repeat rule, or '' when the event does not repeat
function toRRule(rule: RepeatRule): string {
  switch (rule.kind) {
    case 'none':
      return '';
    case 'daily':
      return `RRULE:FREQ=DAILY${rule.interval > 1 ? `;INTERVAL=${rule.interval}` : ''}`;
    case 'weekly': {
      const days = rule.days.map((day) => RRULE_DAYS[day]).join(',');
      if (!days) return '';
      return `RRULE:FREQ=WEEKLY${rule.interval > 1 ? `;INTERVAL=${rule.interval}` : ''};BYDAY=${days}`;
    }
    case 'monthly':
      return `RRULE:FREQ=MONTHLY;BYMONTHDAY=${rule.dayOfMonth}`;
  }
}

// Format date to iCalendar format (YYYYMMDDTHHMMSS)
function formatDateToICS(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

// Generate a single calendar event
function generateEvent(event: CalendarEvent): string {
  const time = parseAlarmTime(event.alarm);
  if (!time) return '';

  const rule = toRepeatRule(event);

  // Calculate start date
  let startDate: Date;

  if (event.dueDate) {
    startDate = parseTaskDate(event.dueDate);
  } else {
    startDate = new Date();
  }
  
  startDate.setHours(time.hour, time.minute, 0, 0);
  
  // If no repeat and date is in the past, use next occurrence
  if (!event.dueDate && !isRepeating(rule) && startDate <= new Date()) {
    startDate.setDate(startDate.getDate() + 1);
  }
  
  // End date is 30 minutes after start
  const endDate = new Date(startDate);
  endDate.setMinutes(endDate.getMinutes() + 30);
  
  // Generate RRULE for repeating events
  const rrule = toRRule(rule);
  
  // Generate unique ID
  const uid = `task-${event.id}@taskmanager.app`;
  
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatDateToICS(new Date())}`,
    `DTSTART:${formatDateToICS(startDate)}`,
    `DTEND:${formatDateToICS(endDate)}`,
    `SUMMARY:${escapeICSText(event.title)}`,
  ];
  
  if (event.description) {
    lines.push(`DESCRIPTION:${escapeICSText(event.description)}`);
  }
  
  if (rrule) {
    lines.push(rrule);
  }
  
  // Add alarm (15 minutes before)
  lines.push(
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeICSText(event.title)}`,
    'END:VALARM'
  );
  
  // Add second alarm (at event time)
  lines.push(
    'BEGIN:VALARM',
    'TRIGGER:PT0M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeICSText(event.title)}`,
    'END:VALARM'
  );
  
  lines.push('END:VEVENT');
  
  return lines.join('\r\n');
}

// Escape text for ICS format
function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n');
}

// Generate full ICS calendar file
export function generateICSCalendar(events: CalendarEvent[]): string {
  const header = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Task Manager//Task Manager PWA//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Task Manager Alarms',
  ].join('\r\n');
  
  const footer = 'END:VCALENDAR';
  
  const eventStrings = events
    .filter(e => e.alarm)
    .map(generateEvent)
    .filter(Boolean);
  
  return [header, ...eventStrings, footer].join('\r\n');
}

// Export single task to ICS
export async function exportTaskToICS(task: CalendarEvent): Promise<void> {
  const icsContent = generateICSCalendar([task]);
  await downloadICS(icsContent, `task-${task.id}.ics`);
}

// Export all tasks with alarms to ICS
export async function exportAllAlarmsToICS(tasks: CalendarEvent[]): Promise<void> {
  const tasksWithAlarms = tasks.filter(t => t.alarm);

  if (tasksWithAlarms.length === 0) {
    alert('No tasks with alarms to export.');
    return;
  }

  const icsContent = generateICSCalendar(tasksWithAlarms);
  await downloadICS(icsContent, 'task-manager-alarms.ics');
}

// Download ICS file (share sheet on native)
function downloadICS(content: string, filename: string): Promise<void> {
  return saveTextFile(filename, content, 'text/calendar;charset=utf-8');
}
