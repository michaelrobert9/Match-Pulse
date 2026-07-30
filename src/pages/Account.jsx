import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  updateProfile,
  updatePassword,
  verifyBeforeUpdateEmail,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { auth, identityDb } from '../firebase'
import { SPORTS } from '../lib/sports'

// Firebase requires a recent sign-in before changing an email or password. When
// it asks, we collect the current password and retry rather than dead-ending.
const NEEDS_REAUTH = 'auth/requires-recent-login'

function friendlyError(code) {
  switch (code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':     return 'That password isn’t right.'
    case 'auth/weak-password':          return 'Pick a longer password — at least 6 characters.'
    case 'auth/email-already-in-use':   return 'Another account already uses that email address.'
    case 'auth/invalid-email':          return 'That email address doesn’t look right.'
    case 'auth/too-many-requests':      return 'Too many attempts. Wait a minute, then try again.'
    case 'auth/network-request-failed': return 'Can’t reach the network. Check your connection and try again.'
    default:                            return 'That didn’t work. Please try again.'
  }
}

/** Panel wrapper so every section reads the same. */
function Panel({ title, description, children }) {
  return (
    <section className="acct-panel">
      <div className="acct-panel-head">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </section>
  )
}

export default function Account() {
  const { user, profile, plan, refresh, logout } = useAuth()
  const navigate = useNavigate()

  const [name,    setName]    = useState(profile?.displayName || user?.displayName || '')
  const [email,   setEmail]   = useState(user?.email || '')
  const [pw,      setPw]      = useState({ next: '', confirm: '' })
  const [current, setCurrent] = useState('')          // for re-auth
  const [msg,     setMsg]     = useState(null)        // { kind: 'ok'|'err', text }
  const [busy,    setBusy]    = useState('')          // which form is saving

  const isPasswordAccount = user?.providerData?.some(p => p.providerId === 'password')

  const say = (kind, text) => setMsg({ kind, text })

  // Run an operation, transparently re-authenticating if Firebase demands it.
  async function withReauth(fn) {
    try {
      await fn()
    } catch (err) {
      if (err?.code !== NEEDS_REAUTH) throw err
      if (!current) {
        throw Object.assign(new Error('reauth'), {
          friendly: 'For security, enter your current password below and try again.',
        })
      }
      const cred = EmailAuthProvider.credential(user.email, current)
      await reauthenticateWithCredential(auth.currentUser, cred)
      await fn()
    }
  }

  async function saveName(e) {
    e.preventDefault()
    setBusy('name'); setMsg(null)
    try {
      await updateProfile(auth.currentUser, { displayName: name.trim() })
      await setDoc(doc(identityDb, 'users', user.uid), {
        displayName: name.trim(), updatedAt: serverTimestamp(),
      }, { merge: true })
      await setDoc(doc(identityDb, 'userProfiles', user.uid), {
        displayName: name.trim(),
      }, { merge: true }).catch(() => {})
      await refresh()
      say('ok', 'Name updated.')
    } catch (err) {
      say('err', err?.friendly || friendlyError(err?.code))
    } finally { setBusy('') }
  }

  async function saveEmail(e) {
    e.preventDefault()
    const next = email.trim().toLowerCase()
    if (next === (user.email || '').toLowerCase()) { say('ok', 'That’s already your email address.'); return }
    setBusy('email'); setMsg(null)
    try {
      // Sends a confirmation link to the NEW address; the change lands only once
      // they click it, so a typo can't lock anyone out of their account.
      await withReauth(() => verifyBeforeUpdateEmail(auth.currentUser, next))
      say('ok', `Confirm the change from the link we sent to ${next}. Your current address stays active until then.`)
    } catch (err) {
      say('err', err?.friendly || friendlyError(err?.code))
    } finally { setBusy('') }
  }

  async function savePassword(e) {
    e.preventDefault()
    if (pw.next !== pw.confirm) { say('err', 'Those two passwords don’t match.'); return }
    if (pw.next.length < 6)     { say('err', 'Pick a longer password — at least 6 characters.'); return }
    setBusy('password'); setMsg(null)
    try {
      await withReauth(() => updatePassword(auth.currentUser, pw.next))
      setPw({ next: '', confirm: '' }); setCurrent('')
      say('ok', 'Password changed.')
    } catch (err) {
      say('err', err?.friendly || friendlyError(err?.code))
    } finally { setBusy('') }
  }

  async function signOut() {
    await logout()
    navigate('/', { replace: true })
  }

  return (
    <main className="acct">
      <div className="wrap">
        <header className="acct-head">
          <p className="label">Account</p>
          <h1>{profile?.displayName || user?.displayName || 'Your account'}</h1>
          <p className="acct-email">{user?.email}</p>
        </header>

        {msg && (
          <p className={`notice ${msg.kind === 'ok' ? 'notice-ok' : 'notice-err'}`} role="status">
            {msg.text}
          </p>
        )}

        {/* ── Plan ──────────────────────────────────────────────────────── */}
        <Panel title="Your plan" description="Billing is handled here, once for every sport.">
          <div className="plan-row">
            <div>
              <span className={`plan-badge plan-${plan.key}`}>{plan.label}</span>
              {plan.key === 'plus'    && <p className="plan-meta">{plan.credits} event credit{plan.credits === 1 ? '' : 's'} remaining.</p>}
              {plan.key === 'pro'     && <p className="plan-meta">Renews {plan.expiresAt?.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>}
              {plan.key === 'expired' && <p className="plan-meta">Your Pro subscription has lapsed. Renew to unlock unlimited competitions again.</p>}
              {plan.key === 'free'    && <p className="plan-meta">Unlimited teams and fixtures. Upgrade to run a competition.</p>}
            </div>
            <a className="btn btn-primary" href="/#plans">
              {plan.key === 'free' ? 'See plans' : 'Change plan'}
            </a>
          </div>
          <p className="acct-fine">
            Purchases are coming to this page shortly. In the meantime, contact{' '}
            <strong>billing@matchpulse.co.za</strong> and we’ll get you set up.
          </p>
        </Panel>

        {/* ── Sports ────────────────────────────────────────────────────── */}
        <Panel
          title="Your sports"
          description="Open a sport to sign in there and manage your teams."
        >
          <div className="acct-sports">
            {SPORTS.map(s => (
              <a
                key={s.key}
                className="acct-sport"
                style={{ '--hue': s.hue }}
                href={s.host}
              >
                <span className="acct-sport-dot" />
                {s.name}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </a>
            ))}
          </div>
          <p className="acct-fine">
            You sign in on each sport’s own site. Your playing details — position, club and
            squad — live there too, because every sport records them differently.
          </p>
        </Panel>

        {/* ── Name ──────────────────────────────────────────────────────── */}
        <Panel title="Your details">
          <form className="acct-form" onSubmit={saveName}>
            <div className="field">
              <label htmlFor="acct-name">Name</label>
              <input id="acct-name" type="text" value={name} autoComplete="name"
                onChange={e => setName(e.target.value)} />
            </div>
            <button className="btn btn-dark" disabled={busy === 'name' || !name.trim()}>
              {busy === 'name' ? 'Saving…' : 'Save name'}
            </button>
          </form>
        </Panel>

        {/* ── Email ─────────────────────────────────────────────────────── */}
        <Panel
          title="Email address"
          description="We’ll email the new address to confirm the change before it takes effect."
        >
          <form className="acct-form" onSubmit={saveEmail}>
            <div className="field">
              <label htmlFor="acct-email">Email</label>
              <input id="acct-email" type="email" value={email} autoComplete="email"
                onChange={e => setEmail(e.target.value)} />
            </div>
            <button className="btn btn-dark" disabled={busy === 'email' || !email.trim()}>
              {busy === 'email' ? 'Sending…' : 'Change email'}
            </button>
          </form>
        </Panel>

        {/* ── Password ──────────────────────────────────────────────────── */}
        {isPasswordAccount && (
          <Panel title="Password">
            <form className="acct-form" onSubmit={savePassword}>
              <div className="field">
                <label htmlFor="pw-next">New password</label>
                <input id="pw-next" type="password" autoComplete="new-password" minLength={6}
                  value={pw.next} onChange={e => setPw(p => ({ ...p, next: e.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="pw-confirm">Confirm new password</label>
                <input id="pw-confirm" type="password" autoComplete="new-password"
                  value={pw.confirm} onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="pw-current">Current password <span className="opt">only if we ask</span></label>
                <input id="pw-current" type="password" autoComplete="current-password"
                  value={current} onChange={e => setCurrent(e.target.value)} />
              </div>
              <button className="btn btn-dark" disabled={busy === 'password' || !pw.next}>
                {busy === 'password' ? 'Saving…' : 'Change password'}
              </button>
            </form>
          </Panel>
        )}

        <div className="acct-signout">
          <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
        </div>
      </div>
    </main>
  )
}
