import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { SPORTS } from '../lib/sports'
import { orgPublicPath, adminSetProfileSubscription, createProfileInvoice } from '../lib/orgProfile'
import {
  ORG_TYPES, GENDER_PROFILES, typeHasMatchName, emptyOrg,
  slugify, generateUniqueOrgSlug, slugIsFree,
  createOrg, updateOrg, uploadOrgAsset, getOrg, activateOrgInSport,
  deactivateOrgInSport, deleteOrg, adminChangeSlug, findOrgsByName,
} from '../lib/orgs'

const SOCIALS = [
  { key: 'facebook',  label: 'Facebook' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'x',         label: 'X (Twitter)' },
  { key: 'youtube',   label: 'YouTube' },
]

function AssetField({ label, kind, orgId, url, onChange, hint }) {
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState('')

  async function pick(file) {
    if (!file) return
    if (!orgId) { setErr('Save the organisation first, then add images.'); return }
    setBusy(true); setErr('')
    try {
      const next = await uploadOrgAsset(kind, orgId, file)
      onChange(`${next}?t=${Date.now()}`) // cache-bust after re-upload to same path
    } catch (e) {
      setErr(e.message || 'Upload failed.')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="field">
      <label>{label}</label>
      <div className="org-asset">
        <div className={`org-asset-preview ${kind}`}>
          {url ? <img src={url} alt="" /> : <span className="org-asset-empty">No image</span>}
        </div>
        <div className="org-asset-actions">
          <input ref={input} type="file" accept="image/*" className="pfp-input"
            onChange={e => pick(e.target.files?.[0])} />
          <button type="button" className="btn btn-dark btn-sm" disabled={busy || !orgId}
            onClick={() => input.current?.click()}>
            {busy ? 'Uploading…' : url ? 'Replace' : 'Upload'}
          </button>
          {url && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange('')}>Remove</button>}
          <p className="adm-field-hint">{hint}</p>
          {err && <p className="form-err">{err}</p>}
        </div>
      </div>
    </div>
  )
}

