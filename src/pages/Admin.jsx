import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, orderBy, query, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { statusOf } from '../lib/billing'
import { listAllOrgs, listOrgsOwnedBy, ORG_TYPES } from '../lib/orgs'
import { TYPE_PREFIX } from '../lib/orgProfile'
import { identityDb, functions } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { SPORTS } from '../lib/sports'
import { planStatus } from '../contexts/AuthContext'
import OrgForm from './OrgForm'
import VenueManager from '../components/VenueManager'
import { listAllVenues, mergeVenues } from '../lib/venues'

// The admin panel is a single page with tab-switched sections rather than
// nested routes — every section fetches its own data on demand, and users
// hit F5 rarely enough that URL-persisted tabs aren't worth the wiring.
// Sidebar icons — inline single-path SVGs (20×20, stroke = currentColor), so the
// admin shell matches the sport sites' AppShell rail without a new dependency.
const I = (d) => (props) => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={d} /></svg>
)
const ICONS = {
  users:    I('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75'),
  orgs:     I('M3 21h18 M5 21V7l7-4 7 4v14 M9 9h.01 M15 9h.01 M9 13h.01 M15 13h.01 M9 17h.01 M15 17h.01'),
  invoices: I('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 13h6 M9 17h6'),
  messages: I('M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'),
  payments: I('M1 4h22v16H1z M1 10h22'),
  activity: I('M22 12h-4l-3 9L9 3l-3 9H2'),
  venues:   I('M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'),
  seo:      I('M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35'),
}

