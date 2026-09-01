import { useEffect, useState } from 'react'
import { createVenue, updateVenue, listAllVenues } from '../lib/venues'
import { SPORTS } from '../lib/sports'

// Facilities are sport-scoped spaces inside a venue. displayNoun is a fixed
// vocabulary; sports[] is multi-select and must be canonical SPORT keys (the
// callable rejects anything else).
export const FACILITY_NOUNS = ['Field', 'Court', 'Astro', 'Pool', 'Hall', 'Gym', 'Other']

const emptyForm = () => ({ name: '', mapsUrl: '', town: '', description: '', images: '', facilities: [] })

function fromVenue(v) {
  return {
    name: v.name || '', mapsUrl: v.mapsUrl || '', town: v.town || '',
    description: v.description || '', images: (v.images || []).join('\n'),
    facilities: (v.facilities || []).map(f => ({
      id: f.id, name: f.name || '', displayNoun: f.displayNoun || 'Other',
      sports: Array.isArray(f.sports) ? f.sports : [], active: f.active !== false,
    })),
  }
}

function toPayload(f) {
  return {
    name: f.name.trim(),
    mapsUrl: f.mapsUrl.trim(),
    town: f.town.trim(),
    description: f.description.trim(),
    images: f.images.split('\n').map(s => s.trim()).filter(Boolean),
    facilities: f.facilities.map((x, i) => ({
      id: x.id || undefined, name: x.name.trim(), displayNoun: x.displayNoun,
      sports: x.sports, order: i, active: x.active !== false,
    })),
  }
}