export default function OrgForm() {
  const { id } = useParams()                 // undefined on /new
  const editing = !!id
  const { user, profile } = useAuth()
  const isAdmin = profile?.platformAdmin === true
  const navigate = useNavigate()

  const [f,        setF]        = useState(emptyOrg())
  const [slug,     setSlug]     = useState('')
  const [record,   setRecord]   = useState(null)   // existing doc when editing
  const [loading,  setLoading]  = useState(editing)
  const [busy,     setBusy]     = useState(false)
  const [msg,      setMsg]      = useState(null)
  const [denied,   setDenied]   = useState(false)
  const [transfer, setTransfer] = useState('')     // new ownerUserId, transfer only
  const [activated, setActivated] = useState({})   // activatedSports map
  const [actBusy,  setActBusy]  = useState('')     // sport key mid-activation
  const [actMsg,   setActMsg]   = useState(null)
  const [slugEdit, setSlugEdit] = useState('')     // admin slug editor input
  const [slugBusy, setSlugBusy] = useState(false)
  const [delBusy,  setDelBusy]  = useState(false)
  const [dupes,    setDupes]    = useState(null)   // same-name orgs found on create

  const isOwner = record?.ownerUserId === user?.uid
  const canDelete = editing && (isAdmin || isOwner)
  const isActivated = Object.keys(activated).length > 0

  // Load existing org for edit; gate to owner/admin (rules also enforce).
  useEffect(() => {
    if (!editing) return
    let cancel = false
    ;(async () => {
      try {
        const org = await getOrg(id)
        if (cancel) return
        if (!org) { setDenied(true); setLoading(false); return }
        if (org.ownerUserId !== user?.uid && !isAdmin) { setDenied(true); setLoading(false); return }
        setRecord(org)
        setSlug(org.slug || '')
        setActivated(org.activatedSports || {})
        setF({ ...emptyOrg(), ...org, socialLinks: org.socialLinks || {} })
        setLoading(false)
      } catch {
        if (!cancel) { setDenied(true); setLoading(false) }
      }
    })()
    return () => { cancel = true }
  }, [editing, id, user?.uid, isAdmin])

  const set   = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))
  const setSoc = (k) => (e) => setF(s => ({ ...s, socialLinks: { ...s.socialLinks, [k]: e.target.value } }))
  const showMatchName = typeHasMatchName(f.type)

  async function submit(e, force = false) {
    e?.preventDefault?.()
    if (!f.name.trim()) { setMsg({ kind: 'err', text: 'Name is required.' }); return }
    setBusy(true); setMsg(null)
    try {
      // On create, warn (once) if an org with the same name already exists —
      // slugs dedupe silently, so this is the only guard against duplicates.
      if (!editing && !force) {
        const matches = await findOrgsByName(f.name)
        if (matches.length > 0) { setDupes(matches); setBusy(false); return }
      }
      if (editing) {
        await updateOrg(id, f, isAdmin || record?.ownerUserId === user?.uid
          ? (transfer.trim() ? { transferOwnerUserId: transfer.trim() } : {})
          : {})
        setMsg({ kind: 'ok', text: 'Organisation saved.' })
        if (transfer.trim()) { navigate('/organisations', { replace: true }); return }
      } else {
        const chosen = slug.trim() || await generateUniqueOrgSlug(f.name)
        if (!(await slugIsFree(chosen))) {
          setMsg({ kind: 'err', text: `The slug "${chosen}" is taken — edit it and try again.` })
          setSlug(chosen); setBusy(false); return
        }
        const res = await createOrg({ uid: user.uid, slug: chosen, fields: f })
        // Land on edit so they can now add logo/banner (needs the orgId).
        navigate(`/organisations/${res.id}/edit`, { replace: true })
        return
      }
    } catch (e) {
      setMsg({ kind: 'err', text: e.message || 'Could not save.' })
    } finally {
      setBusy(false)
    }
  }

  async function changeSlug() {
    const next = slugify(slugEdit)
    if (!next || next === slug) { setMsg({ kind: 'err', text: 'Enter a different, valid slug.' }); return }
    setSlugBusy(true); setMsg(null)
    try {
      const applied = await adminChangeSlug(id, slug, next, user.uid)
      setSlug(applied); setSlugEdit(''); setF(s => ({ ...s, slug: applied }))
      setMsg({ kind: 'ok', text: `Slug changed to “${applied}”.` })
    } catch (e) {
      setMsg({ kind: 'err', text: e.message || 'Could not change the slug.' })
    } finally {
      setSlugBusy(false)
    }
  }

  async function remove() {
    const label = isActivated
      ? 'This org is active on a sport and cannot be deleted here.'
      : `Delete “${f.name}” permanently? This frees the slug “${slug}” for reuse and cannot be undone.`
    if (isActivated) { setMsg({ kind: 'err', text: label }); return }
    if (!window.confirm(label)) return
    setDelBusy(true); setMsg(null)
    try {
      await deleteOrg(id)
      navigate('/organisations', { replace: true })
    } catch (e) {
      setMsg({ kind: 'err', text: e.message || 'Could not delete.' })
      setDelBusy(false)
    }
  }

  async function setSub(action) {
    setActBusy('sub'); setActMsg(null)
    try {
      const res = await adminSetProfileSubscription(id, action, 1)
      setActMsg({ kind: 'ok', text: action === 'revoke' ? 'Profile subscription revoked.' : 'Profile subscription active (+1 year).' })
      // reflect optimistically
      setRecord(r => ({ ...r, profileSubscription: { status: res.status } }))
    } catch (e) {
      setActMsg({ kind: 'err', text: e.message || 'Could not update subscription.' })
    } finally { setActBusy('') }
  }

  // Owner (or admin) self-subscribe. While the profile is free early access the
  // server grants it directly (no invoice, active until 31 Dec 2026).
  async function subscribeProfile() {
    setActBusy('sub'); setActMsg(null)
    try {
      const billTo = { name: f.name || record?.name || '', email: f.contactEmail || user?.email || '' }
      const res = await createProfileInvoice(id, billTo)
      if (res?.free) {
        setActMsg({ kind: 'ok', text: 'Subscribed — free during early access, active until 31 December 2026.' })
        setRecord(r => ({ ...r, profileSubscription: { status: 'active', plan: 'earlyAccessFree' } }))
      } else {
        navigate(`/invoices/${res.id}`)
      }
    } catch (e) {
      setActMsg({ kind: 'err', text: e.message || 'Could not subscribe.' })
    } finally { setActBusy('') }
  }

  async function activate(sport) {
    setActBusy(sport); setActMsg(null)
    try {
      const res = await activateOrgInSport(id, sport)
      setActivated(a => ({ ...a, [sport]: { activatedAt: Date.now() } }))
      setActMsg({ kind: 'ok', text: res.alreadyActive
        ? `${sport} was already active.`
        : `Activated on ${sport} — identity + ${res.staffCount ?? 0} staff copied. Use the “Manage on ${sport}” link to set it up and add teams & competitions there.` })
    } catch (e) {
      setActMsg({ kind: 'err', text: e.message || 'Activation failed.' })
    } finally {
      setActBusy('')
    }
  }

  async function deactivate(sport) {
    if (!window.confirm(`Deactivate ${sport}? The org's profile stops publishing on this sport, but every match it has played is kept — this does not delete any match or result.`)) return
    setActBusy(sport); setActMsg(null)
    try {
      await deactivateOrgInSport(id, sport)
      setActivated(a => { const n = { ...a }; delete n[sport]; return n })
      setActMsg({ kind: 'ok', text: `Deactivated on ${sport}. Matches it played are kept. You can delete the organisation once no sports are active.` })
    } catch (e) {
      setActMsg({ kind: 'err', text: e.message || 'Deactivation failed.' })
    } finally {
      setActBusy('')
    }
  }

  // Offer a slug suggestion as they type the name (create only).
  async function suggestSlug() {
    if (editing) return
    setSlug(await generateUniqueOrgSlug(f.name))
  }

  if (loading) return <main className="acct"><div className="wrap"><p className="adm-loading" style={{ paddingTop: 40 }}>Loading…</p></div></main>
  if (denied)  return (
    <main className="acct"><div className="wrap">
      <p className="notice notice-err" style={{ marginTop: 40 }}>You don’t have access to edit this organisation.</p>
      <p><Link to="/organisations">Back to your organisations</Link></p>
    </div></main>
  )

  return (
    <main className="acct">
      <div className="wrap org-form-wrap">
        <header className="acct-head">
          <p className="label">Organisation</p>
          <h1>{editing ? f.name || 'Edit organisation' : 'Create an organisation'}</h1>
          {editing && (
            <p className="acct-email">
              Slug <strong>{slug}</strong> · fixed after creation ·{' '}
              <Link to={orgPublicPath({ type: f.type, slug })}>View public page →</Link>
            </p>
          )}
        </header>

        {msg && <p className={`notice ${msg.kind === 'ok' ? 'notice-ok' : 'notice-err'}`} role="status">{msg.text}</p>}

        <form className="acct-form" onSubmit={submit}>
          {/* Identity */}
          <div className="field">
            <label htmlFor="o-name">Name *</label>
            <input id="o-name" type="text" required value={f.name} onChange={set('name')} onBlur={suggestSlug}
              placeholder="e.g. Ashton College" />
          </div>

          <div className="field">
            <label htmlFor="o-type">Type</label>
            <select id="o-type" value={f.type} onChange={set('type')}>
              {ORG_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>

          {showMatchName && (
            <div className="field">
              <label htmlFor="o-matchName">Match name <span className="opt">short name shown on matches</span></label>
              <input id="o-matchName" type="text" value={f.matchName || ''} onChange={set('matchName')}
                placeholder="e.g. Ashton" />
            </div>
          )}

          {!editing && (
            <div className="field">
              <label htmlFor="o-slug">Slug <span className="opt">web address — fixed after creation</span></label>
              <input id="o-slug" type="text" value={slug}
                onChange={e => setSlug(slugify(e.target.value))}
                onFocus={() => { if (!slug) suggestSlug() }}
                placeholder="ashton-college" />
            </div>
          )}

          <div className="field">
            <label htmlFor="o-gender">Gender profile</label>
            <select id="o-gender" value={f.genderProfile} onChange={set('genderProfile')}>
              {GENDER_PROFILES.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
            </select>
          </div>

          {/* Assets */}
          <AssetField label="Logo" kind="logo" orgId={editing ? id : null}
            url={f.logoUrl} onChange={v => setF(s => ({ ...s, logoUrl: v }))}
            hint="Square works best. Under 2 MB. JPEG, PNG or WebP." />
          <AssetField label="Banner" kind="banner" orgId={editing ? id : null}
            url={f.bannerUrl} onChange={v => setF(s => ({ ...s, bannerUrl: v }))}
            hint="Wide image for the org page header. Under 5 MB." />

          {/* Colours */}
          <div className="org-colors">
            <div className="field">
              <label htmlFor="o-primary">Primary colour</label>
              <div className="org-color-row">
                <input id="o-primary" type="color" value={f.primaryColor} onChange={set('primaryColor')} />
                <input type="text" value={f.primaryColor} onChange={set('primaryColor')} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="o-secondary">Secondary colour</label>
              <div className="org-color-row">
                <input id="o-secondary" type="color" value={f.secondaryColor} onChange={set('secondaryColor')} />
                <input type="text" value={f.secondaryColor} onChange={set('secondaryColor')} />
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="field">
            <label htmlFor="o-bio">Bio</label>
            <textarea id="o-bio" rows={3} value={f.bio} onChange={set('bio')}
              placeholder="A short description of the organisation." />
          </div>
          <div className="field">
            <label htmlFor="o-region">Region</label>
            <input id="o-region" type="text" value={f.region} onChange={set('region')} placeholder="e.g. KwaZulu-Natal" />
          </div>
          <div className="field">
            <label htmlFor="o-website">Website</label>
            <input id="o-website" type="url" value={f.website} onChange={set('website')} placeholder="https://…" />
          </div>
          <div className="field">
            <label htmlFor="o-email">Contact email</label>
            <input id="o-email" type="email" value={f.contactEmail} onChange={set('contactEmail')} placeholder="info@example.co.za" />
          </div>
          <div className="field">
            <label htmlFor="o-phone">Phone</label>
            <input id="o-phone" type="tel" value={f.phone} onChange={set('phone')} placeholder="e.g. 031 123 4567" />
          </div>

          {/* Socials */}
          <div className="field">
            <label>Social links <span className="opt">optional</span></label>
            <div className="org-socials">
              {SOCIALS.map(s => (
                <input key={s.key} type="url" value={f.socialLinks?.[s.key] || ''} onChange={setSoc(s.key)}
                  placeholder={s.label} />
              ))}
            </div>
          </div>

          {/* Ownership transfer (edit; owner or admin) */}
          {editing && (isAdmin || record?.ownerUserId === user?.uid) && (
            <div className="field org-transfer">
              <label htmlFor="o-transfer">Transfer ownership <span className="opt">optional — new owner’s user UID</span></label>
              <input id="o-transfer" type="text" value={transfer} onChange={e => setTransfer(e.target.value)}
                placeholder="Paste the new owner’s user UID" />
              <p className="adm-field-hint">Hands this organisation to another account. You’ll no longer be able to edit it unless you’re a platform admin.</p>
            </div>
          )}

          {!editing && dupes && dupes.length > 0 && (
            <div className="dup-warn" role="alert">
              <h3>There’s already an organisation called “{f.name.trim()}”</h3>
              <p>Please check it isn’t the same one before creating a duplicate — duplicates split a school or club’s results across two profiles.</p>
              <ul className="dup-list">
                {dupes.map(o => (
                  <li key={o.id}>
                    <div className="dup-org">
                      <strong>{o.name}</strong>
                      <span className="dup-meta">{[o.type, o.region].filter(Boolean).join(' · ') || 'Organisation'}</span>
                    </div>
                    <div className="dup-actions">
                      <a className="btn btn-ghost btn-sm" href={orgPublicPath(o)} target="_blank" rel="noreferrer">View</a>
                      {o.contactEmail && <a className="btn btn-ghost btn-sm" href={`mailto:${o.contactEmail}`}>Contact owner</a>}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="dup-cta">
                <button type="button" className="btn btn-dark btn-sm" onClick={() => { setDupes(null); submit(null, true) }}>
                  Mine is different — create anyway
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDupes(null)}>Cancel</button>
              </div>
            </div>
          )}

          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save organisation' : 'Create organisation'}
          </button>
          {!editing && <p className="acct-fine">You’ll be able to add a logo and banner right after it’s created.</p>}
        </form>

        {/* Activation — copy this org down into a sport. Owner or admin. */}
        {editing && (isAdmin || record?.ownerUserId === user?.uid) && (
          <section className="org-activate">
            <h2 className="inv-edit-h">Activate on sports</h2>
            <p className="adm-field-hint">
              Copies this organisation’s identity and staff into a sport so the owner can
              manage it there; central edits flow down automatically. Deactivating a sport
              stops it publishing there but always keeps every match it has played.
            </p>
            {actMsg && <p className={`notice ${actMsg.kind === 'ok' ? 'notice-ok' : 'notice-err'}`}>{actMsg.text}</p>}
            <ul className="org-activate-list">
              {SPORTS.map(s => {
                const on = !!activated[s.key]
                return (
                  <li key={s.key} style={{ '--hue': s.hue }}>
                    <span className="org-act-dot" style={{ background: s.hue }} />
                    <span className="org-act-name">{s.name}</span>
                    <span className="org-act-actions">
                    {on ? (
                      <>
                        <a className="btn btn-primary btn-sm" href={`${s.host}/manage/orgs/${id}`} target="_blank" rel="noreferrer">
                          Manage on {s.name} ↗
                        </a>
                        <button type="button" className="btn btn-ghost btn-sm"
                          disabled={actBusy === s.key}
                          onClick={() => deactivate(s.key)}>
                          {actBusy === s.key ? 'Deactivating…' : 'Deactivate'}
                        </button>
                      </>
                    ) : (
                      <button type="button" className="btn btn-dark btn-sm"
                        disabled={actBusy === s.key}
                        onClick={() => activate(s.key)}>
                        {actBusy === s.key ? 'Activating…' : 'Activate'}
                      </button>
                    )}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* Cross-sport profile subscription (Brief #6). Owners self-subscribe;
            admins also get grant/revoke. Free during early access. */}
        {editing && (isAdmin || isOwner) && (() => {
          const subActive = record?.profileSubscription?.status === 'active'
          return (
            <section className="org-activate">
              <h2 className="inv-edit-h">Cross-sport profile subscription</h2>
              <p className="adm-field-hint">
                Publishes {f.name || 'this organisation'}’s matches &amp; results across every sport it plays,
                on one public page. Status: <strong>{subActive ? 'Subscribed' : 'Not subscribed'}</strong>.
                {' '}<strong>Free during early access — active until 31 December 2026.</strong>
              </p>
              <div className="adm-migrate-actions">
                {!subActive && (
                  <button type="button" className="btn btn-primary btn-sm" disabled={actBusy === 'sub'} onClick={subscribeProfile}>
                    {actBusy === 'sub' ? 'Subscribing…' : 'Subscribe — free early access'}
                  </button>
                )}
                {subActive && (
                  <Link className="btn btn-ghost btn-sm" to={orgPublicPath({ type: f.type, slug })}>View public page →</Link>
                )}
                {isAdmin && (
                  <>
                    <button type="button" className="btn btn-dark btn-sm" disabled={actBusy === 'sub'} onClick={() => setSub('grant')}>
                      {actBusy === 'sub' ? 'Working…' : 'Grant +1 year'} <span className="opt">admin</span>
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={actBusy === 'sub'} onClick={() => setSub('revoke')}>
                      Revoke <span className="opt">admin</span>
                    </button>
                  </>
                )}
              </div>
            </section>
          )
        })()}

        {/* Admin-only slug edit (relaxes Brief #2 immutability, admins only). */}
        {editing && isAdmin && (
          <section className="org-activate">
            <h2 className="inv-edit-h">Change slug <span className="opt">platform admin</span></h2>
            <p className="adm-field-hint">
              Current slug: <strong>{slug}</strong>.
              {isActivated
                ? ' ⚠️ This org is already active on a sport — changing the slug changes its public URL on every sport and breaks old links (there’s no central redirect).'
                : ' Safe to change while the org isn’t activated yet.'}
            </p>
            <div className="adm-inline-form">
              <input type="text" value={slugEdit} placeholder={slug}
                onChange={e => setSlugEdit(slugify(e.target.value))} />
              <button type="button" className="btn btn-dark" disabled={slugBusy || !slugEdit}
                onClick={changeSlug}>
                {slugBusy ? 'Changing…' : 'Change slug'}
              </button>
            </div>
          </section>
        )}

        {/* Delete — owner or platform admin. Frees the slug reservation. */}
        {canDelete && (
          <section className="org-danger">
            <h2 className="inv-edit-h">Delete organisation</h2>
            <p className="adm-field-hint">
              {isActivated
                ? 'Active on a sport — deactivate each active sport above first (matches are always kept), then this unlocks.'
                : 'Deletes this organisation’s profile and frees its slug for reuse. Matches it has played stay on the sport sites as historical records. This cannot be undone.'}
            </p>
            <button type="button" className="btn btn-danger" disabled={delBusy || isActivated} onClick={remove}>
              {delBusy ? 'Deleting…' : 'Delete organisation'}
            </button>
          </section>
        )}

        <div className="acct-signout"><Link className="btn btn-ghost" to="/organisations">Back to organisations</Link></div>
      </div>
    </main>
  )
}
