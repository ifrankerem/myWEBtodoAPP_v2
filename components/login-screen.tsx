"use client"

import { useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { XpIcon } from "@/components/xp-icons"

/** The XP welcome screen: pick how to sign in, then type credentials in place. */
export default function LoginScreen() {
  const { signIn, signUp, signInWithGoogle, error, clearError } = useAuth()
  const [isSignUp, setIsSignUp] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!email.trim() || !password) {
      setMissing(true)
      return
    }
    setMissing(false)
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
    setMissing(false)
    clearError()
  }

  const problem = missing
    ? { title: "Email or password missing", text: "Type both, then tap the green arrow." }
    : error
      ? { title: isSignUp ? "Could not create the account" : "Could not sign in", text: error }
      : null

  return (
    <main className="xp-login" aria-labelledby="login-title">
      <div className="xp-login-top" />
      <div className="xp-login-mid">
        <div className="xp-login-brand">
          <XpIcon name="logo" size={60} />
          <div>
            <h1 id="login-title">Task Manager</h1>
            <p>{isSignUp ? "Create an account to keep your tasks in sync." : "To begin, choose how to sign in."}</p>
          </div>
        </div>
        <div className="xp-login-divider" />
        <div className="xp-login-tiles">
          <button
            type="button"
            className={`xp-login-tile${emailOpen ? " is-on" : ""}`}
            aria-expanded={emailOpen}
            onClick={() => setEmailOpen((open) => !open)}
          >
            <span className="xp-login-pic"><XpIcon name="mail" size={56} /></span>
            <span>
              <b>{isSignUp ? "Sign up with email" : "Sign in with email"}</b>
              <small>{emailOpen ? "Type your email and password" : "Use your email and password"}</small>
            </span>
          </button>

          {emailOpen && (
            <form className="xp-login-form" onSubmit={handleSubmit}>
              <label>
                Email
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" autoFocus />
              </label>
              <label>
                Password
                <span className="xp-login-pw">
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    minLength={6}
                  />
                  <button type="submit" className="xp-login-go" disabled={loading} aria-label={isSignUp ? "Create account" : "Sign in"}>
                    <XpIcon name="go" size={32} />
                  </button>
                </span>
              </label>
              {problem && (
                <div className="xp-balloon is-inline" role="alert">
                  <div className="xp-balloon-title"><XpIcon name="info" size={16} />{problem.title}</div>
                  <p style={{ margin: 0 }}>{problem.text}</p>
                </div>
              )}
            </form>
          )}

          <button type="button" className="xp-login-tile" onClick={handleGoogleSignIn} disabled={loading}>
            <span className="xp-login-pic"><XpIcon name="google" size={56} /></span>
            <span>
              <b>Continue with Google</b>
              <small>{loading ? "Signing in…" : "Uses your Google account"}</small>
            </span>
          </button>

          {!emailOpen && error && (
            <div className="xp-balloon is-inline" role="alert">
              <div className="xp-balloon-title"><XpIcon name="info" size={16} />Could not sign in</div>
              <p style={{ margin: 0 }}>{error}</p>
            </div>
          )}
        </div>
      </div>
      <div className="xp-login-bottom">
        <span className="xp-band-line" />
        <button type="button" onClick={toggleMode}>
          <XpIcon name={isSignUp ? "back" : "newTask"} size={26} />
          <span>{isSignUp ? "I already have an account" : "Create an account"}</span>
        </button>
        <p>After you sign in, your tasks sync across your devices.</p>
      </div>
    </main>
  )
}
