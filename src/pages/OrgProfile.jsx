import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getOrgProfile, PREFIX_TYPE, orgPublicPathFrom } from '../lib/orgProfile'
import { sportByKey } from '../lib/sports'

function fmtDate(ms) {
  if (!ms) return ''
  return new Date(ms).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
}

function MatchRow({ m, result }) {
  const inner = (
    <>
      <span className="opm-date">{fmtDate(m.matchDate)}</span>
      <span className="opm-teams">
        <span className="opm-home">{m.homeDisplay || 'Home'}</span>
        {result
          ? <span className="opm-score tnum">{m.homeScore ?? '–'} : {m.awayScore ?? '–'}</span>
          : <span className="opm-v">v</span>}
        <span className="opm-away">{m.awayDisplay || 'Away'}</span>
      </span>
      {m.venue && <span className="opm-venue">{m.venue}</span>}
      {m.url && <span className="opm-go" aria-hidden="true">→</span>}
    </>
  )
  return m.url
    ? <a className="opm-row" href={m.url} target="_blank" rel="noreferrer">{inner}</a>
    : <div className="opm-row">{inner}</div>
}

export default function OrgProfile({ prefix }) {
  const { slug } = useParams()
  const { user, profile } = useAuth()
  const isAdmin = profile?.platformAdmin === true
  const navigate = useNavigate()

  const [data, setData] = useState(null)
  const [err,  setErr]  = useState('')
  const [tab,  setTab]  = useState(null)

  useEffect(() => {
    let cancel = false
    setData(null); setErr('')
    ;(async () => {
      try {
        const res = await getOrgProfile(slug)
        if (cancel) return
        setData(res)
        setTab(res.activatedSports?.[0] || null)
        if (res.org?.name) document.title = `${res.org.name} — MatchPulse`
      } catch (e) {
        if (!cancel) setErr(e.message || 'Organisation not found.')
      }
    })()
    return () => { cancel = true }
  }, [slug])

  if (err) {
    return (
      <main className="acct"><div className="wrap">
        <p className="notice notice-err" style={{ marginTop: 40 }}>{err}</p>
        <p><Link to="/">Back to MatchPulse</Link></p>
      </div></main>
    )
  }
  if (!data) return <main className="acct"><div className="wrap"><p className="adm-loading" style={{ paddingTop: 60 }}>Loading…</p></div></main>

  const org = data.org
  // Enforce the type↔prefix contract: if the slug resolves to a different type,
  // redirect to its correct prefixed URL (keeps one canonical address).
  const wantType = PREFIX_TYPE[prefix]
  if (wantType && org.type && org.type !== wantType) {
    return <Navigate to={orgPublicPathFrom(org.type, org.slug)} replace />
  }

  const pc = org.primaryColor || '#059669'
  const websiteHref  = org.website ? (/^https?:\/\//.test(org.website) ? org.website : `https://${org.website}`) : null
  const websiteLabel = org.website ? org.website.replace(/^https?:\/\//, '') : ''

  return (
    <main className="orgprofile">
      <div className="wrap">
        {/* Identity card — matches the sport-site design. Always free / SEO. */}
        <article className="op-card" style={{ '--pc': pc }}>
          {org.bannerUrl && (
            <div className="op-banner">
              <img src={org.bannerUrl} alt="" />
              <span className="op-banner-strip" aria-hidden="true" />
            </div>
          )}
          <div className="op-card-body">
            <div className="op-logo">
              {org.logoUrl ? <img src={org.logoUrl} alt="" /> : <span>{(org.matchName || org.name || '?').slice(0,1)}</span>}
            </div>
            <div className="op-id">
              {org.type && <span className="op-badge">{org.type}</span>}
              <h1>{org.name}</h1>
              {org.region && <p className="op-region">{org.region}</p>}
              {org.bio && <p className="op-bio">{org.bio}</p>}
              {websiteHref && (
                <a className="op-website" href={websiteHref} target="_blank" rel="noreferrer">
                  {websiteLabel} <span aria-hidden="true">↗</span>
                </a>
              )}
            </div>
          </div>
        </article>

        <div className="op-body">
        {data.locked ? (
          <section className="op-upsell">
            <h2>See {org.name}’s fixtures &amp; results across all sports</h2>
            <p>
              This organisation plays{data.activatedSports?.length ? ' ' + data.activatedSports.map(k => sportByKey(k)?.name || k).join(', ') : ''} on MatchPulse.
              Subscribe to see every upcoming fixture and final result for {org.name}, gathered from every sport, in one place.
            </p>
            <div className="op-upsell-cta">
              <Link className="btn btn-primary" to={`/subscribe/${org.id}`}>Subscribe — cross-sport profile</Link>
              {!user && <Link className="btn btn-ghost" to="/login">Sign in</Link>}
            </div>
            <p className="op-upsell-fine">Annual subscription, billed by EFT invoice. The identity above is always free.</p>
          </section>
        ) : (
          <section className="op-matches">
            {data.activatedSports.length === 0 ? (
              <p className="muted">No sports activated for this organisation yet.</p>
            ) : (
              <>
                <div className="op-tabs" role="tablist">
                  {data.activatedSports.map(k => (
                    <button key={k} role="tab" aria-selected={tab === k}
                      className={tab === k ? 'active' : ''}
                      style={{ '--hue': sportByKey(k)?.hue }}
                      onClick={() => setTab(k)}>
                      {sportByKey(k)?.name || k}
                    </button>
                  ))}
                </div>
                {tab && data.matches?.[tab] && (
                  <div className="op-lists">
                    <div className="op-col">
                      <h3>Upcoming fixtures</h3>
                      {data.matches[tab].fixtures.length === 0
                        ? <p className="muted">No upcoming fixtures.</p>
                        : data.matches[tab].fixtures.map(m => <MatchRow key={m.id} m={m} />)}
                    </div>
                    <div className="op-col">
                      <h3>Results</h3>
                      {data.matches[tab].results.length === 0
                        ? <p className="muted">No results yet.</p>
                        : data.matches[tab].results.map(m => <MatchRow key={m.id} m={m} result />)}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}
        </div>
      </div>
    </main>
  )
}
