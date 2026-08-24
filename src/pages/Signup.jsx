import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

function friendlyError(code) {
  switch (code) {
    case 'auth/email-already-in-use': return 'That email already has an account. Sign in instead.'
    case 'auth/invalid-email':        return 'That email address doesn’t look right.'
    case 'auth/weak-password':        return 'Pick a longer password — at least 6 characters.'
    case 'auth/network-request-failed': return 'Can’t reach the network. Check your connection and try again.'
    default:                          return 'Something went wrong creating your account. Please try again.'
  }
}

export default function Signup() {
  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [phone,    setPhone]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [busy,     setBusy]     = useState(false)

  const { signUp, signInWithGoogle } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()

  // Someone who clicked a paid plan lands here first, because an invoice must
  // belong to an account. Now that they have one, send them to raise it.
  // (PayFast checkout is dormant — plans are sold by EFT invoice.)
  function onward() {
    const plan = params.get('plan')
    if (plan === 'event' || plan === 'pro') {
      navigate(`/invoice/new?plan=${plan}`, { replace: true })
      return
    }
    navigate('/account', { replace: true })
  }

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      const cred = await signUp(email.trim(), password, name.trim(), phone.trim())
      await onward(cred)
    } catch (err) {
      setError(friendlyError(err?.code))
      setBusy(false)
    }
  }

  async function google() {
    setBusy(true); setError('')
    try {
      const cred = await signInWithGoogle()
      await onward(cred)
    } catch (err) {
      setError(friendlyError(err?.code))
      setBusy(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <p className="auth-eyebrow">Create account</p>
        <h1 className="auth-title">Start free.</h1>
        <p className="auth-sub">
          One account for every MatchPulse sport. No card, no trial, no end date.
        </p>

        <form onSubmit={submit} className="auth-form">
          <div className="field">
            <label htmlFor="name">Your name</label>
            <input id="name" type="text" required autoComplete="name"
              value={name} onChange={e => setName(e.target.value)} placeholder="First and last name" />
          </div>
          <div className="field">
            <label htmlFor="email">Email address</label>
            <input id="email" type="email" required autoComplete="email"
              value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="field">
            <label htmlFor="phone">Cellphone number</label>
            <input id="phone" type="tel" required autoComplete="tel"
              value={phone} onChange={e => setPhone(e.target.value)} placeholder="0821234567" />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" required autoComplete="new-password" minLength={6}
              value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" />
          </div>

          {error && <p className="notice notice-err" role="alert">{error}</p>}

          <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
            {busy ? 'Creating your account…' : 'Create account'}
          </button>
        </form>

        <div className="auth-divider"><span>or</span></div>

        <button type="button" className="btn btn-ghost auth-submit" onClick={google} disabled={busy}>
          Continue with Google
        </button>

        <p className="auth-foot">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
