import { useEffect, useRef, useState } from 'react'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage, auth } from '../firebase'
import { fetchOrgMedia, registerOrgMedia, removeOrgMedia } from '../lib/mediaLibrary'

const MAX_MB = 5
const overlay = { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
const panel   = { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
const grid    = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 12, padding: 16, overflowY: 'auto' }

export default function MediaLibraryPicker({ orgId, onSelect, onClose }) {
  const [items, setItems] = useState(null)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  async function load() { setItems(await fetchOrgMedia(orgId)) }
  useEffect(() => { load() }, [orgId]) // eslint-disable-line

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (inputRef.current) inputRef.current.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Please choose an image file.'); return }
    if (file.size > MAX_MB * 1024 * 1024) { setError(`Image must be under ${MAX_MB} MB.`); return }
    setBusy(true); setError('')
    try {
      const uid = auth?.currentUser?.uid || 'anon'
      const dest = `org-media/${orgId}/${uid}-${Date.now().toString(36)}`
      const r = storageRef(storage, dest)
      await uploadBytes(r, file, { contentType: file.type })
      const url = await getDownloadURL(r)
      await registerOrgMedia(orgId, { url, name: file.name, path: dest, contentType: file.type, size: file.size })
      await load()
    } catch (err) { setError(err?.message || 'Upload failed.') }
    finally { setBusy(false) }
  }

  async function handleDelete(item) {
    if (!window.confirm(`Remove "${item.name}" from the library? This only removes it from the library, not from anywhere it is already used.`)) return
    try { await removeOrgMedia(orgId, item.id); await load() }
    catch (err) { setError(err?.message || 'Could not remove.') }
  }

  const term = q.trim().toLowerCase()
  const filtered = (items ?? []).filter(it => !term || (it.name || '').toLowerCase().includes(term))

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #eef1f4' }}>
          <strong>Media library</strong>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderBottom: '1px solid #eef1f4' }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search images…" style={{ flex: 1 }} />
          <button type="button" className="btn btn-dark btn-sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? 'Uploading…' : 'Upload'}
          </button>
        </div>
        {error && <p className="form-err" style={{ padding: '8px 16px 0' }}>{error}</p>}
        {items === null ? (
          <p style={{ textAlign: 'center', color: '#94a3b8', padding: '48px 0' }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#94a3b8', padding: '48px 0' }}>
            {items.length === 0 ? 'No images yet. Upload one to start your library.' : 'No images match your search.'}
          </p>
        ) : (
          <div style={grid}>
            {filtered.map(item => (
              <div key={item.id} style={{ position: 'relative' }}>
                <button type="button" onClick={() => { onSelect(item.url); onClose() }}
                  style={{ display: 'block', width: '100%', aspectRatio: '1 / 1', borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', padding: 0 }}>
                  {/* contain, not cover — a square logo shows whole, never cropped */}
                  <img src={item.url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </button>
                <button type="button" onClick={() => handleDelete(item)}
                  title="Remove from library"
                  style={{ position: 'absolute', top: 4, right: 4, border: 'none', background: 'rgba(255,255,255,.9)', borderRadius: 999, width: 24, height: 24, cursor: 'pointer' }}>×</button>
                <p style={{ fontSize: 11, color: '#64748b', margin: '4px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.name}>{item.name}</p>
              </div>
            ))}
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUpload} />
      </div>
    </div>
  )
}
