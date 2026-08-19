import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { resolveOrgPathBySlug } from '../lib/orgProfile'

// Legacy public org URLs (bare slug via /o/:slug, or /organisations/:slug) get
// resolved to the type-prefixed canonical path and redirected. Client-side
// redirect (React Router) — a matching Firebase Hosting 301 for the fixed
// legacy prefixes can be added later, but the target prefix is type-dependent
// so the lookup has to happen in-app.
export default function OrgRedirect() {
  const { slug } = useParams()
  const [target, setTarget] = useState(undefined) // undefined=loading, null=not found

  useEffect(() => {
    let cancel = false
    resolveOrgPathBySlug(slug).then(p => { if (!cancel) setTarget(p) }).catch(() => { if (!cancel) setTarget(null) })
    return () => { cancel = true }
  }, [slug])

  if (target === undefined) return <main className="acct"><div className="wrap"><p className="adm-loading" style={{ paddingTop: 60 }}>Loading…</p></div></main>
  if (target === null) return <Navigate to="/" replace />
  return <Navigate to={target} replace />
}
