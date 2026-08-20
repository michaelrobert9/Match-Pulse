import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listPublicOrganizations, orgPublicPath } from '../lib/orgProfile'

const TYPE_LABEL = { school: 'Schools', club: 'Clubs', association: 'Associations', league: 'Leagues' }
const TYPE_ORDER = ['school', 'club', 'association', 'league']

function OrgCard({ o }) {
  const initial = (o.matchName || o.name || '?').slice(0, 1)
  const hue = o.primaryColor || '#059669'
  const sports = Object.keys(o.activatedSports || {})
  return (
    <Link className="dir-card" to={orgPublicPath(o)} style={{ '--hue': hue }}>
      <div className="dir-logo">
        {o.logoUrl ? <img src={o.logoUrl} alt="" /> : <span>{initial}</span>}
      </div>
      <div className="dir-card-id">
        <h3>{o.name}</h3>
        <p className="dir-card-meta">
          {o.type && <span className="dir-typechip">{o.type}</span>}
          {o.region && <span>{o.region}</span>}
        </p>
        {sports.length > 0 && <p className="dir-card-sports">{sports.length} sport{sports.length === 1 ? '' : 's'}</p>}
      </div>
    </Link>
  )
}

export default function OrgDirectory() {
  const [orgs,   setOrgs]   = useState(null)
  const [err,    setErr]    = useState('')
  const [typeF,  setTypeF]  = useState('')   // '' = all types

  useEffect(() => {
    let cancel = false
    listPublicOrganizations()
      .then(list => { if (!cancel) setOrgs(list) })
      .catch(e => { if (!cancel) setErr(e.message || 'Could not load organisations.') })
    return () => { cancel = true }
  }, [])

  const counts = useMemo(() => {
    const c = {}
    for (const o of orgs || []) c[o.type] = (c[o.type] || 0) + 1
    return c
  }, [orgs])

  const filtered = useMemo(() => {
    if (!orgs) return []
    return typeF ? orgs.filter(o => o.type === typeF) : orgs
  }, [orgs, typeF])

  const presentTypes = TYPE_ORDER.filter(t => counts[t])

  return (
    <main className="dir">
      <div className="wrap">
        <header className="dir-head">
          <p className="label">Schools, clubs &amp; competitions</p>
          <h1>Organisations</h1>
          <p className="dir-sub">Every school, club, association and league on MatchPulse. Open one to see its profile and its matches &amp; results across every sport it plays.</p>
        </header>

        <div className="dir-tabs" role="tablist">
          <button role="tab" aria-selected={typeF === ''} className={typeF === '' ? 'active' : ''} onClick={() => setTypeF('')}>
            All{orgs ? ` (${orgs.length})` : ''}
          </button>
          {presentTypes.map(t => (
            <button key={t} role="tab" aria-selected={typeF === t}
              className={typeF === t ? 'active' : ''}
              onClick={() => setTypeF(t)}>
              {TYPE_LABEL[t]}{counts[t] ? ` (${counts[t]})` : ''}
            </button>
          ))}
        </div>

        {err ? (
          <p className="notice notice-err" style={{ marginTop: 24 }}>{err}</p>
        ) : orgs === null ? (
          <p className="adm-loading" style={{ paddingTop: 32 }}>Loading organisations…</p>
        ) : filtered.length === 0 ? (
          <div className="dir-empty">
            <p>No organisations{typeF ? ` of this type` : ''} yet.</p>
          </div>
        ) : (
          <div className="dir-grid">
            {filtered.map(o => <OrgCard key={o.id} o={o} />)}
          </div>
        )}
      </div>
    </main>
  )
}
