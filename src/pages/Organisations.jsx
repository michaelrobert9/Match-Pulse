import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { listOrgsOwnedBy, ORG_TYPES } from '../lib/orgs'

const typeLabel = (t) => ORG_TYPES.find(x => x.key === t)?.label || t

export default function Organisations() {
  const { user } = useAuth()
  const [rows, setRows] = useState(null)

  useEffect(() => {
    if (!user?.uid) return
    let cancel = false
    ;(async () => {
      try {
        const list = await listOrgsOwnedBy(user.uid)
        if (!cancel) setRows(list)
      } catch {
        if (!cancel) setRows([])
      }
    })()
    return () => { cancel = true }
  }, [user?.uid])

  return (
    <main className="acct">
      <div className="wrap">
        <header className="acct-head">
          <p className="label">Organisations</p>
          <h1>Your organisations</h1>
          <p className="acct-email">Create and manage the schools, clubs, associations or leagues you run.</p>
        </header>

        <div className="org-list-head">
          <Link className="btn btn-primary" to="/organisations/new">Create an organisation</Link>
        </div>

        {!rows ? <p className="adm-loading">Loading…</p> : rows.length === 0 ? (
          <div className="adm-callout">
            <h3>No organisations yet.</h3>
            <p>Create one to author its identity — name, colours, logo and banner —
              once, centrally. It’ll be ready to activate on each sport as that rolls out.</p>
          </div>
        ) : (
          <ul className="org-cards">
            {rows.map(o => (
              <li key={o.id}>
                <Link className="org-card" to={`/organisations/${o.id}/edit`} style={{ '--pc': o.primaryColor || '#059669' }}>
                  <span className="org-card-logo">
                    {o.logoUrl ? <img src={o.logoUrl} alt="" /> : <span>{(o.matchName || o.name || '?').slice(0, 1)}</span>}
                  </span>
                  <span className="org-card-body">
                    <span className="org-card-name">{o.name}</span>
                    <span className="org-card-meta">{typeLabel(o.type)} · {o.slug}</span>
                  </span>
                  <span className="org-card-edit">Edit →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
