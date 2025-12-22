// Local Storage based data service - no backend needed
// All data stored on device using localStorage

export interface Task {
  id: string;
  title: string;
  detail?: string;
  photo?: string; // Base64 encoded image
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  alarm?: string;
  repeats?: string; // "Mon, Wed, Fri"
  dueDate?: string;
}

const STORAGE_KEY = 'taskmanager_tasks';

// Get all tasks from localStorage
export function getTasks(): Task[] {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// Save all tasks to localStorage
export function saveTasks(tasks: Task[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

// Generate unique ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Create a new task
export function createTask(data: {
  title: string;
  detail?: string;
  photo?: string;
  alarm?: string;
  repeats?: string;
  dueDate?: string;
}): Task {
  const tasks = getTasks();
  const now = new Date().toISOString();
  
  const newTask: Task = {
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
  
  tasks.unshift(newTask);
  saveTasks(tasks);
  return newTask;
}

// Update a task
export function updateTask(id: string, updates: Partial<Task>): Task | null {
  const tasks = getTasks();
  const index = tasks.findIndex(t => t.id === id);
  if (index === -1) return null;
  
  tasks[index] = {
    ...tasks[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  
  saveTasks(tasks);
  return tasks[index];
}

// Delete a task
export function deleteTask(id: string): boolean {
  const tasks = getTasks();
  const filtered = tasks.filter(t => t.id !== id);
  if (filtered.length === tasks.length) return false;
  saveTasks(filtered);
  return true;
}

// Toggle task completion
export function toggleTaskComplete(id: string): Task | null {
  const tasks = getTasks();
  const task = tasks.find(t => t.id === id);
  if (!task) return null;
  return updateTask(id, { completed: !task.completed });
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

// Reorder tasks - save new order to storage
export function reorderTasks(taskIds: string[]): Task[] {
  const tasks = getTasks();
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  
  // Create new array with completed tasks maintaining relative order
  const incompleteTasks = taskIds
    .map(id => taskMap.get(id))
    .filter((t): t is Task => t !== undefined && !t.completed);
  
  const completedTasks = tasks.filter(t => t.completed);
  
  const reordered = [...incompleteTasks, ...completedTasks];
  saveTasks(reordered);
  return reordered;
}

