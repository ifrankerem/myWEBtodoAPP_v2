// IndexedDB storage layer using Dexie.js.
//
// The app writes to Firestore; this layer is only what the first sign-in reads
// from (the local-to-cloud migration) plus the image compression the Properties
// sheet uses. The old CRUD surface went with it.
import Dexie, { type Table } from 'dexie';
import type { RepeatRule } from './repeat-rule';

export interface TaskRecord {
  id: string;
  title: string;
  detail?: string;
  photo?: string; // Base64 encoded image
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  alarm?: string;
  /** Legacy "Mon, Wed, Fri" string, kept so older clients and the .ics export still work. */
  repeats?: string;
  /** Structured repeat, preferred over `repeats` when present. */
  repeatRule?: RepeatRule;
  dueDate?: string;
  sortOrder?: number;
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

export function compressImage(
  src: string,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.7,
  maxSizeBytes = 700_000 // keep well under 1MB Firestore limit
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      // Scale down proportionally
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas context unavailable')); return; }
      ctx.drawImage(img, 0, 0, width, height);

      // Iteratively reduce quality until size is acceptable
      let q = quality;
      let result = canvas.toDataURL('image/jpeg', q);
      while (result.length > maxSizeBytes && q > 0.1) {
        q -= 0.1;
        result = canvas.toDataURL('image/jpeg', q);
      }

      resolve(result);
    };
    img.onerror = () => reject(new Error('Failed to load image for compression'));
    img.src = src;
  });
}

