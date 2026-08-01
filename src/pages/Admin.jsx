import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, orderBy, query, setDoc, serverTimestamp } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { identityDb, functions } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { SPORTS } from '../lib/sports'
import { planStatus } from '../contexts/AuthContext'

// The admin panel is a single page with tab-switched sections rather than
// nested routes — every section fetches its own data on demand, and users
// hit F5 rarely enough that URL-persisted tabs aren't worth the wiring.
const TABS = [
  { key: 'users',    label: 'Users' },
  { key: 'payments', label: 'Payments' },
  { key: 'activity', label: 'Sport activity' },
  { key: 'access',   label: 'Access' },
  { key: 'seo',      label: 'SEO' },
]

function Notice({ kind = 'ok', children }) {
  if (!children) return null
  return <p className={`notice notice-${kind === 'ok' ? 'ok' : 'err'}`}>{children}</p>
}

function fmtDate(v) {
  if (!v) return '—'
  const d = v?.toDate?.() ?? (v instanceof Date ? v : new Date(v))
  if (isNaN(d?.getTime?.())) return '—'
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtMoney(cents) {
  const n = Number(cents)
  if (!Number.isFinite(n)) return '—'
  return `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ── Users ────────────────────────────────────────────────────────────────────
function UsersTab() {
  const [rows, setRows] = useState(null)
  const [err,  setErr]  = useState('')
  const [q,    setQ]    = useState('')

  useEffect(() => {
    let cancel = false
    ;(async () => {
      try {
        const snap = await getDocs(collection(identityDb, 'users'))
        if (cancel) return
        const list = snap.docs.map(d => {
          const data = d.data()
          return {
            uid:            d.id,
            email:          data.email ?? '',
            displayName:    data.displayName ?? '',
            plan:           planStatus(data),
            createdAt:      data.createdAt ?? null,
            platformAdmin:  data.platformAdmin === true,
          }
        })
        list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
        setRows(list)
      } catch (e) {
        if (!cancel) setErr(e.message || 'Could not load users.')
      }
    })()
    return () => { cancel = true }
  }, [])

  const filtered = useMemo(() => {
    if (!rows) return null
    if (!q.trim()) return rows
    const needle = q.trim().toLowerCase()
    return rows.filter(r =>
      r.email.toLowerCase().includes(needle)
      || r.displayName.toLowerCase().includes(needle)
      || r.uid.toLowerCase().includes(needle)
    )
  }, [rows, q])

  return (
    <div className="adm-section">
      <div className="adm-toolbar">
        <input
          type="search"
          value={q}
          placeholder="Search by name, email or UID"
          onChange={e => setQ(e.target.value)}
        />
        <span className="adm-count">{filtered ? `${filtered.length} of ${rows.length}` : ''}</span>
      </div>
      <Notice kind="err">{err}</Notice>
      {!filtered ? <p className="adm-loading">Loading…</p> : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Name</th><th>Email</th><th>Plan</th><th>Created</th><th>Admin</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.uid}>
                  <td>
                    <div className="adm-name">{u.displayName || <span className="muted">(no name)</span>}</div>
                    <div className="adm-uid">{u.uid}</div>
                  </td>
                  <td>{u.email || <span className="muted">—</span>}</td>
                  <td><span className={`plan-badge plan-${u.plan.key}`}>{u.plan.label}</span></td>
                  <td>{fmtDate(u.createdAt)}</td>
                  <td>{u.platformAdmin ? <span className="pill pill-admin">Admin</span> : ''}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="muted">No users match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Payments ─────────────────────────────────────────────────────────────────
function PaymentsTab() {
  const [rows, setRows] = useState(null)
  const [err,  setErr]  = useState('')

  useEffect(() => {
    let cancel = false
    ;(async () => {
      try {
        const q = query(collection(identityDb, 'payments'), orderBy('receivedAt', 'desc'))
        const snap = await getDocs(q)
        if (cancel) return
        setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      } catch (e) {
        if (!cancel) setErr(e.message || 'Could not load payments.')
      }
    })()
    return () => { cancel = true }
  }, [])

  return (
    <div className="adm-section">
      <p className="adm-hint">
        Automated PayFast payments write here directly from the webhook. Once we
        wire manual/EFT activation, allocations will appear here too.
      </p>
      <Notice kind="err">{err}</Notice>
      {!rows ? <p className="adm-loading">Loading…</p> : rows.length === 0 ? (
        <p className="muted">No payments yet.</p>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Date</th><th>Buyer</th><th>Plan</th><th>Amount</th><th>Status</th><th>Ref</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.id}>
                  <td>{fmtDate(p.receivedAt)}</td>
                  <td>
                    <div>{p.email || <span className="muted">—</span>}</div>
                    <div className="adm-uid">{p.uid || ''}</div>
                  </td>
                  <td>{p.plan || <span className="muted">—</span>}</td>
                  <td>{fmtMoney(p.amountGross)}</td>
                  <td>
                    <span className={`pill pill-${p.paymentStatus === 'COMPLETE' ? 'ok' : 'warn'}`}>
                      {p.paymentStatus || 'PENDING'}
                    </span>
                  </td>
                  <td className="adm-uid">{p.pfPaymentId || p.mPaymentId || p.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Sport activity ───────────────────────────────────────────────────────────
function ActivityTab() {
  const [uid,     setUid]     = useState('')
  const [busy,    setBusy]    = useState(false)
  const [result,  setResult]  = useState(null)
  const [err,     setErr]     = useState('')

  async function lookup(e) {
    e?.preventDefault?.()
    setErr(''); setResult(null); setBusy(true)
    try {
      const call = httpsCallable(functions, 'getUserSportActivity')
      const { data } = await call({ uid: uid.trim() })
      setResult(data)
    } catch (e) {
      setErr(e.message || 'Lookup failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="adm-section">
      <p className="adm-hint">
        Enter a user's UID (copy it from the Users tab) to see which sports they
        have signed in on. Reads each sport's own database, so this is the ground
        truth — not something the main site could infer on its own.
      </p>
      <form className="adm-inline-form" onSubmit={lookup}>
        <input
          type="text"
          value={uid}
          placeholder="User UID"
          onChange={e => setUid(e.target.value)}
        />
        <button className="btn btn-dark" disabled={busy || !uid.trim()}>
          {busy ? 'Looking up…' : 'Look up'}
        </button>
      </form>
      <Notice kind="err">{err}</Notice>
      {result && (
        <ul className="adm-activity">
          {SPORTS.map(s => {
            const r = result[s.key] || { active: false }
            return (
              <li key={s.key} className={r.active ? 'active' : ''}>
                <span className="dot" style={{ background: s.hue }} />
                <span className="name">{s.name}</span>
                <span className="status">
                  {r.error ? 'unreadable' : r.active ? 'Active' : 'Not active'}
                </span>
                {r.lastActive && <span className="when">Last: {fmtDate(r.lastActive)}</span>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ── Access management (deferred) ─────────────────────────────────────────────
function AccessTab() {
  return (
    <div className="adm-section">
      <div className="adm-callout">
        <h3>Access management is on hold.</h3>
        <p>
          Granting a plan to a specific sport (or across all sports) needs the
          entitlement model to be settled first — the two options on the table
          are <em>Plus = one sport</em> and <em>Plus = one competition
          anywhere</em>, and each shapes the schema differently.
        </p>
        <p>
          The plumbing this tab needs — the users list, the payments list, the
          sport-activity lookup — is already live in the other tabs. Once the
          model is chosen, this becomes a Grant/Revoke button per user, per
          sport.
        </p>
      </div>
    </div>
  )
}

// ── SEO ──────────────────────────────────────────────────────────────────────
const SEO_DEFAULTS = {
  siteTitle:       'MatchPulse — One home for every sport you love',
  siteDescription: 'MatchPulse runs your competitions, teams and matches across hockey, netball, rugby and water polo, on one account.',
  ogTitle:         'MatchPulse',
  ogDescription:   'One account. Every sport. Real-time results.',
  ogImage:         '',
  themeColor:      '#059669',
}

function SeoTab() {
  const [form, setForm] = useState(SEO_DEFAULTS)
  const [busy, setBusy] = useState(false)
  const [msg,  setMsg]  = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancel = false
    ;(async () => {
      try {
        const snap = await getDoc(doc(identityDb, '_meta', 'seoSettings'))
        if (cancel) return
        if (snap.exists()) setForm(f => ({ ...f, ...snap.data() }))
        setLoaded(true)
      } catch {
        if (!cancel) { setLoaded(true) }
      }
    })()
    return () => { cancel = true }
  }, [])

  async function save(e) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      await setDoc(doc(identityDb, '_meta', 'seoSettings'), {
        ...form,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setMsg({ kind: 'ok', text: 'Saved. Reload any page to see it applied.' })
    } catch (e) {
      setMsg({ kind: 'err', text: e.message || 'Save failed.' })
    } finally {
      setBusy(false)
    }
  }

  const bind = (key) => ({
    id:       `seo-${key}`,
    value:    form[key] ?? '',
    onChange: (e) => setForm(f => ({ ...f, [key]: e.target.value })),
  })

  return (
    <div className="adm-section">
      <p className="adm-hint">
        Live SEO defaults for every page on the main site. Each page can still
        override these; anything blank falls back to the built-in default.
      </p>
      {!loaded ? <p className="adm-loading">Loading…</p> : (
        <form className="acct-form" onSubmit={save}>
          <div className="field">
            <label htmlFor="seo-siteTitle">Browser tab title</label>
            <input type="text" {...bind('siteTitle')} />
          </div>
          <div className="field">
            <label htmlFor="seo-siteDescription">Meta description</label>
            <textarea rows={2} {...bind('siteDescription')} />
          </div>
          <div className="field">
            <label htmlFor="seo-ogTitle">Social share title (og:title)</label>
            <input type="text" {...bind('ogTitle')} />
          </div>
          <div className="field">
            <label htmlFor="seo-ogDescription">Social share description (og:description)</label>
            <textarea rows={2} {...bind('ogDescription')} />
          </div>
          <div className="field">
            <label htmlFor="seo-ogImage">Social share image URL (og:image, 1200×630)</label>
            <input type="url" placeholder="https://…" {...bind('ogImage')} />
          </div>
          <div className="field">
            <label htmlFor="seo-themeColor">Browser theme color</label>
            <input type="text" placeholder="#059669" {...bind('themeColor')} />
          </div>
          <button className="btn btn-dark" disabled={busy}>{busy ? 'Saving…' : 'Save SEO'}</button>
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        </form>
      )}
    </div>
  )
}

// ── Shell ────────────────────────────────────────────────────────────────────
export default function Admin() {
  const [tab, setTab] = useState('users')
  const { profile } = useAuth()

  return (
    <main className="adm">
      <div className="wrap">
        <header className="acct-head">
          <p className="label">Admin</p>
          <h1>Master admin</h1>
          <p className="acct-email">Signed in as {profile?.email}</p>
        </header>

        <nav className="adm-tabs" role="tablist">
          {TABS.map(t => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              className={tab === t.key ? 'active' : ''}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {tab === 'users'    && <UsersTab />}
        {tab === 'payments' && <PaymentsTab />}
        {tab === 'activity' && <ActivityTab />}
        {tab === 'access'   && <AccessTab />}
        {tab === 'seo'      && <SeoTab />}
      </div>
    </main>
  )
}
