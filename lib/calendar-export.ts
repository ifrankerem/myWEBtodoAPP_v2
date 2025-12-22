// Calendar export utility for iOS PWA alarm fallback
// Generates .ics files that can be imported into native calendar apps

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  alarm: string; // "HH:MM" format
  repeats?: string; // "Mon, Wed, Fri" format
  dueDate?: string; // "YYYY-MM-DD" format
}

// Convert day names to RRULE format
const dayNameToRRule: Record<string, string> = {
  'Sun': 'SU',
  'Mon': 'MO',
  'Tue': 'TU',
  'Wed': 'WE',
  'Thu': 'TH',
  'Fri': 'FR',
  'Sat': 'SA',
};

// Format date to iCalendar format (YYYYMMDDTHHMMSS)
function formatDateToICS(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

// Parse alarm time "HH:MM" to hours and minutes
function parseAlarmTime(alarm: string): { hour: number; minute: number } | null {
  const match = alarm.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  
  return { hour, minute };
}

// Generate a single calendar event
function generateEvent(event: CalendarEvent): string {
  const time = parseAlarmTime(event.alarm);
  if (!time) return '';
  
  // Calculate start date
  let startDate: Date;
  
  if (event.dueDate) {
    startDate = new Date(event.dueDate);
  } else {
    startDate = new Date();
  }
  
  startDate.setHours(time.hour, time.minute, 0, 0);
  
  // If no repeat and date is in the past, use next occurrence
  if (!event.repeats && startDate <= new Date()) {
    startDate.setDate(startDate.getDate() + 1);
  }
  
  // End date is 30 minutes after start
  const endDate = new Date(startDate);
  endDate.setMinutes(endDate.getMinutes() + 30);
  
  // Generate RRULE for repeating events
  let rrule = '';
  if (event.repeats) {
    const days = event.repeats.split(',').map(d => d.trim());
    const rruleDays = days
      .map(d => dayNameToRRule[d])
      .filter(Boolean)
      .join(',');
    
    if (rruleDays) {
      rrule = `RRULE:FREQ=WEEKLY;BYDAY=${rruleDays}`;
    }
  }
  
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
    .replace(/\n/g, '\\n');
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
export function exportTaskToICS(task: CalendarEvent): void {
  const icsContent = generateICSCalendar([task]);
  downloadICS(icsContent, `task-${task.id}.ics`);
}

// Export all tasks with alarms to ICS
export function exportAllAlarmsToICS(tasks: CalendarEvent[]): void {
  const tasksWithAlarms = tasks.filter(t => t.alarm);
  
  if (tasksWithAlarms.length === 0) {
    alert('No tasks with alarms to export.');
    return;
  }
  
  const icsContent = generateICSCalendar(tasksWithAlarms);
  downloadICS(icsContent, 'task-manager-alarms.ics');
}

// Download ICS file
function downloadICS(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}
