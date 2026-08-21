import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, orderBy, query, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { statusOf } from '../lib/billing'
import { listAllOrgs, ORG_TYPES } from '../lib/orgs'
import { identityDb, functions } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { SPORTS } from '../lib/sports'
import { planStatus } from '../contexts/AuthContext'

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
  seo:      I('M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35'),
}

const TABS = [
  { key: 'users',    label: 'Users' },
  { key: 'orgs',     label: 'Organisations' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'messages', label: 'Messages' },
  { key: 'payments', label: 'Payments' },
  { key: 'activity', label: 'Sport activity' },
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
function UserDetail({ user, orgsById, onBack, onChanged }) {
  const [name, setName] = useState(user.displayName || '')
  const [form, setForm] = useState(() => ({
    plan:    user.raw.entitlement ?? 'none',
    credits: Math.max(1, user.raw.eventCredits ?? 1),
    years:   1, method: 'eft', note: '',
  }))
  const [busy, setBusy] = useState('')
  const [msg,  setMsg]  = useState(null)
  const [comps, setComps] = useState(null)

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

  async function saveName() {
    setBusy('name'); setMsg(null)
    try {
      await httpsCallable(functions, 'adminSetUserName')({ uid: user.uid, displayName: name.trim() })
      setMsg({ kind: 'ok', text: 'Name updated.' }); onChanged?.()
    } catch (e) { setMsg({ kind: 'err', text: e.message || 'Could not update name.' }) }
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

  async function removeUser() {
    if (!window.confirm(`Delete ${user.email || user.uid}? This removes their sign-in and profile. Any organisations they own stay but become ownerless. This cannot be undone.`)) return
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
        {/* Identity */}
        <section className="adm-ud-card">
          <h4>Name</h4>
          <div className="adm-inline-form">
            <input type="text" value={name} placeholder="Full name" onChange={e => setName(e.target.value)} />
            <button type="button" className="btn btn-dark btn-sm" disabled={busy === 'name' || name.trim() === (user.displayName || '')} onClick={saveName}>
              {busy === 'name' ? 'Saving…' : 'Save name'}
            </button>
          </div>
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
                  <Link to={`/organisations/${oid}/edit`}>{orgsById[oid]?.name || oid}</Link>
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

      {/* Danger */}
      <section className="org-danger">
        <h4 className="inv-edit-h">Delete user</h4>
        <p className="adm-field-hint">Removes their sign-in and profile. Organisations they own stay but become ownerless (reassign later). Matches are never deleted.</p>
        <button type="button" className="btn btn-danger btn-sm" disabled={busy === 'del'} onClick={removeUser}>
          {busy === 'del' ? 'Deleting…' : 'Delete user'}
        </button>
      </section>
    </div>
  )
}

function UsersTab() {
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

  if (sel) return <UserDetail key={sel.uid} user={sel} orgsById={orgsById} onBack={() => setSel(null)} onChanged={refresh} />

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
                    <span className={`pill pill-${p.paymentStatus === 'COMPLETE' ? 'ok' : p.manual ? 'admin' : 'warn'}`}>
                      {p.manual ? (p.method || 'manual').toUpperCase() : (p.paymentStatus || 'PENDING')}
                    </span>
                  </td>
                  <td className="adm-uid">{p.manual ? (p.note || '(manual allocation)') : (p.pfPaymentId || p.mPaymentId || p.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Hockey migration (one-time) ──────────────────────────────────────────────
// Drives the Brief #5 migration: Dry run (read-only preview) → Import (writes
// central, activatedSports empty) → Activate all in Hockey (the safety gate is
// eyeballing central between Import and Activate).
function HockeyMigrationPanel() {
  const [busy, setBusy] = useState('')
  const [res,  setRes]  = useState(null)
  const [err,  setErr]  = useState('')

  async function run(fn, arg, label) {
    if (label === 'import' && !window.confirm('Write these orgs into the central database? Safe to re-run; nothing is written to Hockey.')) return
    if (label === 'activate' && !window.confirm('Activate every Hockey org into Hockey now? Only do this after eyeballing the imported central records.')) return
    setBusy(label); setErr(''); setRes(null)
    try {
      const call = httpsCallable(functions, fn)
      const { data } = await call(arg)
      setRes({ label, data })
    } catch (e) {
      setErr(e.message || 'Failed.')
    } finally {
      setBusy('')
    }
  }

  return (
    <details className="adm-migrate">
      <summary>Hockey org migration (one-time)</summary>
      <div className="adm-migrate-body">
        <p className="adm-field-hint">
          <strong>Dry run</strong> previews what would import (writes nothing).
          <strong> Import</strong> writes the central records with <code>activatedSports</code> empty —
          Hockey is untouched. Eyeball the central orgs, then <strong>Activate</strong> to switch on the
          sync into Hockey.
        </p>
        <div className="adm-migrate-actions">
          <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy}
            onClick={() => run('centralMigrateHockeyOrgs', { commit: false }, 'dryrun')}>
            {busy === 'dryrun' ? 'Reading…' : '1. Dry run'}
          </button>
          <button type="button" className="btn btn-dark btn-sm" disabled={!!busy}
            onClick={() => run('centralMigrateHockeyOrgs', { commit: true }, 'import')}>
            {busy === 'import' ? 'Importing…' : '2. Import to central'}
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!!busy}
            onClick={() => run('centralActivateHockeyOrgs', {}, 'activate')}>
            {busy === 'activate' ? 'Activating…' : '3. Activate all in Hockey'}
          </button>
        </div>

        <Notice kind="err">{err}</Notice>

        {res && res.data && (
          <div className="adm-migrate-result">
            {res.label !== 'activate' ? (
              <>
                <p className="adm-name">
                  {res.data.commit ? `Imported ${res.data.written} of ${res.data.count}` : `Dry run: ${res.data.count} orgs`}
                  {res.data.collisions?.length ? ` · ⚠️ ${res.data.collisions.length} slug collision(s)` : ''}
                  {res.data.ambiguities?.length ? ` · ⚠️ ${res.data.ambiguities.length} ambiguous owner(s)` : ''}
                </p>
                {res.data.collisions?.length > 0 && (
                  <p className="form-err">Collisions (nothing written): {res.data.collisions.map(c => c.slug).join(', ')} — resolve by hand.</p>
                )}
                <div className="adm-table-wrap">
                  <table className="adm-table">
                    <thead><tr><th>Org</th><th>Slug</th><th>Owner</th><th>Staff</th><th>Flags</th></tr></thead>
                    <tbody>
                      {res.data.orgs.map(o => (
                        <tr key={o.orgId}>
                          <td><div className="adm-name">{o.name || '(no name)'}</div><div className="adm-uid">{o.orgId}</div></td>
                          <td className="tnum">{o.slug || '—'}</td>
                          <td className="adm-uid">{o.ownerUserId || '—'}<div className="muted">{o.ownerSource}</div></td>
                          <td>{o.staffCount}</td>
                          <td>{o.collision ? <span className="pill pill-warn">slug clash</span> : o.ownerSource?.includes('ambiguous') ? <span className="pill pill-warn">owner?</span> : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead><tr><th>Org</th><th>Result</th><th>Staff copied</th></tr></thead>
                  <tbody>
                    {res.data.results.map(r => (
                      <tr key={r.orgId}>
                        <td className="adm-uid">{r.orgId}</td>
                        <td>{r.error ? <span className="form-err">{r.error}</span> : r.alreadyActive ? 'already active' : r.skipped ? r.skipped : `activated (${r.sport})`}</td>
                        <td>{r.staffCount ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </details>
  )
}

// ── Orgs ─────────────────────────────────────────────────────────────────────
// Every central organisation record. Admins can open any into the shared
// authoring form (rules allow a platform admin to edit any org). Identity is
// authored here; billing lives elsewhere and is not shown.
function OrgsTab() {
  const [rows, setRows] = useState(null)
  const [err,  setErr]  = useState('')
  const [q,    setQ]    = useState('')

  useEffect(() => {
    let cancel = false
    ;(async () => {
      try {
        const list = await listAllOrgs()
        if (cancel) return
        list.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        setRows(list)
      } catch (e) {
        if (!cancel) setErr(e.message || 'Could not load organisations.')
      }
    })()
    return () => { cancel = true }
  }, [])

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
      <HockeyMigrationPanel />
      <div className="adm-toolbar">
        <input type="search" value={q} placeholder="Search by name, slug or region"
          onChange={e => setQ(e.target.value)} />
        <Link className="btn btn-primary btn-sm" to="/organisations/new">Create org</Link>
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
                  <td><Link className="btn btn-ghost btn-sm" to={`/organisations/${o.id}/edit`}>Edit</Link></td>
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
function AdminNav({ tab, onPick }) {
  return (
    <nav className="adm-nav" role="tablist" aria-label="Admin sections">
      {TABS.map(t => {
        const Icon = ICONS[t.key]
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={'adm-nav-item' + (tab === t.key ? ' active' : '')}
            onClick={() => onPick(t.key)}
          >
            {Icon && <Icon />}
            <span>{t.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

export default function Admin() {
  const [tab, setTab] = useState('users')
  const [open, setOpen] = useState(false)
  const { user, profile } = useAuth()

  const pick = (k) => { setTab(k); setOpen(false) }
  const name = profile?.displayName || user?.displayName || profile?.email || 'Admin'
  const initial = (name || '?').slice(0, 1).toUpperCase()

  const Brand = () => (
    <Link to="/" className="adm-brand">
      <span className="adm-brand-mark"><span className="m">Match</span><span className="p">Pulse</span></span>
      <span className="adm-brand-badge">Admin</span>
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
      {/* Desktop sidebar */}
      <aside className="adm-side">
        <div className="adm-side-head"><Brand /></div>
        <AdminNav tab={tab} onPick={pick} />
        <Foot />
      </aside>

      {/* Content */}
      <div className="adm-body">
        {/* Mobile top bar */}
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
            <AdminNav tab={tab} onPick={pick} />
            <Foot />
          </div>
        )}

        <main className="adm-main">
          {tab === 'users'    && <UsersTab />}
          {tab === 'orgs'     && <OrgsTab />}
          {tab === 'invoices' && <InvoicesTab />}
          {tab === 'messages' && <MessagesTab />}
          {tab === 'payments' && <PaymentsTab />}
          {tab === 'activity' && <ActivityTab />}
          {tab === 'seo'      && <SeoTab />}
        </main>
      </div>
    </div>
  )
}
