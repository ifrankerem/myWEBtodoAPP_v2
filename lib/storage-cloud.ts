// Cloud storage layer using Firebase Firestore
// Each user gets their own collection: users/{userId}/tasks/{taskId}
// Real-time sync via onSnapshot + offline persistence

import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  writeBatch,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type { TaskRecord } from './storage-idb';

// Get the tasks collection path for a user
function tasksCollection(userId: string) {
  return collection(db, 'users', userId, 'tasks');
}

// Get a specific task document reference
function taskDoc(userId: string, taskId: string) {
  return doc(db, 'users', userId, 'tasks', taskId);
}

// Generate unique ID (same as storage-idb)
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Firestore doesn't allow undefined values — strip them before writing
function stripUndefined(obj: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  );
}

// Get all tasks from Firestore (one-time fetch)
export async function getCloudTasks(userId: string): Promise<TaskRecord[]> {
  try {
    const q = query(tasksCollection(userId), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as TaskRecord[];
  } catch (error) {
    console.error('Error getting cloud tasks:', error);
    return [];
  }
}

// Subscribe to real-time task updates
// Returns an unsubscribe function
export function subscribeToTasks(
  userId: string,
  callback: (tasks: TaskRecord[]) => void
): Unsubscribe {
  const q = query(tasksCollection(userId), orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const tasks = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as TaskRecord[];
      callback(tasks);
    },
    (error) => {
      console.error('Error listening to tasks:', error);
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
  };

  await setDoc(taskDoc(userId, taskId), stripUndefined(newTask));
  return newTask;
}

// Update a task in Firestore
export async function updateCloudTask(
  userId: string,
  taskId: string,
  updates: Partial<TaskRecord>
): Promise<void> {
  try {
    await updateDoc(taskDoc(userId, taskId), stripUndefined({
      ...updates,
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

// Save all tasks (bulk replace) — used for reordering
export async function saveCloudTasks(
  userId: string,
  tasks: TaskRecord[]
): Promise<void> {
  try {
    const batch = writeBatch(db);

    // Delete all existing tasks
    const existing = await getDocs(tasksCollection(userId));
    existing.docs.forEach((doc) => batch.delete(doc.ref));

    // Add all tasks with their IDs
    tasks.forEach((task) => {
      const ref = taskDoc(userId, task.id);
      batch.set(ref, stripUndefined(task) as TaskRecord);
    });

    await batch.commit();
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
    const batch = writeBatch(db);
    localTasks.forEach((task) => {
      const ref = taskDoc(userId, task.id);
      batch.set(ref, stripUndefined(task) as TaskRecord);
    });
    await batch.commit();

    return { migrated: localTasks.length };
  } catch (error) {
    console.error('Error migrating to cloud:', error);
    return { migrated: 0 };
  }
}
