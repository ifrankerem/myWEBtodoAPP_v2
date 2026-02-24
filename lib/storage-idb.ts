// IndexedDB storage layer using Dexie.js for offline-first PWA
// Stores tasks and photos as blobs for better performance

import Dexie, { type Table } from 'dexie';

export interface TaskRecord {
  id: string;
  title: string;
  detail?: string;
  photo?: string; // Base64 encoded image
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  alarm?: string;
  repeats?: string;
  dueDate?: string;
}

class TaskManagerDatabase extends Dexie {
  tasks!: Table<TaskRecord>;

  constructor() {
    super('TaskManagerDB');
    this.version(1).stores({
      tasks: 'id, completed, createdAt, updatedAt, dueDate'
    });
  }
}

const db = new TaskManagerDatabase();

// Storage key for legacy localStorage data
const LEGACY_STORAGE_KEY = 'taskmanager_tasks';

// Check if we need to migrate from localStorage to IndexedDB
export async function migrateFromLocalStorage(): Promise<void> {
  if (typeof window === 'undefined') return;
  
  try {
    const legacyData = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacyData) return;
    
    const legacyTasks: TaskRecord[] = JSON.parse(legacyData);
    if (!legacyTasks || legacyTasks.length === 0) return;
    
    // Check if IndexedDB already has data
    const existingCount = await db.tasks.count();
    if (existingCount > 0) {
      // Already migrated, remove legacy data
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return;
    }
    
    // Migrate legacy tasks to IndexedDB
    await db.tasks.bulkPut(legacyTasks);
    
    // Remove legacy data after successful migration
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    console.log(`Migrated ${legacyTasks.length} tasks from localStorage to IndexedDB`);
  } catch (error) {
    console.error('Migration from localStorage failed:', error);
  }
}

// Get all tasks from IndexedDB
export async function getTasks(): Promise<TaskRecord[]> {
  try {
    await migrateFromLocalStorage();
    const tasks = await db.tasks.toArray();
    // Sort by creation time, newest first
    return tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    console.error('Error getting tasks:', error);
    return [];
  }
}

// Save all tasks (bulk replace)
export async function saveTasks(tasks: TaskRecord[]): Promise<void> {
  try {
    await db.transaction('rw', db.tasks, async () => {
      await db.tasks.clear();
      await db.tasks.bulkPut(tasks);
    });
  } catch (error) {
    console.error('Error saving tasks:', error);
  }
}

// Generate unique ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Create a new task
export async function createTask(data: {
  title: string;
  detail?: string;
  photo?: string;
  alarm?: string;
  repeats?: string;
  dueDate?: string;
}): Promise<TaskRecord> {
  const now = new Date().toISOString();
  
  const newTask: TaskRecord = {
    id: generateId(),
    title: data.title,
    detail: data.detail,
    photo: data.photo,
    completed: false,
    createdAt: now,
    updatedAt: now,
    alarm: data.alarm,
    repeats: data.repeats,
    dueDate: data.dueDate,
  };
  
  await db.tasks.add(newTask);
  return newTask;
}

// Update a task
export async function updateTask(id: string, updates: Partial<TaskRecord>): Promise<TaskRecord | null> {
  try {
    const task = await db.tasks.get(id);
    if (!task) return null;
    
    const updatedTask = {
      ...task,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    
    await db.tasks.put(updatedTask);
    return updatedTask;
  } catch (error) {
    console.error('Error updating task:', error);
    return null;
  }
}

// Delete a task
export async function deleteTask(id: string): Promise<boolean> {
  try {
    await db.tasks.delete(id);
    return true;
  } catch (error) {
    console.error('Error deleting task:', error);
    return false;
  }
}

// Toggle task completion
export async function toggleTaskComplete(id: string): Promise<TaskRecord | null> {
  try {
    const task = await db.tasks.get(id);
    if (!task) return null;
    return await updateTask(id, { completed: !task.completed });
  } catch (error) {
    console.error('Error toggling task:', error);
    return null;
  }
}

// Convert File to Base64
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Reorder tasks
export async function reorderTasks(taskIds: string[]): Promise<TaskRecord[]> {
  const tasks = await getTasks();
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  
  const incompleteTasks = taskIds
    .map(id => taskMap.get(id))
    .filter((t): t is TaskRecord => t !== undefined && !t.completed);
  
  const completedTasks = tasks.filter(t => t.completed);
  
  const reordered = [...incompleteTasks, ...completedTasks];
  await saveTasks(reordered);
  return reordered;
}

// Export all data as JSON
export async function exportData(): Promise<string> {
  const tasks = await getTasks();
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks
  }, null, 2);
}

// Import data from JSON
export async function importData(jsonString: string): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const data = JSON.parse(jsonString);
    
    if (!data.tasks || !Array.isArray(data.tasks)) {
      return { success: false, count: 0, error: 'Invalid data format' };
    }
    
    // Clear existing and import
    await db.transaction('rw', db.tasks, async () => {
      await db.tasks.clear();
      await db.tasks.bulkPut(data.tasks);
    });
    
    return { success: true, count: data.tasks.length };
  } catch (error) {
    return { success: false, count: 0, error: String(error) };
  }
}

// Get database instance for direct access if needed
export function getDatabase(): TaskManagerDatabase {
  return db;
}
