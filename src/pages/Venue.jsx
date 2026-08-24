import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getVenueBySlug, getOrgLite, venueEmbedUrl, venueDirectionsUrl, formatVenueAddress } from '../lib/venues'
import { orgPublicPath } from '../lib/orgProfile'

// SportsActivityLocation structured data — helps venues surface in search.
function ldFor(v) {
  const a = v.address || {}
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsActivityLocation',
    name: v.name,
    ...(v.description ? { description: v.description } : {}),
    address: {
      '@type': 'PostalAddress',
      ...(a.line1 ? { streetAddress: a.line1 } : {}),
      ...(a.city ? { addressLocality: a.city } : {}),
      ...(a.province ? { addressRegion: a.province } : {}),
      ...(a.postalCode ? { postalCode: a.postalCode } : {}),
      ...(a.country ? { addressCountry: a.country } : {}),
    },
    ...(v.location ? { geo: { '@type': 'GeoCoordinates', latitude: v.location.lat, longitude: v.location.lng } } : {}),
    ...(v.images?.length ? { image: v.images } : {}),
  }
}

export default function Venue() {
  const { slug } = useParams()
  const [venue, setVenue] = useState(undefined)  // undefined=loading, null=not found
  const [org,   setOrg]   = useState(null)

  useEffect(() => {
    let cancel = false
    setVenue(undefined); setOrg(null)
    ;(async () => {
      const v = await getVenueBySlug(slug).catch(() => null)
      if (cancel) return
      setVenue(v)
      if (v?.name) document.title = `${v.name} — MatchPulse`
      if (v?.ownerOrgId) { const o = await getOrgLite(v.ownerOrgId).catch(() => null); if (!cancel) setOrg(o) }
    })()
    return () => { cancel = true }
  }, [slug])

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

  const address = formatVenueAddress(venue.address)
  const embed = venueEmbedUrl(venue)

  return (
    <main className="venue">
      <div className="wrap">
        <header className="venue-head">
          <h1>{venue.name}{venue.verified && <span className="venue-verified" title="Verified venue">✓</span>}</h1>
          {address && <p className="venue-addr">{address}</p>}
          {org && <p className="venue-org">Home of <Link to={orgPublicPath(org)}>{org.name}</Link></p>}
        </header>

        {venue.description && <p className="venue-desc">{venue.description}</p>}

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
