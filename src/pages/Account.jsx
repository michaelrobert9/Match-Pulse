import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  updateProfile,
  updatePassword,
  verifyBeforeUpdateEmail,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth'
import { collection, doc, getDocs, query, setDoc, serverTimestamp, where } from 'firebase/firestore'
import { statusOf } from '../lib/billing'
import { formatRand } from '../lib/payfast'
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { useAuth } from '../contexts/AuthContext'
import { auth, identityDb, storage } from '../firebase'
import { SPORTS } from '../lib/sports'
import { listGuardianshipsForParent, SPORT_LABEL } from '../lib/guardianships'

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

/** The signed-in user's invoices, newest first. Sorted client-side so the
    where-clause needs no composite index. */
function InvoicesPanel({ uid }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    if (!uid) return
    let cancel = false
    ;(async () => {
      try {
        const q = query(collection(identityDb, 'invoices'), where('uid', '==', uid))
        const snap = await getDocs(q)
        if (cancel) return
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
        setRows(list)
      } catch {
        if (!cancel) setRows([])
      }
    })()
    return () => { cancel = true }
  }, [uid])

  if (!rows || rows.length === 0) return null   // nothing to show, no empty panel

  return (
    <Panel
      title="Your invoices"
      description="Pay any outstanding invoice by EFT using its number as the reference."
    >
      <ul className="inv-list">
        {rows.map(v => {
          const st = statusOf(v.status)
          return (
            <li key={v.id}>
              <Link to={`/invoices/${v.id}`} className="inv-list-row">
                <span className="inv-list-no tnum">{v.number}</span>
                <span className="inv-list-plan">{v.planLabel}</span>
                <span className="inv-list-amt tnum">{formatRand(v.amount)}</span>
                <span className={`pill pill-${st.pill}`}>{st.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

// Players the signed-in parent has claimed in the sport apps (from the central
// guardianships bridge). Hidden when there are none.
function PlayersPanel({ uid }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    if (!uid) return
    let cancel = false
    listGuardianshipsForParent(uid).then(r => { if (!cancel) setRows(r) }).catch(() => { if (!cancel) setRows([]) })
    return () => { cancel = true }
  }, [uid])
  if (!rows || rows.length === 0) return null
  return (
    <Panel title="Players you manage" description="Player profiles you've claimed as a parent or guardian in the MatchPulse sport apps.">
      <ul className="acct-players">
        {rows.map(g => (
          <li key={g.id}>
            <span className="acct-player-name">{g.personName || 'Player'}</span>
            <span className="acct-player-sport">{SPORT_LABEL[g.sport] || g.sport}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
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
  const { user, profile, plan, refresh, logout, resendVerification } = useAuth()
  const [verifyBusy, setVerifyBusy] = useState(false)

  async function resendVerify() {
    setVerifyBusy(true)
    try {
      await resendVerification()
      setMsg({ kind: 'ok', text: `Verification email sent to ${user?.email}. Check your inbox (and spam).` })
    } catch {
      setMsg({ kind: 'err', text: 'Could not send the verification email just now. Please try again shortly.' })
    } finally {
      setVerifyBusy(false)
    }
  }
  const navigate = useNavigate()

  const [name,    setName]    = useState(profile?.displayName || user?.displayName || '')
  const [phone,   setPhone]   = useState(profile?.phone || '')
  const [email,   setEmail]   = useState(user?.email || '')

  // profile loads asynchronously — pull the stored phone in once it arrives.
  useEffect(() => { if (profile?.phone != null) setPhone(profile.phone) }, [profile?.phone])
  const [pw,      setPw]      = useState({ next: '', confirm: '' })
  const [current, setCurrent] = useState('')          // for re-auth
  const [msg,     setMsg]     = useState(null)        // { kind: 'ok'|'err', text }
  const [busy,    setBusy]    = useState('')          // which form is saving
  const [photoURL, setPhotoURL] = useState(profile?.photoURL || user?.photoURL || '')
  const fileInput = useRef(null)

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
        displayName: name.trim(), phone: phone.trim(), updatedAt: serverTimestamp(),
      }, { merge: true })
      await setDoc(doc(identityDb, 'userProfiles', user.uid), {
        displayName: name.trim(),
      }, { merge: true }).catch(() => {})
      await refresh()
      say('ok', 'Details updated.')
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

  async function uploadPicture(file) {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { say('err', 'Pick an image under 5 MB.'); return }
    if (!file.type.startsWith('image/')) { say('err', 'Pick an image file (JPEG, PNG, WebP).'); return }
    setBusy('picture'); setMsg(null)
    try {
      // Use a fixed filename per user so a re-upload overwrites the old one,
      // rather than orphaning it in the bucket.
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
      const ref = storageRef(storage, `profilePictures/${user.uid}.${ext}`)
      await uploadBytes(ref, file, { contentType: file.type })
      const url = await getDownloadURL(ref)
      await Promise.all([
        updateProfile(auth.currentUser, { photoURL: url }),
        setDoc(doc(identityDb, 'userProfiles', user.uid), { photoURL: url }, { merge: true }),
      ])
      setPhotoURL(url)
      say('ok', 'Profile picture updated.')
    } catch (err) {
      say('err', err?.message || 'Upload failed.')
    } finally {
      setBusy('')
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function removePicture() {
    setBusy('picture'); setMsg(null)
    try {
      // Try both common extensions — the rule allows only one per user, but we
      // don't know which they last used without reading the storage listing.
      await Promise.all(['jpg','jpeg','png','webp','gif'].map(ext =>
        deleteObject(storageRef(storage, `profilePictures/${user.uid}.${ext}`)).catch(() => {})
      ))
      await Promise.all([
        updateProfile(auth.currentUser, { photoURL: null }),
        setDoc(doc(identityDb, 'userProfiles', user.uid), { photoURL: null }, { merge: true }),
      ])
      setPhotoURL('')
      say('ok', 'Profile picture removed.')
    } catch (err) {
      say('err', err?.message || 'Could not remove picture.')
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

        {user && !user.emailVerified && (
          <div className="verify-banner" role="status">
            <div>
              <strong>Verify your email.</strong> We sent a confirmation link to {user.email}. Please
              click it to confirm your address — it keeps your account and any invoices reaching you.
            </div>
            <button type="button" className="btn btn-ghost btn-sm" disabled={verifyBusy} onClick={resendVerify}>
              {verifyBusy ? 'Sending…' : 'Resend email'}
            </button>
          </div>
        )}

        {msg && (
          <p className={`notice ${msg.kind === 'ok' ? 'notice-ok' : 'notice-err'}`} role="status">
            {msg.text}
          </p>
        )}

        {/* ── Profile picture ───────────────────────────────────────────── */}
        <Panel
          title="Profile picture"
          description="Shown next to your name on every MatchPulse sport."
        >
          <div className="pfp-row">
            <div className="pfp-preview" aria-hidden="true">
              {photoURL
                ? <img src={photoURL} alt="" />
                : <span className="pfp-initial">{(name || user?.email || '?').slice(0,1).toUpperCase()}</span>}
            </div>
            <div className="pfp-actions">
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="pfp-input"
                onChange={e => uploadPicture(e.target.files?.[0])}
              />
              <button
                type="button"
                className="btn btn-dark"
                disabled={busy === 'picture'}
                onClick={() => fileInput.current?.click()}
              >
                {busy === 'picture' ? 'Saving…' : (photoURL ? 'Replace picture' : 'Upload picture')}
              </button>
              {photoURL && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy === 'picture'}
                  onClick={removePicture}
                >
                  Remove
                </button>
              )}
              <p className="acct-fine">Under 5&nbsp;MB. JPEG, PNG or WebP.</p>
            </div>
          </div>
        </Panel>

        {/* ── Plan ──────────────────────────────────────────────────────── */}
        <Panel title="Your plan" description="Billing is handled here, once for every sport.">
          <div className="plan-row">
            <div>
              <span className={`plan-badge plan-${plan.key}`}>{plan.label}</span>
              {plan.key === 'plus'    && <p className="plan-meta">{plan.credits} event credit{plan.credits === 1 ? '' : 's'} remaining.</p>}
              {plan.key === 'pro'     && <p className="plan-meta">Renews {plan.expiresAt?.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>}
              {plan.key === 'expired' && <p className="plan-meta">Your All-In subscription has lapsed. Renew to unlock unlimited competitions again.</p>}
              {plan.key === 'free'    && <p className="plan-meta">Unlimited teams and matches. Upgrade to run a competition.</p>}
            </div>
            <Link className="btn btn-ghost" to="/products">
              Compare all plans
            </Link>
          </div>

          {plan.key !== 'pro' && (
            <div className="upgrade-grid">
              <p className="upgrade-lede">Upgrade to run competitions. Everyday MatchPulse covers unlimited teams and matches. A competition (league, tournament or festival) needs a plan:</p>
              <div className="upgrade-opts">
                <div className="upgrade-opt">
                  <p className="upgrade-name">Single Competition</p>
                  <p className="upgrade-price">{formatRand(2000)} <span>once-off</span></p>
                  <p className="upgrade-what">One competition, on any one MatchPulse sport. No subscription.</p>
                  <Link className="btn btn-dark btn-sm" to="/invoice/new?plan=event">Get a Single Competition invoice</Link>
                </div>
                <div className="upgrade-opt upgrade-opt-featured">
                  <p className="upgrade-name">All-In</p>
                  <p className="upgrade-price">{formatRand(15000)} <span>/ year</span></p>
                  <p className="upgrade-what">Unlimited competitions across every sport for a full year.</p>
                  <Link className="btn btn-primary btn-sm" to="/invoice/new?plan=pro">Get an All-In invoice</Link>
                </div>
              </div>
            </div>
          )}

          <p className="acct-fine">
            Plans are paid by EFT: choosing one generates an invoice with our bank
            details and a payment reference (emailed to you), and your plan activates once
            the payment reflects.
          </p>
        </Panel>

        {/* ── Invoices ──────────────────────────────────────────────────── */}
        <InvoicesPanel uid={user?.uid} />

        {/* ── Players you manage (claimed in the sport apps) ────────────── */}
        <PlayersPanel uid={user?.uid} />

        {/* ── Management ────────────────────────────────────────────────── */}
        <Panel
          title="Manage your schools & clubs"
          description="Author a school, club, association or league once — its identity, venues and people carry to every sport."
        >
          <Link className="btn btn-dark" to="/admin">Open management</Link>
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
            <div className="field">
              <label htmlFor="acct-phone">Cellphone number</label>
              <input id="acct-phone" type="tel" value={phone} autoComplete="tel"
                onChange={e => setPhone(e.target.value)} placeholder="0821234567" />
            </div>
            <button className="btn btn-dark" disabled={busy === 'name' || !name.trim()}>
              {busy === 'name' ? 'Saving…' : 'Save details'}
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
