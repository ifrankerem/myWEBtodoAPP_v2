// Cloud storage layer using Firebase Firestore
// Each user gets their own collection: users/{userId}/tasks/{taskId}
// Real-time sync via onSnapshot + offline persistence

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  writeBatch,
  deleteField,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDbInstance } from './firebase';
import type { TaskRecord } from './storage-idb';

// Get the tasks collection path for a user
function tasksCollection(userId: string) {
  return collection(getDbInstance(), 'users', userId, 'tasks');
}

// Get a specific task document reference
function taskDoc(userId: string, taskId: string) {
  return doc(getDbInstance(), 'users', userId, 'tasks', taskId);
}

// Generate unique ID (same as storage-idb)
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Firestore doesn't allow undefined values — strip them before writing
function stripUndefined<T extends object>(obj: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  );
}

function sortTasks(tasks: TaskRecord[]): TaskRecord[] {
  return tasks.sort((a, b) => {
    const aCreatedAt = Date.parse(a.createdAt);
    const bCreatedAt = Date.parse(b.createdAt);
    const aOrder = a.sortOrder ?? (Number.isNaN(aCreatedAt) ? 0 : -aCreatedAt);
    const bOrder = b.sortOrder ?? (Number.isNaN(bCreatedAt) ? 0 : -bCreatedAt);
    return aOrder - bOrder;
  });
}

export type CloudTaskUpdates = Partial<Omit<TaskRecord, 'detail' | 'photo' | 'alarm' | 'repeats' | 'dueDate'>> & {
  detail?: string | null;
  photo?: string | null;
  alarm?: string | null;
  repeats?: string | null;
  dueDate?: string | null;
};

// Get all tasks from Firestore (one-time fetch)
export async function getCloudTasks(userId: string): Promise<TaskRecord[]> {
  try {
    const snapshot = await getDocs(tasksCollection(userId));
    return sortTasks(snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as TaskRecord[]);
  } catch (error) {
    console.error('Error getting cloud tasks:', error);
    throw error;
  }
}

// Subscribe to real-time task updates
// Returns an unsubscribe function
export function subscribeToTasks(
  userId: string,
  callback: (tasks: TaskRecord[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    tasksCollection(userId),
    (snapshot) => {
      const tasks = sortTasks(snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as TaskRecord[]);
      callback(tasks);
    },
    (error) => {
      console.error('Error listening to tasks:', error);
      onError?.(error);
    }
  );
}

// Create a new task in Firestore
export async function createCloudTask(
  userId: string,
  data: {
    title: string;
    detail?: string;
    photo?: string;
    alarm?: string;
    repeats?: string;
    dueDate?: string;
  }
): Promise<TaskRecord> {
  const now = new Date().toISOString();
  const taskId = generateId();

  const newTask: TaskRecord = {
    id: taskId,
    title: data.title,
    detail: data.detail,
    photo: data.photo,
    completed: false,
    createdAt: now,
    updatedAt: now,
    alarm: data.alarm,
    repeats: data.repeats,
    dueDate: data.dueDate,
    sortOrder: -Date.now(),
  };

  await setDoc(taskDoc(userId, taskId), stripUndefined(newTask));
  return newTask;
}

// Update a task in Firestore
export async function updateCloudTask(
  userId: string,
  taskId: string,
  updates: CloudTaskUpdates
): Promise<void> {
  try {
    const firestoreUpdates = Object.fromEntries(
      Object.entries(updates).map(([key, value]) => [key, value === null ? deleteField() : value])
    );
    await updateDoc(taskDoc(userId, taskId), stripUndefined({
      ...firestoreUpdates,
      updatedAt: new Date().toISOString(),
    }));
  } catch (error) {
    console.error('Error updating cloud task:', error);
  }
}

// Delete a task from Firestore
export async function deleteCloudTask(
  userId: string,
  taskId: string
): Promise<boolean> {
  try {
    await deleteDoc(taskDoc(userId, taskId));
    return true;
  } catch (error) {
    console.error('Error deleting cloud task:', error);
    return false;
  }
}

// Toggle task completion in Firestore
export async function toggleCloudTaskComplete(
  userId: string,
  taskId: string,
  currentCompleted: boolean
): Promise<void> {
  await updateCloudTask(userId, taskId, {
    completed: !currentCompleted,
  });
}

// Persist task order without deleting documents or replacing concurrent changes.
export async function saveCloudTasks(
  userId: string,
  tasks: TaskRecord[]
): Promise<void> {
  try {
    const chunkSize = 450;
    for (let start = 0; start < tasks.length; start += chunkSize) {
      const batch = writeBatch(getDbInstance());
      tasks.slice(start, start + chunkSize).forEach((task, index) => {
        const sortOrder = start + index;
        const ref = taskDoc(userId, task.id);
        batch.set(ref, stripUndefined({ ...task, sortOrder }), { merge: true });
      });
      await batch.commit();
    }
  } catch (error) {
    console.error('Error saving cloud tasks:', error);
  }
}

// Migrate local IndexedDB tasks to Firestore (one-time on first sign-in)
export async function migrateLocalToCloud(
  userId: string,
  localTasks: TaskRecord[]
): Promise<{ migrated: number }> {
  if (localTasks.length === 0) return { migrated: 0 };

  try {
    // Check if user already has cloud tasks
    const existingTasks = await getCloudTasks(userId);
    if (existingTasks.length > 0) {
      // User already has cloud data — don't overwrite
      return { migrated: 0 };
    }

    // Upload all local tasks to Firestore
    const batch = writeBatch(getDbInstance());
    localTasks.forEach((task, sortOrder) => {
      const ref = taskDoc(userId, task.id);
      batch.set(ref, stripUndefined({ ...task, sortOrder }));
    });
    await batch.commit();

    return { migrated: localTasks.length };
  } catch (error) {
    console.error('Error migrating to cloud:', error);
    return { migrated: 0 };
  }
}
