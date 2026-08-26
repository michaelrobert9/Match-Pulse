import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getOrgProfile, PREFIX_TYPE, orgPublicPathFrom } from '../lib/orgProfile'
import { sportByKey } from '../lib/sports'
import { listVenuesByOrg, venueEmbedUrl, venueDirectionsUrl, formatVenueAddress } from '../lib/venues'

// School-level filter: U13 and lower is primary school, U14 and up is high
// school. Matches carry a derived `level` ('primary' | 'high' | null) from the
// backend; null (no age signal) shows only under "All".
const LEVELS = [
  { key: 'all',     label: 'All' },
  { key: 'high',    label: 'High school' },
  { key: 'primary', label: 'Primary school' },
]
const byLevel = (list, lvl) => (lvl === 'all' ? list : (list || []).filter(m => m.level === lvl))

function fmtDate(ms) {
  if (!ms) return ''
  return new Date(ms).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Brand glyphs for the social links (single-path, 24×24, currentColor).
const SOCIAL_ICONS = {
  facebook:  'M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.4h-1.2c-1.2 0-1.6.8-1.6 1.5V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z',
  instagram: 'M12 2c2.7 0 3 0 4.1.1 1 0 1.7.2 2.3.4.6.2 1.1.6 1.6 1s.8 1 1 1.6c.2.6.4 1.3.4 2.3.1 1.1.1 1.4.1 4.1s0 3-.1 4.1c0 1-.2 1.7-.4 2.3-.2.6-.6 1.1-1 1.6s-1 .8-1.6 1c-.6.2-1.3.4-2.3.4-1.1.1-1.4.1-4.1.1s-3 0-4.1-.1c-1 0-1.7-.2-2.3-.4-.6-.2-1.1-.6-1.6-1s-.8-1-1-1.6c-.2-.6-.4-1.3-.4-2.3C2 15 2 14.7 2 12s0-3 .1-4.1c0-1 .2-1.7.4-2.3.2-.6.6-1.1 1-1.6s1-.8 1.6-1c.6-.2 1.3-.4 2.3-.4C9 2 9.3 2 12 2zm0 1.8c-2.7 0-3 0-4 .1-.8 0-1.2.2-1.5.3-.4.1-.6.3-.9.6-.3.3-.5.5-.6.9-.1.3-.3.7-.3 1.5-.1 1-.1 1.3-.1 4s0 3 .1 4c0 .8.2 1.2.3 1.5.1.4.3.6.6.9.3.3.5.5.9.6.3.1.7.3 1.5.3 1 .1 1.3.1 4 .1s3 0 4-.1c.8 0 1.2-.2 1.5-.3.4-.1.6-.3.9-.6.3-.3.5-.5.6-.9.1-.3.3-.7.3-1.5.1-1 .1-1.3.1-4s0-3-.1-4c0-.8-.2-1.2-.3-1.5-.1-.4-.3-.6-.6-.9-.3-.3-.5-.5-.9-.6-.3-.1-.7-.3-1.5-.3-1-.1-1.3-.1-4-.1zm0 3.1a5.1 5.1 0 1 1 0 10.2 5.1 5.1 0 0 1 0-10.2zm0 1.8a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6zm5.3-3.2a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z',
  x:         'M18.9 2H22l-7.5 8.6L23 22h-6.9l-5.4-7-6.2 7H1.4l8-9.2L1 2h7.1l4.9 6.5L18.9 2zm-2.4 18h1.9L7.6 3.9H5.6L16.5 20z',
  youtube:   'M23 12s0-3.2-.4-4.7a2.5 2.5 0 0 0-1.8-1.8C19 5 12 5 12 5s-7 0-8.8.5A2.5 2.5 0 0 0 1.4 7.3 26 26 0 0 0 1 12a26 26 0 0 0 .4 4.7 2.5 2.5 0 0 0 1.8 1.8C5 19 12 19 12 19s7 0 8.8-.5a2.5 2.5 0 0 0 1.8-1.8c.4-1.5.4-4.7.4-4.7zM10 15V9l5 3-5 3z',
}
const SOCIAL_LABEL = { facebook: 'Facebook', instagram: 'Instagram', x: 'X', youtube: 'YouTube' }

function SocialLinks({ links }) {
  const entries = Object.entries(links || {}).filter(([k, v]) => v && SOCIAL_ICONS[k])
  if (entries.length === 0) return null
  return (
    <div className="op-socials">
      {entries.map(([k, url]) => (
        <a key={k} className="op-social" href={url} target="_blank" rel="noreferrer" aria-label={SOCIAL_LABEL[k] || k} title={SOCIAL_LABEL[k] || k}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d={SOCIAL_ICONS[k]} /></svg>
        </a>
      ))}
    </div>
  )
}

function Crest({ url, name, color }) {
  return url
    ? <img className="opm-crest" src={url} alt="" loading="lazy" />
    : <span className="opm-crest opm-crest-mono" style={{ '--c': color || '#059669' }}>{(name || '?').slice(0, 1)}</span>
}

// One team line: crest + name, with its own score on the right for results.
function Side({ logo, name, color, score, showScore, win }) {
  return (
    <div className="opm-side">
      <Crest url={logo} name={name} color={color} />
      <span className="opm-name">{name || '—'}</span>
      {showScore && <span className={'opm-sscore tnum' + (win ? ' win' : '')}>{score ?? '–'}</span>}
    </div>
  )
}

// Teams stack (home over away) so long names never truncate side-by-side —
// reads the same on a phone and on the desktop two-column layout.
function MatchRow({ m, result }) {
  const hs = m.homeScore, as = m.awayScore
  const scored = result && typeof hs === 'number' && typeof as === 'number'
  const inner = (
    <>
      <span className="opm-date">{fmtDate(m.matchDate)}</span>
      <div className="opm-teams">
        <Side logo={m.homeLogoUrl} name={m.homeDisplay || 'Home'} color={m.homeColor} score={hs} showScore={result} win={scored && hs > as} />
        <Side logo={m.awayLogoUrl} name={m.awayDisplay || 'Away'} color={m.awayColor} score={as} showScore={result} win={scored && as > hs} />
      </div>
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
  const [levelF, setLevelF] = useState('all')   // 'all' | 'high' | 'primary'
  const [venues, setVenues] = useState([])

  useEffect(() => {
    let cancel = false
    setData(null); setErr(''); setVenues([])
    ;(async () => {
      try {
        const res = await getOrgProfile(slug)
        if (cancel) return
        setData(res)
        setTab(res.activatedSports?.[0] || null)
        if (res.org?.name) document.title = `${res.org.name} — MatchPulse`
        if (res.org?.id) { const vs = await listVenuesByOrg(res.org.id).catch(() => []); if (!cancel) setVenues(vs) }
      } catch (e) {
        if (!cancel) setErr(e.message || 'Organisation not found.')
      }
    })()
    return () => { cancel = true }
  }, [slug])

  // A school/club without Home Ground active holds its URL but must not be
  // indexed. Toggle a noindex robots tag off the resolved state.
  useEffect(() => {
    if (!data) return
    const noindex = data.active === false
    let el = document.head.querySelector('meta[name="robots"][data-op]')
    if (noindex) {
      if (!el) { el = document.createElement('meta'); el.setAttribute('name', 'robots'); el.setAttribute('data-op', '1'); document.head.appendChild(el) }
      el.setAttribute('content', 'noindex, nofollow')
    } else if (el) { el.remove() }
    return () => { const e = document.head.querySelector('meta[name="robots"][data-op]'); if (e) e.remove() }
  }, [data])

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

  // Holding state — Home Ground is not active. The URL resolves but publishes
  // nothing; the owner (or an admin) is offered activation, everyone else sees
  // a neutral placeholder. Rendered noindex (effect above).
  const isOwner = user && org.ownerUserId && org.ownerUserId === user.uid
  if (data.active === false) {
    const canManage = isAdmin || isOwner
    return (
      <main className="acct"><div className="wrap op-holding-wrap">
        <div className="op-holding">
          <h1>{canManage ? org.name : 'Page not available'}</h1>
          {canManage ? (
            <>
              <p>Home Ground isn’t active for {org.name}. Activate it to publish this page: matches, results and Match Days from every sport, under your own name and colours.</p>
              <Link className="btn btn-primary" to={`/subscribe/${org.id}`}>Activate Home Ground</Link>
            </>
          ) : (
            <p>This page isn’t published yet.</p>
          )}
          <p className="op-holding-back"><Link to="/">Back to MatchPulse</Link></p>
        </div>
      </div></main>
    )
  }

  const pc = org.primaryColor || '#059669'
  const websiteHref  = org.website ? (/^https?:\/\//.test(org.website) ? org.website : `https://${org.website}`) : null
  const websiteLabel = org.website ? org.website.replace(/^https?:\/\//, '') : ''

  return (
    <main className="orgprofile">
      <div className="wrap">
        {/* Identity card — matches the sport-site design. Published only while
            Home Ground is active (this whole page is the Home Ground page). */}
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
              <SocialLinks links={org.socialLinks} />
            </div>
          </div>
        </article>

        <div className="op-body">
        {venues.length > 0 && (
          <section className="op-venues">
            <h2>Venues</h2>
            {venueEmbedUrl(venues[0]) && (
              <div className="op-venue-map"><iframe title={`Map of ${venues[0].name}`} src={venueEmbedUrl(venues[0])} loading="lazy" allowFullScreen referrerPolicy="no-referrer-when-downgrade" /></div>
            )}
            <ul className="op-venue-list">
              {venues.map(v => (
                <li key={v.id}>
                  <div className="op-venue-id">
                    <Link to={`/venues/${v.slug}`}>{v.name}</Link>
                    {formatVenueAddress(v.address) && <span className="op-venue-addr">{formatVenueAddress(v.address)}</span>}
                  </div>
                  <a className="btn btn-ghost btn-sm" href={venueDirectionsUrl(v)} target="_blank" rel="noreferrer">Directions →</a>
                </li>
              ))}
            </ul>
          </section>
        )}
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
                      onClick={() => { setTab(k); setLevelF('all') }}>
                      {sportByKey(k)?.name || k}
                    </button>
                  ))}
                </div>
                {tab && data.matches?.[tab] && (() => {
                  const all = [...(data.matches[tab].fixtures || []), ...(data.matches[tab].results || [])]
                  // Only offer the primary/high split when the school actually
                  // has both — a single-phase school stays clean with no filter.
                  const hasPrimary = all.some(m => m.level === 'primary')
                  const hasHigh    = all.some(m => m.level === 'high')
                  const showFilter = hasPrimary && hasHigh
                  const active     = showFilter ? levelF : 'all'
                  const fixtures = byLevel(data.matches[tab].fixtures, active)
                  const results  = byLevel(data.matches[tab].results, active)
                  return (
                    <>
                      {showFilter && (
                        <div className="op-levels" role="tablist" aria-label="School phase">
                          {LEVELS.map(l => (
                            <button key={l.key} role="tab" aria-selected={active === l.key}
                              className={active === l.key ? 'active' : ''}
                              onClick={() => setLevelF(l.key)}>
                              {l.label}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="op-lists">
                        <div className="op-col">
                          <h3>Upcoming matches</h3>
                          {fixtures.length === 0
                            ? <p className="muted">No upcoming matches.</p>
                            : fixtures.map(m => <MatchRow key={m.id} m={m} />)}
                        </div>
                        <div className="op-col">
                          <h3>Results</h3>
                          {results.length === 0
                            ? <p className="muted">No results yet.</p>
                            : results.map(m => <MatchRow key={m.id} m={m} result />)}
                        </div>
                      </div>
                    </>
                  )
                })()}
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
