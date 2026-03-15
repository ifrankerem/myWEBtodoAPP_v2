// Firebase initialization — LAZY, client-only
// Config values come from environment variables (set in .env.local and Vercel dashboard)
// Uses getter pattern to avoid initializing during server-side prerendering

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Lazy singletons — only initialize when actually needed (i.e., in the browser)
let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _persistenceEnabled = false;

function getApp(): FirebaseApp {
  if (!_app) {
    _app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  }
  return _app;
}

// Auth instance (lazy)
export function getAuthInstance(): Auth {
  if (!_auth) {
    _auth = getAuth(getApp());
  }
  return _auth;
}

// Firestore instance (lazy) + enable offline persistence
export function getDbInstance(): Firestore {
  if (!_db) {
    _db = getFirestore(getApp());

    // Enable offline persistence (browser only, once)
    if (typeof window !== 'undefined' && !_persistenceEnabled) {
      _persistenceEnabled = true;
      enableIndexedDbPersistence(_db).catch((err) => {
        if (err.code === 'failed-precondition') {
          console.warn('Firestore persistence failed: multiple tabs open');
        } else if (err.code === 'unimplemented') {
          console.warn('Firestore persistence not supported in this browser');
        }
      });
    }
  }
  return _db;
}

// Convenience exports for backward compatibility
export const auth = typeof window !== 'undefined' ? getAuthInstance() : (null as unknown as Auth);
export const db = typeof window !== 'undefined' ? getDbInstance() : (null as unknown as Firestore);
