"use client"

import { useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { Mail, Lock, ArrowRight, Loader2 } from "lucide-react"

export default function LoginScreen() {
  const { signIn, signUp, signInWithGoogle, error, clearError } = useAuth()
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return

    setLoading(true)
    try {
      if (isSignUp) {
        await signUp(email, password)
      } else {
        await signIn(email, password)
      }
    } catch {
      // Error is handled by auth context
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setLoading(true)
    try {
      await signInWithGoogle()
    } catch {
      // Error is handled by auth context
    } finally {
      setLoading(false)
    }
  }

  const toggleMode = () => {
    setIsSignUp(!isSignUp)
    clearError()
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative z-10">
      <div className="w-full max-w-sm animate-fade-in">
        {/* Logo / Brand */}
        <div className="text-center mb-10">
          <div
            className="w-12 h-12 rounded-2xl bg-[var(--ember)] mx-auto mb-5 flex items-center justify-center shadow-[0_0_25px_rgba(var(--ember-rgb),0.3)]"
          >
            <span className="text-[var(--obsidian)] text-xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>T</span>
          </div>
          <h1
            className="text-2xl font-bold text-[var(--metal-bright)] tracking-wider"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            TASK MANAGER
          </h1>
          <p className="text-[var(--metal-muted)] text-sm mt-2 font-light">
            {isSignUp ? 'Create an account to sync your tasks' : 'Sign in to sync across devices'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email Input */}
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--metal-muted)]" />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-[var(--obsidian-1)] border border-[var(--obsidian-border)] rounded-xl text-[var(--metal-bright)] placeholder-[var(--metal-muted)] text-sm focus:outline-none focus:border-[var(--ember)] focus:shadow-[0_0_10px_rgba(var(--ember-rgb),0.15)] transition-all duration-300"
              autoComplete="email"
              required
            />
          </div>

          {/* Password Input */}
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--metal-muted)]" />
            <input
              type="password"
              placeholder={isSignUp ? "Password (min 6 chars)" : "Password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-[var(--obsidian-1)] border border-[var(--obsidian-border)] rounded-xl text-[var(--metal-bright)] placeholder-[var(--metal-muted)] text-sm focus:outline-none focus:border-[var(--ember)] focus:shadow-[0_0_10px_rgba(var(--ember-rgb),0.15)] transition-all duration-300"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              minLength={6}
              required
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-xl bg-[var(--forge-red)]/10 border border-[var(--forge-red)]/25 text-[var(--forge-red)] text-xs font-light animate-fade-in">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-[var(--ember)] text-[var(--obsidian)] rounded-xl font-bold text-sm tracking-wider flex items-center justify-center gap-2 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-[0_0_20px_rgba(var(--ember-rgb),0.25)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                {isSignUp ? 'CREATE ACCOUNT' : 'SIGN IN'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 h-px bg-[var(--obsidian-border)]" />
          <span className="text-[var(--metal-muted)] text-xs font-light">or</span>
          <div className="flex-1 h-px bg-[var(--obsidian-border)]" />
        </div>

        {/* Google Sign In */}
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full py-3.5 bg-[var(--obsidian-1)] border border-[var(--obsidian-border)] rounded-xl text-[var(--metal-bright)] text-sm flex items-center justify-center gap-3 hover:border-[var(--metal-muted)] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Continue with Google
        </button>

        {/* Toggle Sign In / Sign Up */}
        <div className="text-center mt-6">
          <button
            onClick={toggleMode}
            className="text-[var(--metal-muted)] text-sm font-light hover:text-[var(--ember)] transition-colors"
          >
            {isSignUp
              ? 'Already have an account? Sign in'
              : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  )
}
