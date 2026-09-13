"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { FirebaseError } from 'firebase/app';
import { getAuthInstance } from './firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const auth = getAuthInstance();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      setError(null);
      await signInWithEmailAndPassword(getAuthInstance(), email, password);
    } catch (err: unknown) {
      const message = getAuthErrorMessage(getAuthErrorCode(err));
      setError(message);
      throw err;
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      setError(null);
      await createUserWithEmailAndPassword(getAuthInstance(), email, password);
    } catch (err: unknown) {
      const message = getAuthErrorMessage(getAuthErrorCode(err));
      setError(message);
      throw err;
    }
  };

  const signInWithGoogle = async () => {
    try {
      setError(null);
      if (Capacitor.isNativePlatform()) {
        // Popups do not work in the WebView: the native Google account picker
        // produces an ID token, and the JS SDK signs in with it.
        const result = await FirebaseAuthentication.signInWithGoogle();
        const idToken = result.credential?.idToken;
        if (!idToken) throw new Error('Google sign-in returned no ID token');
        await signInWithCredential(getAuthInstance(), GoogleAuthProvider.credential(idToken));
        return;
      }
      const provider = new GoogleAuthProvider();
      await signInWithPopup(getAuthInstance(), provider);
    } catch (err: unknown) {
      const code = getAuthErrorCode(err);
      if (code === 'auth/popup-closed-by-user' || isNativeSignInCancel(err)) return;
      // "[16] Account reauth failed" / "[10]": the signing key's SHA-1 is not
      // registered for this app in Firebase, so Google rejects the credential.
      const message = /\[(10|16)\]/.test(err instanceof Error ? err.message : '')
        ? 'Google sign-in is not configured for this build. Use email and password.'
        : getAuthErrorMessage(code);
      setError(message);
      throw err;
    }
  };

  const signOut = async () => {
    try {
      setError(null);
      await firebaseSignOut(getAuthInstance());
      if (Capacitor.isNativePlatform()) {
        // Clear the cached Google account so the picker shows again next time.
        await FirebaseAuthentication.signOut().catch(() => {});
      }
    } catch (err: unknown) {
      setError('Failed to sign out. Please try again.');
      throw err;
    }
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signInWithGoogle, signOut, error, clearError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

function isNativeSignInCancel(error: unknown): boolean {
  return error instanceof Error && /cancel/i.test(error.message);
}

function getAuthErrorCode(error: unknown): string {
  return error instanceof FirebaseError ? error.code : '';
}

// Human-readable error messages
function getAuthErrorMessage(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'This email is already registered. Try signing in instead.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/user-not-found':
      return 'No account found with this email. Try signing up.';
    case 'auth/wrong-password':
      return 'Incorrect password. Please try again.';
    case 'auth/invalid-credential':
      return 'Invalid email or password. Please try again.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
