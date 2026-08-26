import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getOrg } from '../lib/orgs'
import { createProfileInvoice, orgPublicPath } from '../lib/orgProfile'
import { formatRand } from '../lib/payfast'
import { HOME_GROUND_PRICE } from '../lib/config'

// Owner/admin raises an EFT invoice for Home Ground (the org-level cross-sport
// public page). R5 000 per month; if the price is set to 0 the server activates
// it directly instead of raising a zero invoice.
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
      const res = await createProfileInvoice(orgId, billTo)
      // Price not set → the profile is free; the server activates it directly
      // instead of raising a zero invoice. Send them to the now-unlocked page.
      if (res?.free) {
        navigate(orgPublicPath(org), { replace: true })
        return
      }
      navigate(`/invoices/${res.id}`, { replace: true })
    } catch (e) {
      setErr(e.message || 'Could not create the invoice.')
      setBusy(false)
    }
  }

  if (deny) return <main className="acct"><div className="wrap"><p className="notice notice-err" style={{ marginTop: 40 }}>You can only subscribe a school you own.</p><p><Link to="/admin">Back to management</Link></p></div></main>
  if (!org) return <main className="acct"><div className="wrap"><p className="adm-loading" style={{ paddingTop: 40 }}>Loading…</p></div></main>

  return (
    <main className="acct">
      <div className="wrap inv-new-wrap">
        <header className="acct-head">
          <p className="label">Subscription</p>
          <h1>Home Ground — {org.name}</h1>
          <p className="acct-email">
            Brings {org.name}’s whole sport together on one public page
            (<Link to={orgPublicPath(org)}>{orgPublicPath(org)}</Link>): matches, results and Match
            Days from every activated sport. {formatRand(HOME_GROUND_PRICE)} per month, billed by EFT invoice.
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