const TABS = [
  { key: 'users',    label: 'Users' },
  { key: 'orgs',     label: 'Organisations' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'messages', label: 'Messages' },
  { key: 'payments', label: 'Payments' },
  { key: 'activity', label: 'Sport activity' },
  { key: 'venues',   label: 'Venues' },
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
function roleLabel(v) {
  const r = typeof v === 'string' ? v : (v?.role ?? '')
  return r ? r.charAt(0).toUpperCase() + r.slice(1) : 'Member'
}

// Full per-user view: identity + name edit, plan change, org access,
// cross-sport competitions, and delete. Folds in the old Access tab.
function UserDetail({ user, orgsById, onBack, onChanged, onEditOrg }) {
  const [name,  setName]  = useState(user.displayName || '')
  const [email, setEmail] = useState(user.email || '')
  const [phone, setPhone] = useState(user.raw.phone || '')
  const [form, setForm] = useState(() => ({
    plan:    user.raw.entitlement ?? 'none',
    credits: Math.max(1, user.raw.eventCredits ?? 1),
    years:   1, method: 'eft', note: '',
  }))
  const [busy, setBusy] = useState('')
  const [msg,  setMsg]  = useState(null)
  const [comps, setComps] = useState(null)
  const [armDel,  setArmDel]  = useState(false)  // delete fail-safe: reveal + type to confirm
  const [delText, setDelText] = useState('')

  useEffect(() => {
    let cancel = false
    ;(async () => {
      try {
        const { data } = await httpsCallable(functions, 'getUserCompetitions')({ uid: user.uid })
        if (!cancel) setComps(data.competitions || [])
      } catch { if (!cancel) setComps([]) }
    })()
    return () => { cancel = true }
  }, [user.uid])

  // Orgs this user relates to: owner (from org doc) + any orgRoles grant.
  const orgRel = {}
  for (const o of Object.values(orgsById)) if (o.ownerUserId === user.uid) orgRel[o.id] = 'Owner'
  for (const [oid, grant] of Object.entries(user.raw.orgRoles || {})) if (!orgRel[oid]) orgRel[oid] = roleLabel(grant)
  const orgList = Object.entries(orgRel)

  const bind = (k) => ({ value: form[k], onChange: e => setForm(f => ({ ...f, [k]: e.target.value })) })

  const detailsChanged =
    name.trim() !== (user.displayName || '') ||
    email.trim().toLowerCase() !== (user.email || '').toLowerCase() ||
    phone.trim() !== (user.raw.phone || '')

  async function saveDetails() {
    setBusy('name'); setMsg(null)
    const payload = { uid: user.uid }
    if (name.trim() !== (user.displayName || '')) payload.displayName = name.trim()
    if (email.trim().toLowerCase() !== (user.email || '').toLowerCase()) payload.email = email.trim()
    if (phone.trim() !== (user.raw.phone || '')) payload.phone = phone.trim()
    try {
      await httpsCallable(functions, 'adminSetUserName')(payload)
      setMsg({ kind: 'ok', text: 'Details updated.' }); onChanged?.()
    } catch (e) { setMsg({ kind: 'err', text: e.message || 'Could not update details.' }) }
    finally { setBusy('') }
  }

  async function applyPlan(e) {
    e.preventDefault()
    setBusy('plan'); setMsg(null)
    try {
      await httpsCallable(functions, 'adminSetEntitlement')({
        uid: user.uid, plan: form.plan, credits: Number(form.credits), years: Number(form.years), method: form.method, note: form.note,
      })
      setMsg({ kind: 'ok', text: `Plan set to ${form.plan === 'none' ? 'Free' : form.plan === 'event' ? 'Plus' : 'Pro'}. Reaches the sport sites on their next token refresh.` })
      setForm(f => ({ ...f, note: '' })); onChanged?.()
    } catch (e) { setMsg({ kind: 'err', text: e.message || 'Could not set plan.' }) }
    finally { setBusy('') }
  }

  // Fail-safe: the admin must type the user's exact email (or UID if no email)
  // before the delete is allowed — no accidental one-click deletions.
  const delTarget = (user.email || user.uid || '').trim()
  const delReady = delText.trim().toLowerCase() === delTarget.toLowerCase()

  async function removeUser() {
    if (!delReady) return
    setBusy('del'); setMsg(null)
    try {
      await httpsCallable(functions, 'adminDeleteUser')({ uid: user.uid })
      onChanged?.(true)
    } catch (e) { setMsg({ kind: 'err', text: e.message || 'Could not delete user.' }); setBusy('') }
  }

  return (
    <div className="adm-section adm-userdetail">
      <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>← All users</button>

      <div className="adm-ud-head">
        <div>
          <h3>{user.displayName || <span className="muted">(no name)</span>}</h3>
          <p className="adm-uid">{user.email || '—'} · {user.uid}</p>
        </div>
        <div className="adm-ud-badges">
          <span className={`plan-badge plan-${user.plan.key}`}>{user.plan.label}</span>
          {user.platformAdmin && <span className="pill pill-admin">Admin</span>}
        </div>
      </div>

      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      <div className="adm-ud-grid">
        {/* Identity — name, sign-in email, cellphone */}
        <section className="adm-ud-card">
          <h4>Details</h4>
          <div className="field"><label>Name</label><input type="text" value={name} placeholder="Full name" onChange={e => setName(e.target.value)} /></div>
          <div className="field"><label>Email <span className="opt">sign-in address</span></label><input type="email" value={email} placeholder="you@example.com" onChange={e => setEmail(e.target.value)} /></div>
          <div className="field"><label>Cellphone</label><input type="tel" value={phone} placeholder="0821234567" onChange={e => setPhone(e.target.value)} /></div>
          <button type="button" className="btn btn-dark btn-sm" disabled={busy === 'name' || !detailsChanged} onClick={saveDetails}>
            {busy === 'name' ? 'Saving…' : 'Save details'}
          </button>
        </section>

        {/* Plan */}
        <section className="adm-ud-card">
          <h4>Plan</h4>
          <form className="acct-form" onSubmit={applyPlan}>
            <div className="field">
              <label>Plan to set</label>
              <select {...bind('plan')}>
                <option value="none">Free — no paid access</option>
                <option value="event">Plus — competition credits (once-off)</option>
                <option value="pro">Pro — unlimited competitions (annual)</option>
              </select>
            </div>
            {form.plan === 'event' && (
              <div className="field"><label>Competition credits</label><input type="number" min="0" max="100" {...bind('credits')} /></div>
            )}
            {form.plan === 'pro' && (
              <div className="field"><label>Years to add</label><input type="number" min="1" max="5" {...bind('years')} /></div>
            )}
            <div className="field">
              <label>Reason</label>
              <select {...bind('method')}>
                <option value="eft">EFT payment received</option>
                <option value="comp">Free of charge</option>
                <option value="correction">Correction</option>
                <option value="manual">Other</option>
              </select>
            </div>
            <div className="field"><label>Note <span className="opt">optional</span></label><input type="text" placeholder="e.g. FNB ref 4471" {...bind('note')} /></div>
            <button className="btn btn-primary btn-sm" disabled={busy === 'plan'}>{busy === 'plan' ? 'Applying…' : 'Apply plan change'}</button>
          </form>
        </section>

        {/* Org access */}
        <section className="adm-ud-card">
          <h4>Organisation access</h4>
          {orgList.length === 0 ? <p className="muted">No organisations.</p> : (
            <ul className="adm-ud-list">
              {orgList.map(([oid, rel]) => (
                <li key={oid}>
                  <button type="button" className="linklike" onClick={() => onEditOrg?.(oid)}>{orgsById[oid]?.name || oid}</button>
                  <span className="adm-ud-role">{rel}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Competitions */}
        <section className="adm-ud-card">
          <h4>Competitions</h4>
          {comps === null ? <p className="adm-loading">Loading…</p>
            : comps.length === 0 ? <p className="muted">None connected.</p>
            : (
              <ul className="adm-ud-list">
                {comps.map(c => (
                  <li key={`${c.sport}:${c.id}`}>
                    <a href={c.url} target="_blank" rel="noreferrer">{c.name}{c.season ? ` · ${c.season}` : ''}</a>
                    <span className="adm-ud-role">{c.sport}{c.via === 'org' ? ' · via org' : ''}</span>
                  </li>
                ))}
              </ul>
            )}
        </section>
      </div>

      {/* Danger — two-step, type-to-confirm fail-safe */}
      <section className="org-danger">
        <h4 className="inv-edit-h">Delete user</h4>
        <p className="adm-field-hint">Removes their sign-in and profile. Organisations they own stay but become ownerless (reassign later). Matches are never deleted. This cannot be undone.</p>
        {!armDel ? (
          <button type="button" className="btn btn-danger btn-sm" onClick={() => { setArmDel(true); setDelText('') }}>
            Delete user…
          </button>
        ) : (
          <div className="adm-del-confirm">
            <p className="adm-field-hint">To confirm, type <strong>{delTarget}</strong> below.</p>
            <div className="adm-inline-form">
              <input type="text" value={delText} placeholder={delTarget} autoComplete="off"
                onChange={e => setDelText(e.target.value)} />
              <button type="button" className="btn btn-danger btn-sm" disabled={!delReady || busy === 'del'} onClick={removeUser}>
                {busy === 'del' ? 'Deleting…' : 'Permanently delete'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setArmDel(false); setDelText('') }}>Cancel</button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function UsersTab({ onEditOrg }) {
  const [rows, setRows] = useState(null)
  const [orgsById, setOrgsById] = useState({})
  const [err,  setErr]  = useState('')
  const [q,    setQ]    = useState('')
  const [sel,  setSel]  = useState(null)

  async function load() {
    try {
      const [snap, orgs] = await Promise.all([
        getDocs(collection(identityDb, 'users')),
        listAllOrgs().catch(() => []),
      ])
      const list = snap.docs.map(d => {
        const data = d.data()
        return {
          uid: d.id, email: data.email ?? '', displayName: data.displayName ?? '',
          plan: planStatus(data), createdAt: data.createdAt ?? null,
          platformAdmin: data.platformAdmin === true, raw: data,
        }
      })
      list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      setRows(list)
      const map = {}; for (const o of orgs) map[o.id] = o; setOrgsById(map)
      return list
    } catch (e) { setErr(e.message || 'Could not load users.'); return [] }
  }
  useEffect(() => { load() }, [])

  async function refresh(deleted) {
    const list = await load()
    if (deleted) { setSel(null); return }
    if (sel) setSel(list.find(r => r.uid === sel.uid) || null)
  }

  const filtered = useMemo(() => {
    if (!rows) return null
    if (!q.trim()) return rows
    const needle = q.trim().toLowerCase()
    return rows.filter(r =>
      r.email.toLowerCase().includes(needle) || r.displayName.toLowerCase().includes(needle) || r.uid.toLowerCase().includes(needle)
    )
  }, [rows, q])

  if (sel) return <UserDetail key={sel.uid} user={sel} orgsById={orgsById} onBack={() => setSel(null)} onChanged={refresh} onEditOrg={onEditOrg} />

  return (
    <div className="adm-section">
      <div className="adm-toolbar">
        <input type="search" value={q} placeholder="Search by name, email or UID" onChange={e => setQ(e.target.value)} />
        <span className="adm-count">{filtered ? `${filtered.length} of ${rows.length}` : ''}</span>
      </div>
      <Notice kind="err">{err}</Notice>
      {!filtered ? <p className="adm-loading">Loading…</p> : (
        <div className="adm-table-wrap">
          <table className="adm-table adm-table-click">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Plan</th><th>Created</th><th>Admin</th></tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.uid} onClick={() => setSel(u)} className="adm-row-click">
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
              {filtered.length === 0 && <tr><td colSpan={5} className="muted">No users match.</td></tr>}
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
        // Only real payments against an invoice belong in this ledger. Manual
        // entitlement grants and complimentary access are audited elsewhere and
        // carry no invoiceId, so they're excluded here.
        setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.invoiceId))
      } catch (e) {
        if (!cancel) setErr(e.message || 'Could not load payments.')
      }
    })()
    return () => { cancel = true }
  }, [])

  return (
    <div className="adm-section">
      <p className="adm-hint">
        Payments recorded against an invoice. A payment appears only after an
        invoice has been created and marked paid — complimentary access and
        manual grants are not payments and don’t show here.
      </p>
      <Notice kind="err">{err}</Notice>
      {!rows ? <p className="adm-loading">Loading…</p> : rows.length === 0 ? (
        <p className="muted">No payments yet.</p>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Date</th><th>Buyer</th><th>Plan</th><th>Amount</th><th>Method</th><th>Invoice</th>
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
                    <span className="pill pill-ok">{(p.method || 'eft').toUpperCase()}</span>
                  </td>
                  <td>
                    <Link className="adm-uid" to={`/invoices/${p.invoiceId}`}>
                      {p.invoiceNumber || p.invoiceId}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Orgs ─────────────────────────────────────────────────────────────────────
// Every central organisation record. Admins can open any into the shared
// authoring form (rules allow a platform admin to edit any org). Identity is
// authored here; billing lives elsewhere and is not shown.
function OrgsTab({ onEditOrg }) {
  const [rows, setRows] = useState(null)
  const [err,  setErr]  = useState('')
  const [q,    setQ]    = useState('')

  async function load() {
    try {
      const list = await listAllOrgs()
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      setRows(list)
    } catch (e) { setErr(e.message || 'Could not load organisations.') }
  }
  useEffect(() => { load() }, [])

  const typeLabel = (t) => ORG_TYPES.find(x => x.key === t)?.label || t
  const filtered = useMemo(() => {
    if (!rows) return null
    if (!q.trim()) return rows
    const n = q.trim().toLowerCase()
    return rows.filter(o =>
      (o.name || '').toLowerCase().includes(n)
      || (o.slug || '').toLowerCase().includes(n)
      || (o.region || '').toLowerCase().includes(n))
  }, [rows, q])

  return (
    <div className="adm-section">
      <div className="adm-toolbar">
        <input type="search" value={q} placeholder="Search by name, slug or region"
          onChange={e => setQ(e.target.value)} />
        <Link className="btn btn-primary btn-sm" to="/admin/orgs/new">Create org</Link>
      </div>
      <Notice kind="err">{err}</Notice>
      {!filtered ? <p className="adm-loading">Loading…</p> : filtered.length === 0 ? (
        <p className="muted">No organisations{q ? ' match' : ' yet'}.</p>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr><th>Organisation</th><th>Type</th><th>Slug</th><th>Region</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o.id}>
                  <td>
                    <div className="adm-name">{o.name || <span className="muted">(no name)</span>}</div>
                    <div className="adm-uid">owner: {o.ownerUserId || '—'}</div>
                  </td>
                  <td>{typeLabel(o.type)}</td>
                  <td className="tnum">{o.slug}</td>
                  <td>{o.region || <span className="muted">—</span>}</td>
                  <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => onEditOrg(o.id)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Invoices ─────────────────────────────────────────────────────────────────
// Every invoice ever raised, filterable by status. Mark paid → grants the plan
// through the same entitlement core as the Access tab and logs an EFT payment
// row. Void keeps the record (gapless numbering beats deletion when you're
// reconciling a bank statement).
function InvoicesTab() {
  const [rows,   setRows]   = useState(null)
  const [err,    setErr]    = useState('')
  const [msg,    setMsg]    = useState(null)
  const [filter, setFilter] = useState('outstanding')
  const [busyId, setBusyId] = useState('')

  async function load() {
    setErr('')
    try {
      const snap = await getDocs(collection(identityDb, 'invoices'))
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      setRows(list)
    } catch (e) {
      setErr(e.message || 'Could not load invoices.')
    }
  }

  useEffect(() => { load() }, [])

  const shown = useMemo(() => {
    if (!rows) return null
    if (filter === 'all') return rows
    return rows.filter(r => r.status === filter)
  }, [rows, filter])

  async function markPaid(inv) {
    if (!window.confirm(`Mark ${inv.number} (${fmtMoney(inv.amount)}) as PAID and activate ${inv.planLabel} for ${inv.accountEmail || inv.uid}?`)) return
    setBusyId(inv.id); setMsg(null)
    try {
      const call = httpsCallable(functions, 'markInvoicePaid')
      await call({ id: inv.id })
      setMsg({ kind: 'ok', text: `${inv.number} marked paid — plan activated. It reaches the sport sites on the user's next sign-in or within about an hour.` })
      await load()
    } catch (e) {
      setMsg({ kind: 'err', text: e.message || 'Could not mark paid.' })
    } finally {
      setBusyId('')
    }
  }

  async function voidInv(inv) {
    const note = window.prompt(`Void ${inv.number}? Optional note (e.g. "duplicate", "customer cancelled"):`)
    if (note === null) return
    setBusyId(inv.id); setMsg(null)
    try {
      const call = httpsCallable(functions, 'voidInvoice')
      await call({ id: inv.id, note })
      setMsg({ kind: 'ok', text: `${inv.number} voided.` })
      await load()
    } catch (e) {
      setMsg({ kind: 'err', text: e.message || 'Could not void.' })
    } finally {
      setBusyId('')
    }
  }

  const FILTERS = [
    ['outstanding', 'Outstanding'],
    ['paid',        'Paid'],
    ['void',        'Void'],
    ['all',         'All'],
  ]

  return (
    <div className="adm-section">
      <div className="adm-toolbar">
        <div className="adm-filterrow">
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`adm-filter ${filter === key ? 'active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="adm-count">{shown ? `${shown.length} invoice${shown.length === 1 ? '' : 's'}` : ''}</span>
      </div>
      <Notice kind="err">{err}</Notice>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {!shown ? <p className="adm-loading">Loading…</p> : shown.length === 0 ? (
        <p className="muted">No {filter === 'all' ? '' : filter + ' '}invoices.</p>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr><th>Invoice</th><th>Invoiced to</th><th>Plan</th><th>Amount</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {shown.map(v => (
                <tr key={v.id}>
                  <td>
                    <div className="adm-name tnum">{v.number}</div>
                    <div className="adm-uid">{fmtDate(v.createdAt)}</div>
                  </td>
                  <td>
                    <div>{v.billTo?.name || <span className="muted">—</span>}</div>
                    <div className="adm-uid">{v.billTo?.email}{v.accountEmail && v.accountEmail !== v.billTo?.email ? ` · acc: ${v.accountEmail}` : ''}</div>
                  </td>
                  <td>{v.planLabel}</td>
                  <td className="tnum">{fmtMoney(v.amount)}</td>
                  <td><span className={`pill pill-${statusOf(v.status).pill}`}>{statusOf(v.status).label}</span></td>
                  <td className="adm-actions">
                    <Link className="btn btn-ghost btn-sm" to={`/invoices/${v.id}`}>View</Link>
                    {v.status === 'outstanding' && (
                      <>
                        <button type="button" className="btn btn-primary btn-sm" disabled={busyId === v.id} onClick={() => markPaid(v)}>
                          {busyId === v.id ? '…' : 'Mark paid'}
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" disabled={busyId === v.id} onClick={() => voidInv(v)}>
                          Void
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Messages (contact form) ──────────────────────────────────────────────────
function MessagesTab() {
  const [rows, setRows] = useState(null)
  const [err,  setErr]  = useState('')

  async function load() {
    setErr('')
    try {
      const q = query(collection(identityDb, 'contactMessages'), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) {
      setErr(e.message || 'Could not load messages.')
    }
  }

  useEffect(() => { load() }, [])

  async function toggleRead(id, read) {
    try {
      await updateDoc(doc(identityDb, 'contactMessages', id), { read: !read })
      setRows(rs => rs.map(r => r.id === id ? { ...r, read: !read } : r))
    } catch (e) {
      setErr(e.message || 'Could not update message.')
    }
  }

  return (
    <div className="adm-section">
      <p className="adm-hint">
        Contact-form submissions. Email delivery to <strong>michael@matchpulse.co.za</strong>{' '}
        needs SMTP or a transactional-email API key configured on the function
        (see the <code>submitContactForm</code> TODO); until then, messages
        surface here immediately after submit.
      </p>
      <Notice kind="err">{err}</Notice>
      {!rows ? <p className="adm-loading">Loading…</p> : rows.length === 0 ? (
        <p className="muted">No messages yet.</p>
      ) : (
        <ul className="adm-messages">
          {rows.map(m => (
            <li key={m.id} className={m.read ? 'read' : 'unread'}>
              <div className="adm-msg-head">
                <div>
                  <div className="adm-msg-name">{m.name || <span className="muted">(no name)</span>}</div>
                  <div className="adm-msg-meta">
                    <a href={`mailto:${m.email}`}>{m.email}</a>
                    {m.phone && <span> · <a href={`tel:${m.phone}`}>{m.phone}</a></span>}
                    <span> · {fmtDate(m.createdAt)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => toggleRead(m.id, m.read)}
                >
                  {m.read ? 'Mark unread' : 'Mark read'}
                </button>
              </div>
              <div className="adm-msg-body">{m.message}</div>
            </li>
          ))}
        </ul>
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


// ── Venues (master) ──────────────────────────────────────────────────────────
function GroupMerge({ group, onMerge, busy }) {
  const [keeper, setKeeper] = useState(group[0].id)
  return (
    <ul className="venue-list venue-dupe-group">
      {group.map(v => (
        <li key={v.id}>
          <label className="venue-keeper"><input type="radio" checked={keeper === v.id} onChange={() => setKeeper(v.id)} /> Keep</label>
          <div className="venue-li-id"><strong>{v.name}</strong><span className="venue-li-meta">{v.address?.city || '—'}{v.verified && <span className="venue-tag venue-tag-ok">verified</span>}</span></div>
          {keeper !== v.id && <button type="button" className="btn btn-ghost btn-sm" disabled={busy === v.id} onClick={() => onMerge(v.id, keeper)}>{busy === v.id ? 'Merging…' : 'Merge into keeper'}</button>}
        </li>
      ))}
    </ul>
  )
}

function VenueDuplicateQueue() {
  const [groups, setGroups] = useState(null)
  const [busy, setBusy] = useState('')
  const [msg,  setMsg]  = useState(null)

  async function load() {
    const all = await listAllVenues().catch(() => [])
    const by = {}
    for (const v of all.filter(v => v.active !== false)) {
      const k = v.nameNormalised || (v.name || '').toLowerCase()
      ;(by[k] = by[k] || []).push(v)
    }
    setGroups(Object.values(by).filter(g => g.length > 1))
  }
  useEffect(() => { load() }, [])

  async function onMerge(sourceId, targetId) {
    if (!window.confirm('Merge these venues? Match references repoint to the keeper and the duplicate is retired (not deleted).')) return
    setBusy(sourceId); setMsg(null)
    try {
      const r = await mergeVenues(sourceId, targetId)
      setMsg({ kind: 'ok', text: `Merged — ${r.repointed} match reference(s) repointed to the keeper.` })
      await load()
    } catch (e) { setMsg({ kind: 'err', text: e.message || 'Merge failed.' }) }
    finally { setBusy('') }
  }

  return (
    <section className="org-activate">
      <h2 className="inv-edit-h">Duplicate review</h2>
      <p className="adm-field-hint">Active venues that share a normalised name. Pick the one to keep, then merge the others into it — match references follow, the duplicate is retired.</p>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {groups === null ? <p className="adm-loading">Checking…</p>
        : groups.length === 0 ? <p className="muted">No duplicate names. 🎉</p>
        : groups.map((g, i) => <GroupMerge key={i} group={g} onMerge={onMerge} busy={busy} />)}
    </section>
  )
}

function VenuesTab() {
  const [orgs, setOrgs] = useState([])
  useEffect(() => { listAllOrgs().then(setOrgs).catch(() => {}) }, [])
  return (
    <div className="adm-section">
      <VenueManager master orgOptions={orgs} />
      <VenueDuplicateQueue />
    </div>
  )
}

// ── SEO ──────────────────────────────────────────────────────────────────────
const SEO_DEFAULTS = {
  siteTitle:       'MatchPulse | Sports Results for Schools, Clubs and Competitions',
  siteDescription: 'MatchPulse lets coaches enter results directly after the match, saving schools, clubs and competition organisers from collecting and re-entering every score.',
  ogTitle:         'MatchPulse | Sports Results for Schools, Clubs and Competitions',
  ogDescription:   'Every coach enters one result. You see them all. Across rugby, hockey, netball and water polo.',
  ogImage:         '',
  themeColor:      '#059669',
  headCode:        '',
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
          <div className="field">
            <label htmlFor="seo-headCode">
              Custom code — inserted into the page &lt;head&gt; on every page
            </label>
            <textarea
              rows={8}
              className="adm-code"
              placeholder={'Paste any tracking or verification code here — e.g. your StatCounter snippet,\nGoogle Search Console verification tag, analytics scripts.\n\n<script>...</script> tags are supported and will run.'}
              spellCheck={false}
              {...bind('headCode')}
            />
            <p className="adm-field-hint">
              Runs for every visitor on every page of the main site. Paste the full snippet
              exactly as the provider gives it (StatCounter, Google verification, etc.).
              Changes apply from the next page load after saving.
            </p>
          </div>
          <button className="btn btn-dark" disabled={busy}>{busy ? 'Saving…' : 'Save SEO'}</button>
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        </form>
      )}
    </div>
  )
}

// ── Shell ────────────────────────────────────────────────────────────────────
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s
const navCls = ({ isActive }) => 'adm-nav-item' + (isActive ? ' active' : '')

// Role-filtered sidebar: platform admins get the platform sections; anyone who
// owns organisations gets a "My Schools / My Clubs / …" section per type they own.
function AdminNav({ isAdmin, typesPresent, onNavigate }) {
  // Owners' "My Schools / Clubs / …" links. For a platform admin these sit
  // directly beneath the "Organisations" tab; for an owner (no platform tabs)
  // they are the whole nav.
  const myLinks = typesPresent.map(t => {
    const Icon = ICONS.orgs
    const seg = TYPE_PREFIX[t.key] || t.key
    return (
      <NavLink key={`my-${t.key}`} to={`/admin/${seg}`} className={navCls} onClick={onNavigate}>
        {Icon && <Icon />}<span>My {cap(seg)}</span>
      </NavLink>
    )
  })
  return (
    <nav className="adm-nav" aria-label="Sections">
      {isAdmin
        ? TABS.map(t => {
            const Icon = ICONS[t.key]
            const link = (
              <NavLink key={t.key} to={`/admin/${t.key}`} end className={navCls} onClick={onNavigate}>
                {Icon && <Icon />}<span>{t.label}</span>
              </NavLink>
            )
            // Slot the owner's own orgs right under the Organisations tab.
            return t.key === 'orgs' ? [link, ...myLinks] : link
          })
        : myLinks}
    </nav>
  )
}

// A signed-in owner's list of one org type, linking each into the shell editor.
function MyOrgList({ type, orgs }) {
  const mine  = orgs.filter(o => o.type === type)
  const label = ORG_TYPES.find(t => t.key === type)?.label || 'Organisation'
  const seg   = TYPE_PREFIX[type] || type
  return (
    <div className="adm-section">
      <div className="adm-toolbar">
        <span className="adm-count">{mine.length} {seg}</span>
        <Link className="btn btn-primary btn-sm" to="/admin/orgs/new">Add {label.toLowerCase()}</Link>
      </div>
      {mine.length === 0 ? <p className="muted">You don't manage any {seg} yet.</p> : (
        <ul className="org-cards">
          {mine.map(o => (
            <li key={o.id}>
              <Link className="org-card" to={`/admin/orgs/${o.id}`} style={{ '--pc': o.primaryColor || '#059669' }}>
                <span className="org-card-logo">{o.logoUrl ? <img src={o.logoUrl} alt="" /> : <span>{(o.matchName || o.name || '?').slice(0, 1)}</span>}</span>
                <span className="org-card-body"><span className="org-card-name">{o.name}</span><span className="org-card-meta">{label} · {o.slug}</span></span>
                <span className="org-card-edit">Manage →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// /admin index → first available section for the role.
function AdminHome({ isAdmin, typesPresent }) {
  if (isAdmin) return <Navigate to="/admin/users" replace />
  if (typesPresent.length) return <Navigate to={`/admin/${TYPE_PREFIX[typesPresent[0].key]}`} replace />
  return (
    <div className="adm-section">
      <div className="adm-callout">
        <h3>You don't manage any organisations yet.</h3>
        <p>Create a school, club, association or league to manage its profile, venues and people.</p>
        <Link className="btn btn-primary" to="/admin/orgs/new">Create an organisation</Link>
      </div>
    </div>
  )
}

// Remount OrgForm when the :id changes so its state (loading, roster, activated
// sports) resets cleanly instead of flashing the previous org while it refetches.
function OrgFormRoute() {
  const { id } = useParams()
  return <OrgForm key={id} />
}

export default function Admin() {
  const { user, profile } = useAuth()
  const isAdmin = profile?.platformAdmin === true
  const [open,   setOpen]   = useState(false)
  const [myOrgs, setMyOrgs] = useState([])
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => { if (user?.uid) listOrgsOwnedBy(user.uid).then(setMyOrgs).catch(() => setMyOrgs([])) }, [user?.uid])
  useEffect(() => { setOpen(false) }, [location.pathname])

  const typesPresent = ORG_TYPES.filter(t => myOrgs.some(o => o.type === t.key))
  const name    = profile?.displayName || user?.displayName || profile?.email || 'Account'
  const initial = (name || '?').slice(0, 1).toUpperCase()
  const badge   = isAdmin ? 'Admin' : 'Manage'
  const editOrg = (id) => navigate(`/admin/orgs/${id}`)

  const Brand = () => (
    <Link to="/" className="adm-brand">
      <span className="adm-brand-mark"><span className="m">Match</span><span className="p">Pulse</span></span>
      <span className="adm-brand-badge">{badge}</span>
    </Link>
  )
  const Foot = () => (
    <div className="adm-side-foot">
      <Link to="/" className="adm-foot-link">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5 M12 19l-7-7 7-7" /></svg>
        Public site
      </Link>
      <Link to="/account" className="adm-foot-acct">
        <span className="adm-foot-av">{initial}</span>
        <span className="adm-foot-email">{profile?.email || user?.email}</span>
      </Link>
    </div>
  )

  return (
    <div className="adm-shell">
      <aside className="adm-side">
        <div className="adm-side-head"><Brand /></div>
        <AdminNav isAdmin={isAdmin} typesPresent={typesPresent} />
        <Foot />
      </aside>

      <div className="adm-body">
        <header className="adm-mobtop">
          <Brand />
          <button className="menu-btn" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(o => !o)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </header>
        {open && (
          <div className="adm-mobnav">
            <AdminNav isAdmin={isAdmin} typesPresent={typesPresent} onNavigate={() => setOpen(false)} />
            <Foot />
          </div>
        )}

        <main className="adm-main">
          <Routes>
            <Route index element={<AdminHome isAdmin={isAdmin} typesPresent={typesPresent} />} />
            {isAdmin && <Route path="users"        element={<UsersTab onEditOrg={editOrg} />} />}
            {isAdmin && <Route path="orgs"         element={<OrgsTab onEditOrg={editOrg} />} />}
            {isAdmin && <Route path="invoices"     element={<InvoicesTab />} />}
            {isAdmin && <Route path="messages"     element={<MessagesTab />} />}
            {isAdmin && <Route path="payments"     element={<PaymentsTab />} />}
            {isAdmin && <Route path="activity"     element={<ActivityTab />} />}
            {isAdmin && <Route path="venues"       element={<VenuesTab />} />}
            {isAdmin && <Route path="seo"          element={<SeoTab />} />}
            {ORG_TYPES.map(t => <Route key={t.key} path={TYPE_PREFIX[t.key]} element={<MyOrgList type={t.key} orgs={myOrgs} />} />)}
            <Route path="orgs/new" element={<OrgForm />} />
            <Route path="orgs/:id" element={<OrgFormRoute />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
