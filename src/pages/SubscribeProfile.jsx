import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getOrg } from '../lib/orgs'
import { createProfileInvoice, orgPublicPath } from '../lib/orgProfile'

// Owner/admin raises an EFT invoice for the annual cross-sport profile
// subscription. Price is TBD (config on the function) — if it comes back as
// R0 the invoice still records; the amount is set once pricing is decided.
export default function SubscribeProfile() {
  const { orgId } = useParams()
  const { user, profile } = useAuth()
  const isAdmin = profile?.platformAdmin === true
  const navigate = useNavigate()

  const [org,  setOrg]  = useState(null)
  const [deny, setDeny] = useState(false)
  const [billTo, setBillTo] = useState({ name: '', contact: '', email: '', address: '', vatNumber: '', reference: '' })
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState('')

  useEffect(() => {
    let cancel = false
    ;(async () => {
      const o = await getOrg(orgId)
      if (cancel) return
      if (!o) { setDeny(true); return }
      if (o.ownerUserId !== user?.uid && !isAdmin) { setDeny(true); return }
      setOrg(o)
      setBillTo(b => ({ ...b, name: o.name || '', email: o.contactEmail || user?.email || '', contact: user?.displayName || '' }))
    })()
    return () => { cancel = true }
  }, [orgId, user?.uid, isAdmin])

  const bind = (k) => ({ id: `s-${k}`, value: billTo[k], onChange: (e) => setBillTo(b => ({ ...b, [k]: e.target.value })) })

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      const { id } = await createProfileInvoice(orgId, billTo)
      navigate(`/invoices/${id}`, { replace: true })
    } catch (e) {
      setErr(e.message || 'Could not create the invoice.')
      setBusy(false)
    }
  }

  if (deny) return <main className="acct"><div className="wrap"><p className="notice notice-err" style={{ marginTop: 40 }}>You can only subscribe an organisation you own.</p><p><Link to="/organisations">Your organisations</Link></p></div></main>
  if (!org) return <main className="acct"><div className="wrap"><p className="adm-loading" style={{ paddingTop: 40 }}>Loading…</p></div></main>

  return (
    <main className="acct">
      <div className="wrap inv-new-wrap">
        <header className="acct-head">
          <p className="label">Subscription</p>
          <h1>Cross-sport profile — {org.name}</h1>
          <p className="acct-email">
            Publishes {org.name}’s fixtures &amp; results across every activated sport on its public
            page (<Link to={orgPublicPath(org)}>{orgPublicPath(org)}</Link>). Annual, billed by EFT invoice.
          </p>
        </header>

        <form className="acct-form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="s-name">Invoice to *</label>
            <input type="text" required placeholder="School / club / person" {...bind('name')} />
          </div>
          <div className="field">
            <label htmlFor="s-contact">Contact person <span className="opt">optional</span></label>
            <input type="text" {...bind('contact')} />
          </div>
          <div className="field">
            <label htmlFor="s-email">Billing email *</label>
            <input type="email" required {...bind('email')} />
          </div>
          <div className="field">
            <label htmlFor="s-address">Billing address <span className="opt">optional</span></label>
            <textarea rows={2} {...bind('address')} />
          </div>
          <div className="field">
            <label htmlFor="s-vatNumber">VAT number <span className="opt">optional</span></label>
            <input type="text" {...bind('vatNumber')} />
          </div>
          <div className="field">
            <label htmlFor="s-reference">Your order / PO reference <span className="opt">optional</span></label>
            <input type="text" {...bind('reference')} />
          </div>
          {err && <p className="notice notice-err" role="alert">{err}</p>}
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating invoice…' : 'Create subscription invoice'}</button>
          <p className="acct-fine">No payment now — you’ll get an invoice with our bank details and a reference; the profile unlocks once the payment reflects.</p>
        </form>
      </div>
    </main>
  )
}
