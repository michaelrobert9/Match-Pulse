import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

// Firebase surfaces auth failures as codes. Say what went wrong and what to do
// about it — never echo the raw code at someone trying to sign in.
function friendlyError(code) {
  switch (code) {
    case 'auth/invalid-email':        return 'That email address doesn’t look right.'
    case 'auth/user-disabled':        return 'This account has been disabled. Contact us to reopen it.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':   return 'That email and password don’t match. Check both and try again.'
    case 'auth/too-many-requests':    return 'Too many attempts. Wait a minute, then try again.'
    case 'auth/popup-closed-by-user': return 'The Google sign-in window closed before finishing.'
    case 'auth/network-request-failed': return 'Can’t reach the network. Check your connection and try again.'
    default:                          return 'Something went wrong signing you in. Please try again.'
  }
}

export default function Login() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [busy,     setBusy]     = useState(false)
  const [sentTo,   setSentTo]   = useState('')

  const { login, signInWithGoogle, resetPassword } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()

  // This login is for the main site itself — managing your account and buying a
  // plan. Signing into a sport happens on that sport's own site, not here.
  const next = params.get('next') || '/account'

  function onward() {
    navigate(next, { replace: true })
  }

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      await login(email.trim(), password)
      await onward()
    } catch (err) {
      setError(friendlyError(err?.code))
      setBusy(false)
    }
  }

  async function google() {
    setBusy(true); setError('')
    try {
      await signInWithGoogle()
      await onward()
    } catch (err) {
      setError(friendlyError(err?.code))
      setBusy(false)
    }
  }

  async function forgot() {
    if (!email.trim()) { setError('Enter your email address first, then tap “Forgot password”.'); return }
    setError('')
    try {
      await resetPassword(email.trim())
      setSentTo(email.trim())
    } catch (err) {
      setError(friendlyError(err?.code))
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <p className="auth-eyebrow">Sign in</p>
        <h1 className="auth-title">Welcome back.</h1>
        <p className="auth-sub">One account for every MatchPulse sport.</p>

        {sentTo && (
          <div className="notice notice-ok">
            Password reset link sent to <strong>{sentTo}</strong>. Check your inbox.
          </div>
        )}

        <form onSubmit={submit} className="auth-form">
          <div className="field">
            <label htmlFor="email">Email address</label>
            <input id="email" type="email" required autoComplete="email"
              value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" required autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" />
          </div>

          {error && <p className="notice notice-err" role="alert">{error}</p>}

          <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <button type="button" className="linkish" onClick={forgot}>Forgot password?</button>

        <div className="auth-divider"><span>or</span></div>

        <button type="button" className="btn btn-ghost auth-submit" onClick={google} disabled={busy}>
          Continue with Google
        </button>

        <p className="auth-foot">
          New here? <Link to="/signup">Create an account</Link>
        </p>
      </div>
    </div>
  )
}