// ── Facilities editor ────────────────────────────────────────────────────────
function FacilitiesEditor({ value, onChange }) {
  const set = (i, patch) => onChange(value.map((f, j) => j === i ? { ...f, ...patch } : f))
  const add = () => onChange([...value, { name: '', displayNoun: 'Field', sports: [], active: true }])
  const remove = (i) => onChange(value.filter((_, j) => j !== i))
  const toggleSport = (i, key) => {
    const cur = value[i].sports
    set(i, { sports: cur.includes(key) ? cur.filter(s => s !== key) : [...cur, key] })
  }
  return (
    <div className="fac-editor">
      <div className="fac-editor-head">
        <label>Facilities <span className="opt">the spaces within this venue — a field, a court, a pool</span></label>
        <button type="button" className="btn btn-ghost btn-sm" onClick={add}>Add facility</button>
      </div>
      {value.length === 0 && <p className="muted" style={{ margin: '4px 0 0' }}>No facilities added.</p>}
      {value.map((f, i) => (
        <div key={i} className="fac-row">
          <div className="fac-row-top">
            <input type="text" placeholder="e.g. Main Field" value={f.name} onChange={e => set(i, { name: e.target.value })} />
            <select value={f.displayNoun} onChange={e => set(i, { displayNoun: e.target.value })}>
              {FACILITY_NOUNS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <label className="fac-active"><input type="checkbox" checked={f.active} onChange={e => set(i, { active: e.target.checked })} /> Active</label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(i)}>Remove</button>
          </div>
          <div className="fac-sports">
            <span className="fac-sports-lbl">Sports *</span>
            {SPORTS.map(s => (
              <label key={s.key} className={'fac-chip' + (f.sports.includes(s.key) ? ' on' : '')}>
                <input type="checkbox" checked={f.sports.includes(s.key)} onChange={() => toggleSport(i, s.key)} />
                {s.name}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Venue form (create or edit) ──────────────────────────────────────────────
// `initial` with an id → edit that venue; otherwise create. `actingOrgId` is the
// org the creator acts as (sets createdByOrgId + unverified edit rights); null in
// master mode. Calls onDone(result) on success.
export function VenueForm({ initial = null, master = false, actingOrgId = null, onDone, onCancel }) {
  const editingId = initial?.id || null
  const [form, setForm] = useState(() => initial ? fromVenue(initial) : emptyForm())
  const [msg,  setMsg]  = useState(null)
  const [dupes, setDupes] = useState(null)
  const [busy, setBusy] = useState(false)
  const bind = (k) => ({ value: form[k], onChange: e => setForm(f => ({ ...f, [k]: e.target.value })) })

  function validate() {
    if (!form.name.trim())    return 'A venue name is required.'
    if (!form.mapsUrl.trim()) return 'A Google Maps link is required.'
    for (const f of form.facilities) {
      if (!f.name.trim())   return 'Every facility needs a name.'
      if (!f.sports.length) return `Facility "${f.name || 'unnamed'}" needs at least one sport.`
    }
    return null
  }

  async function submit(e, confirm = false) {
    e?.preventDefault?.()
    const problem = validate()
    if (problem) { setMsg({ kind: 'err', text: problem }); return }
    setBusy(true); setMsg(null)
    try {
      const payload = toPayload(form)
      if (editingId) {
        await updateVenue(editingId, payload)
        onDone?.({ ok: true, id: editingId })
      } else {
        if (!master) payload.createdByOrgId = actingOrgId
        if (confirm) payload.confirmDuplicate = true
        const res = await createVenue(payload)
        if (res.needsConfirm) { setDupes(res.candidates); setBusy(false); return }
        onDone?.(res)
      }
    } catch (e) { setMsg({ kind: 'err', text: e.message || 'Could not save.' }) }
    finally { setBusy(false) }
  }

  return (
    <div className="venue-form">
      <h4 className="inv-edit-h">{editingId ? 'Edit venue' : 'Add a venue'}</h4>
      <p className="adm-field-hint">A venue is a <strong>site</strong> — “Kearsney College”, not “Kearsney Astro 1”. Add the individual spaces as facilities below.</p>
      {msg && <p className={`notice ${msg.kind === 'ok' ? 'notice-ok' : 'notice-err'}`}>{msg.text}</p>}
      <form className="acct-form" onSubmit={submit}>
        <div className="field"><label>Venue name *</label><input type="text" required placeholder="e.g. Kearsney College" {...bind('name')} /></div>
        <div className="field">
          <label>Google Maps link *</label>
          <input type="url" required placeholder="https://maps.app.goo.gl/…" {...bind('mapsUrl')} />
          <p className="adm-field-hint">Paste the share link from Google Maps. We pull the pin location from it automatically.</p>
        </div>
        <div className="field"><label>Town or area <span className="opt">optional</span></label><input type="text" placeholder="e.g. Botha’s Hill" {...bind('town')} /></div>
        <div className="field"><label>Description <span className="opt">optional</span></label><textarea rows={2} {...bind('description')} /></div>
        <div className="field"><label>Image URLs <span className="opt">one per line, optional</span></label><textarea rows={2} placeholder="https://…" {...bind('images')} /></div>

        <FacilitiesEditor value={form.facilities} onChange={(facilities) => setForm(f => ({ ...f, facilities }))} />

        {dupes && dupes.length > 0 && (
          <div className="dup-warn" role="alert">
            <h3>A venue with this name may already exist here</h3>
            <ul className="dup-list">
              {dupes.map(c => <li key={c.id}><div className="dup-org"><strong>{c.name}</strong><span className="dup-meta">{c.town || 'venue'}</span></div></li>)}
            </ul>
            <div className="dup-cta">
              <button type="button" className="btn btn-dark btn-sm" disabled={busy} onClick={(e) => submit(e, true)}>Different venue — create anyway</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDupes(null)}>Cancel</button>
            </div>
          </div>
        )}

        {!dupes && <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saving…' : (editingId ? 'Save venue' : 'Create venue')}</button>}
        {onCancel && <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} style={{ marginLeft: 8 }}>Back</button>}
      </form>
    </div>
  )
}

// ── Master venue manager (Admin → Venues) ────────────────────────────────────
// Full list of every venue with create/edit, verify and deactivate. Venues are
// unowned, so there is no owner column.
export default function VenueManager() {
  const [rows,    setRows]    = useState(null)
  const [err,     setErr]     = useState('')
  const [msg,     setMsg]     = useState(null)
  const [editing, setEditing] = useState(null)   // null | 'new' | venue object
  const [busy,    setBusy]    = useState('')

  async function load() {
    setErr('')
    try {
      const list = await listAllVenues()
      setRows([...list].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })))
    } catch (e) { setErr(e.message || 'Could not load venues.') }
  }
  useEffect(() => { load() }, [])

  async function masterSet(v, patch, tag) {
    setBusy(tag + v.id); setMsg(null)
    try { await updateVenue(v.id, patch); await load() }
    catch (e) { setMsg({ kind: 'err', text: e.message || 'Could not update.' }) }
    finally { setBusy('') }
  }

  if (editing) {
    return (
      <VenueForm
        master
        initial={editing === 'new' ? null : editing}
        onDone={() => { setMsg({ kind: 'ok', text: 'Saved.' }); setEditing(null); load() }}
        onCancel={() => setEditing(null)}
      />
    )
  }

  return (
    <div>
      {err && <p className="notice notice-err">{err}</p>}
      {msg && <p className={`notice ${msg.kind === 'ok' ? 'notice-ok' : 'notice-err'}`}>{msg.text}</p>}
      <div className="adm-toolbar" style={{ marginBottom: 12 }}>
        <span className="adm-count">{rows ? `${rows.length} venue${rows.length === 1 ? '' : 's'}` : ''}</span>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>Add venue</button>
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
                  {v.town || v.address?.city || '—'}
                  {v.verified && <span className="venue-tag venue-tag-ok">verified</span>}
                  {v.active === false && <span className="venue-tag">{v.mergedInto ? 'merged' : 'inactive'}</span>}
                  {(v.facilities?.length > 0) && <span className="venue-tag">{v.facilities.length} facilit{v.facilities.length === 1 ? 'y' : 'ies'}</span>}
                </span>
              </div>
              <div className="venue-li-actions">
                <a className="btn btn-ghost btn-sm" href={`/venues/${v.slug}`} target="_blank" rel="noreferrer">View</a>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(v)}>Edit</button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy === 'ver' + v.id} onClick={() => masterSet(v, { verified: !v.verified }, 'ver')}>{v.verified ? 'Unverify' : 'Verify'}</button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy === 'act' + v.id} onClick={() => masterSet(v, { active: !(v.active !== false) }, 'act')}>{v.active === false ? 'Reactivate' : 'Deactivate'}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
