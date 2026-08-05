"use client"

import { useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { ArrowRight, ListTodo, Loader2, Lock, Mail } from "lucide-react"
import { ThemeToggle } from "@/components/xp-ui"

export default function LoginScreen() {
  const { signIn, signUp, signInWithGoogle, error, clearError } = useAuth()
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!email || !password) return
    setLoading(true)
    try {
      if (isSignUp) await signUp(email, password)
      else await signIn(email, password)
    } catch {
      // AuthContext exposes the user-facing error.
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setLoading(true)
    try {
      await signInWithGoogle()
    } catch {
      // AuthContext exposes the user-facing error.
    } finally {
      setLoading(false)
    }
  }

  const toggleMode = () => {
    setIsSignUp((value) => !value)
    clearError()
  }

  return (
    <main className="xp-login-desktop">
      <section className="xp-login-window" aria-labelledby="login-title">
        <div className="xp-titlebar">
          <div className="xp-titlebar-caption">
            <span className="xp-app-icon" aria-hidden="true"><ListTodo /></span>
            <span>Task Manager — {isSignUp ? "Create Account" : "Log On"}</span>
          </div>
          <ThemeToggle showLabel={false} />
        </div>

        <div className="xp-login-banner">
          <span className="xp-login-logo"><ListTodo /></span>
          <div>
            <h1 id="login-title">Task Manager</h1>
            <p>{isSignUp ? "Create an account to sync your tasks." : "Sign in to sync across devices."}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="xp-login-form">
          <div className="xp-field xp-icon-field">
            <label htmlFor="login-email">Email</label>
            <div><Mail aria-hidden="true" /><input id="login-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></div>
          </div>
          <div className="xp-field xp-icon-field">
            <label htmlFor="login-password">Password</label>
            <div><Lock aria-hidden="true" /><input id="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isSignUp ? "new-password" : "current-password"} minLength={6} required /></div>
          </div>

          {error && <div className="xp-alert xp-alert-error" role="alert">{error}</div>}

          <div className="xp-login-actions">
            <button type="submit" className="xp-button xp-primary-button" disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <ArrowRight />}
              {isSignUp ? "Create Account" : "Sign In"}
            </button>
            <button type="button" className="xp-button" onClick={handleGoogleSignIn} disabled={loading}>
              <span className="xp-google-mark" aria-hidden="true">G</span>
              Continue with Google
            </button>
          </div>
        </form>

        <div className="xp-login-footer">
          <button type="button" onClick={toggleMode}>
            {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
          </button>
        </div>
      </section>
    </main>
  )
}
