import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getTournaments } from '../lib/tournaments'
import { SPORTS, sportByKey } from '../lib/sports'

function fmtRange(start, end) {
  if (!start && !end) return ''
  const opt = { day: 'numeric', month: 'short', year: 'numeric' }
  const s = start ? new Date(start).toLocaleDateString('en-ZA', opt) : null
  const e = end   ? new Date(end).toLocaleDateString('en-ZA', opt)   : null
  if (s && e) return s === e ? s : `${s} – ${e}`
  return s || e
}

const STATUS_LABEL = { upcoming: 'Upcoming', live: 'Live', completed: 'Completed' }

function TournamentCard({ t }) {
  const sport = sportByKey(t.sport)
  const hue = sport?.hue || '#059669'
  const initial = (t.name || '?').slice(0, 1)
  const meta = [sport?.name, t.season, t.gender, t.ageGroup, t.type].filter(Boolean)
  return (
    <a className="trn-card" href={t.url} target="_blank" rel="noreferrer" style={{ '--hue': hue }}>
      <div className="trn-banner">
        {t.bannerUrl
          ? <img src={t.bannerUrl} alt="" />
          : <div className="trn-banner-fallback" />}
        {t.status && <span className={`trn-status trn-status-${t.status}`}>{STATUS_LABEL[t.status] || t.status}</span>}
        <span className="trn-sportchip">{sport?.name || t.sport}</span>
        <div className="trn-logo">
          {t.logoUrl ? <img src={t.logoUrl} alt="" /> : <span>{initial}</span>}
        </div>
      </div>
      <div className="trn-body">
        <h3>{t.name}</h3>
        <p className="trn-meta">{meta.join(' · ')}</p>
        {(t.startDate || t.endDate) && <p className="trn-dates">{fmtRange(t.startDate, t.endDate)}</p>}
      </div>
    </a>
  )
}

// Empty result → present the sport as newly launched, never a bare empty list.
function NewSportState({ sportKey }) {
  const sport = sportKey ? sportByKey(sportKey) : null
  const name = sport?.name || 'MatchPulse'
  return (
    <div className="dir-empty trn-newstate" style={sport ? { '--hue': sport.hue } : undefined}>
      {sport ? (
        <>
          <h2><strong>{name}</strong> is new on MatchPulse.</h2>
          <p className="muted">Competitions will appear here as schools come on board. Running one?</p>
        </>
      ) : (
        <>
          <h2>Competitions are coming to MatchPulse.</h2>
          <p className="muted">Published competitions from every sport will appear here. Running one?</p>
        </>
      )}
      <Link className="btn btn-primary" to="/signup">Start free and be first</Link>
    </div>
  )
}

export default function Tournaments() {
  const [all,     setAll]     = useState(null)
  const [err,     setErr]     = useState('')
  const [sportF,  setSportF]  = useState('')   // '' = all sports

  useEffect(() => {
    let cancel = false
    getTournaments()
      .then(list => { if (!cancel) setAll(list) })
      .catch(e => { if (!cancel) setErr(e.message || 'Could not load tournaments.') })
    return () => { cancel = true }
  }, [])

  const filtered = useMemo(() => {
    if (!all) return []
    const list = sportF ? all.filter(t => t.sport === sportF) : all
    // Live first, then upcoming, then completed; within each, soonest first.
    const rank = { live: 0, upcoming: 1, completed: 2 }
    return [...list].sort((a, b) => {
      const r = (rank[a.status] ?? 3) - (rank[b.status] ?? 3)
      if (r) return r
      return (a.startDate ?? Infinity) - (b.startDate ?? Infinity)
    })
  }, [all, sportF])

  const counts = useMemo(() => {
    const c = {}
    for (const t of all || []) c[t.sport] = (c[t.sport] || 0) + 1
    return c
  }, [all])

  return (
    <main className="dir">
      <div className="wrap">
        <header className="dir-head">
          <p className="label">Across every sport</p>
          <h1>Tournaments &amp; competitions</h1>
          <p className="dir-sub">Every published competition on MatchPulse, from every sport. Open any one to see its full standings, matches and results on its sport site.</p>
        </header>

        <div className="dir-tabs" role="tablist">
          <button role="tab" aria-selected={sportF === ''} className={sportF === '' ? 'active' : ''} onClick={() => setSportF('')}>
            All sports{all ? ` (${all.length})` : ''}
          </button>
          {SPORTS.map(s => {
            // Once loaded, a sport with no competitions is new, not missing —
            // keep it visible with a "New" tag so visitors know it exists.
            const isNew = all !== null && !counts[s.key]
            return (
              <button key={s.key} role="tab" aria-selected={sportF === s.key}
                className={sportF === s.key ? 'active' : ''}
                style={{ '--hue': s.hue }}
                onClick={() => setSportF(s.key)}>
                {s.name}{counts[s.key] ? ` (${counts[s.key]})` : ''}
                {isNew && <span className="trn-newtag">New</span>}
              </button>
            )
          })}
        </div>

        {err ? (
          <p className="notice notice-err" style={{ marginTop: 24 }}>{err}</p>
        ) : all === null ? (
          <div className="trn-grid" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="trn-card trn-skeleton">
                <div className="trn-banner sk-block" />
                <div className="trn-body">
                  <div className="sk-line sk-line-lg" />
                  <div className="sk-line sk-line-md" />
                  <div className="sk-line sk-line-sm" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <NewSportState sportKey={sportF} />
        ) : (
          <div className="trn-grid">
            {filtered.map(t => <TournamentCard key={`${t.sport}:${t.id}`} t={t} />)}
          </div>
        )}
      </div>
    </main>
  )
}
