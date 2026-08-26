import { useEffect, useState } from 'react'
import { createVenue, updateVenue, listVenuesByOrg, listAllVenues } from '../lib/venues'

const empty = () => ({ name: '', description: '', mapQuery: '', line1: '', suburb: '', city: '', province: '', postalCode: '', images: '' })

function descriptivePatch(f) {
  return {
    name: f.name.trim(),
    description: f.description.trim(),
    mapQuery: f.mapQuery.trim(),
    address: { line1: f.line1.trim(), suburb: f.suburb.trim(), city: f.city.trim(), province: f.province.trim(), postalCode: f.postalCode.trim() },
    images: f.images.split('\n').map(s => s.trim()).filter(Boolean),
  }
}

// Venue CRUD. `ownerOrgId` set → org-admin scope (that org's venues, created owned
// by it). `master` → all venues, owner selector, verify/deactivate per row.
export default function VenueManager({ ownerOrgId = null, master = false, orgOptions = [] }) {
  const [rows,    setRows]    = useState(null)
  const [err,     setErr]     = useState('')
  const [msg,     setMsg]     = useState(null)
  const [editing, setEditing] = useState(null)      // null | 'new' | venueId
  const [form,    setForm]    = useState(empty)
  const [ownerSel, setOwnerSel] = useState('')      // master create: owner org (or '')
  const [dupes,   setDupes]   = useState(null)
  const [busy,    setBusy]    = useState('')

  async function load() {
    setErr('')
    try {
      const list = master ? await listAllVenues() : await listVenuesByOrg(ownerOrgId)
      setRows([...list].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })))
    } catch (e) { setErr(e.message || 'Could not load venues.') }
  }
  useEffect(() => { load() }, [ownerOrgId, master])

  const bind = (k) => ({ value: form[k], onChange: e => setForm(f => ({ ...f, [k]: e.target.value })) })
  function openNew()  { setForm(empty()); setOwnerSel(ownerOrgId || ''); setDupes(null); setMsg(null); setEditing('new') }
  function openEdit(v) {
    setForm({ name: v.name || '', description: v.description || '', mapQuery: v.mapQuery || '', line1: v.address?.line1 || '', suburb: v.address?.suburb || '', city: v.address?.city || '', province: v.address?.province || '', postalCode: v.address?.postalCode || '', images: (v.images || []).join('\n') })
    setDupes(null); setMsg(null); setEditing(v.id)
  }

  async function submit(e, confirm = false) {
    e?.preventDefault?.()
    if (!form.name.trim()) { setMsg({ kind: 'err', text: 'A venue name is required.' }); return }
    setBusy('save'); setMsg(null)
    try {
      if (editing === 'new') {
        const payload = { ...descriptivePatch(form) }
        if (master) { if (ownerSel) payload.ownerOrgId = ownerSel }
        else payload.ownerOrgId = ownerOrgId
        if (confirm) payload.confirmDuplicate = true
        const res = await createVenue(payload)
        if (res.needsConfirm) { setDupes(res.candidates); setBusy(''); return }
        setMsg({ kind: 'ok', text: 'Venue created.' }); setEditing(null); await load()
      } else {
        await updateVenue(editing, descriptivePatch(form))
        setMsg({ kind: 'ok', text: 'Venue saved.' }); setEditing(null); await load()
      }
    } catch (e) { setMsg({ kind: 'err', text: e.message || 'Could not save.' }) }
    finally { setBusy('') }
  }

  async function masterSet(v, patch, tag) {
    setBusy(tag + v.id); setMsg(null)
    try { await updateVenue(v.id, patch); await load() }
    catch (e) { setMsg({ kind: 'err', text: e.message || 'Could not update.' }) }
    finally { setBusy('') }
  }

  if (editing) {
    return (
      <div className="venue-form">
        <h4 className="inv-edit-h">{editing === 'new' ? 'Add a venue' : 'Edit venue'}</h4>
        <p className="adm-field-hint">A venue is a <strong>site, not a playing surface</strong> — “Kearsney College”, not “Kearsney Astro 1”. Individual fields come in a later phase.</p>
        {msg && <p className={`notice ${msg.kind === 'ok' ? 'notice-ok' : 'notice-err'}`}>{msg.text}</p>}
        <form className="acct-form" onSubmit={submit}>
          {master && editing === 'new' && (
            <div className="field">
              <label>Owning organisation <span className="opt">blank = neutral / municipal</span></label>
              <select value={ownerSel} onChange={e => setOwnerSel(e.target.value)}>
                <option value="">— none (neutral ground) —</option>
                {orgOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}
          <div className="field"><label>Venue name *</label><input type="text" required placeholder="e.g. Kearsney College" {...bind('name')} /></div>
          <div className="field"><label>Description</label><textarea rows={2} {...bind('description')} /></div>
          <div className="org-colors">
            <div className="field"><label>Street</label><input type="text" {...bind('line1')} /></div>
            <div className="field"><label>Suburb</label><input type="text" {...bind('suburb')} /></div>
          </div>
          <div className="org-colors">
            <div className="field"><label>City / town</label><input type="text" {...bind('city')} /></div>
            <div className="field"><label>Province</label><input type="text" {...bind('province')} /></div>
          </div>
          <div className="org-colors">
            <div className="field"><label>Postal code</label><input type="text" {...bind('postalCode')} /></div>
            <div className="field"><label>Map search text <span className="opt">optional</span></label><input type="text" placeholder="defaults to name + city" {...bind('mapQuery')} /></div>
          </div>
          <div className="field"><label>Image URLs <span className="opt">one per line, optional</span></label><textarea rows={2} placeholder="https://…" {...bind('images')} /></div>

          {dupes && dupes.length > 0 && (
            <div className="dup-warn" role="alert">
              <h3>A venue with this name may already exist here</h3>
              <ul className="dup-list">
                {dupes.map(c => <li key={c.id}><div className="dup-org"><strong>{c.name}</strong><span className="dup-meta">{c.city || 'venue'}</span></div></li>)}
              </ul>
              <div className="dup-cta">
                <button type="button" className="btn btn-dark btn-sm" disabled={busy === 'save'} onClick={(e) => submit(e, true)}>Different venue — create anyway</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDupes(null)}>Cancel</button>
              </div>
            </div>
          )}

          {!dupes && <button className="btn btn-primary btn-sm" disabled={busy === 'save'}>{busy === 'save' ? 'Saving…' : (editing === 'new' ? 'Create venue' : 'Save venue')}</button>}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)} style={{ marginLeft: 8 }}>Back</button>
        </form>
      </div>
    )
  }

  return (
    <div>
      {err && <p className="notice notice-err">{err}</p>}
      {msg && <p className={`notice ${msg.kind === 'ok' ? 'notice-ok' : 'notice-err'}`}>{msg.text}</p>}
      <div className="adm-toolbar" style={{ marginBottom: 12 }}>
        <span className="adm-count">{rows ? `${rows.length} venue${rows.length === 1 ? '' : 's'}` : ''}</span>
        <button type="button" className="btn btn-primary btn-sm" onClick={openNew}>Add venue</button>
      </div>
      {!rows ? <p className="adm-loading">Loading…</p> : rows.length === 0 ? (
        <p className="muted">No venues yet.</p>
      ) : (
        <ul className="venue-list">
          {rows.map(v => (
            <li key={v.id} className={v.active === false ? 'venue-inactive' : ''}>
              <div className="venue-li-id">
                <strong>{v.name}</strong>
                <span className="venue-li-meta">
                  {v.address?.city || '—'}
                  {v.verified && <span className="venue-tag venue-tag-ok">verified</span>}
                  {v.active === false && <span className="venue-tag">{v.mergedInto ? 'merged' : 'inactive'}</span>}
                  {master && <span className="venue-tag">{v.ownerOrgId ? 'org' : 'neutral'}</span>}
                </span>
              </div>
              <div className="venue-li-actions">
                <a className="btn btn-ghost btn-sm" href={`/venues/${v.slug}`} target="_blank" rel="noreferrer">View</a>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(v)}>Edit</button>
                {master && (
                  <>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy === 'ver' + v.id} onClick={() => masterSet(v, { verified: !v.verified }, 'ver')}>{v.verified ? 'Unverify' : 'Verify'}</button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy === 'act' + v.id} onClick={() => masterSet(v, { active: !(v.active !== false) }, 'act')}>{v.active === false ? 'Reactivate' : 'Deactivate'}</button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
