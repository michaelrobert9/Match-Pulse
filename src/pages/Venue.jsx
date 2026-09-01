import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { getVenueBySlug, getVenueRedirect, getOrgByHomeVenue, venueEmbedUrl, venueDirectionsUrl, venueLocality } from '../lib/venues'
import { orgPublicPath } from '../lib/orgProfile'

// SportsActivityLocation structured data — helps venues surface in search.
function ldFor(v) {
  const a = v.address || {}
  const locality = venueLocality(v)
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsActivityLocation',
    name: v.name,
    ...(v.description ? { description: v.description } : {}),
    ...(locality || a.line1 ? {
      address: {
        '@type': 'PostalAddress',
        ...(a.line1 ? { streetAddress: a.line1 } : {}),
        ...(locality ? { addressLocality: locality } : {}),
        ...(a.province ? { addressRegion: a.province } : {}),
        ...(a.postalCode ? { postalCode: a.postalCode } : {}),
        addressCountry: a.country || 'South Africa',
      },
    } : {}),
    ...(v.location ? { geo: { '@type': 'GeoCoordinates', latitude: v.location.lat, longitude: v.location.lng } } : {}),
    ...(v.images?.length ? { image: v.images } : {}),
  }
}

export default function Venue() {
  const { slug } = useParams()
  const [venue, setVenue] = useState(undefined)  // undefined=loading, null=not found
  const [org,   setOrg]   = useState(null)
  const [redirect, setRedirect] = useState(null) // target slug when this one was merged away

  useEffect(() => {
    let cancel = false
    setVenue(undefined); setOrg(null); setRedirect(null)
    ;(async () => {
      const v = await getVenueBySlug(slug).catch(() => null)
      if (cancel) return
      if (!v) {
        // Merged-away slug → send old links to the target's page.
        const rd = await getVenueRedirect(slug).catch(() => null)
        if (cancel) return
        if (rd?.toSlug && rd.toSlug !== slug) { setRedirect(rd.toSlug); return }
        setVenue(null); return
      }
      setVenue(v)
      if (v?.name) document.title = `${v.name} — MatchPulse`
      // "Home of" is a reverse lookup: the org (if any) that names this its home.
      const o = await getOrgByHomeVenue(v.id).catch(() => null)
      if (!cancel) setOrg(o)
    })()
    return () => { cancel = true }
  }, [slug])

  if (redirect) return <Navigate to={`/venues/${redirect}`} replace />

  useEffect(() => {
    if (!venue) return
    const el = document.createElement('script')
    el.type = 'application/ld+json'
    el.textContent = JSON.stringify(ldFor(venue))
    document.head.appendChild(el)
    return () => { el.remove() }
  }, [venue])

  if (venue === undefined) return <main className="acct"><div className="wrap"><p className="adm-loading" style={{ paddingTop: 60 }}>Loading…</p></div></main>
  if (venue === null) return (
    <main className="acct"><div className="wrap">
      <p className="notice notice-err" style={{ marginTop: 40 }}>Venue not found.</p>
      <p><Link to="/">Back to MatchPulse</Link></p>
    </div></main>
  )

  const locality = venueLocality(venue)
  const embed = venueEmbedUrl(venue)
  const facilities = (venue.facilities || []).filter(f => f.active !== false)

  return (
    <main className="venue">
      <div className="wrap">
        <header className="venue-head">
          <h1>{venue.name}{venue.verified && <span className="venue-verified" title="Verified venue">✓</span>}</h1>
          {locality && <p className="venue-addr">{locality}</p>}
          {org && <p className="venue-org">Home of <Link to={orgPublicPath(org)}>{org.name}</Link></p>}
        </header>

        {venue.description && <p className="venue-desc">{venue.description}</p>}

        {facilities.length > 0 && (
          <ul className="venue-facilities">
            {facilities.map(f => (
              <li key={f.id} className="venue-facility">
                <span className="vf-name">{f.name}</span>
                <span className="vf-noun">{f.displayNoun}</span>
                <span className="vf-sports">{f.sports.join(' · ')}</span>
              </li>
            ))}
          </ul>
        )}

        {venue.images?.length > 0 && (
          <div className="venue-gallery">
            {venue.images.map((u, i) => <img key={i} src={u} alt="" loading="lazy" />)}
          </div>
        )}

        <div className="venue-map">
          {embed && (
            <iframe title={`Map of ${venue.name}`} src={embed} loading="lazy" allowFullScreen referrerPolicy="no-referrer-when-downgrade" />
          )}
          <a className="btn btn-ghost" href={venueDirectionsUrl(venue)} target="_blank" rel="noreferrer">Get directions →</a>
        </div>
      </div>
    </main>
  )
}
