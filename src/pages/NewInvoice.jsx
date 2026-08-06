import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { httpsCallable } from 'firebase/functions'
import { useAuth } from '../contexts/AuthContext'
import { functions } from '../firebase'
import { PLANS, formatRand } from '../lib/payfast'

// Step between "choose a plan" and "here is your invoice". The person creating
// the account is often NOT the person paying — especially at schools — so the
// bill-to block is its own set of fields, pre-filled with the signer-up's
// details but fully overridable, and still editable on the invoice afterwards.
export default function NewInvoice() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const planKey = params.get('plan') === 'pro' ? 'pro' : 'event'
  const plan    = PLANS[planKey]

  const [billTo, setBillTo] = useState({
    name:      '',
    contact:   user?.displayName || '',
    email:     user?.email || '',
    address:   '',
    vatNumber: '',
    reference: '',
  })
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState('')

  const bind = (key) => ({
    id:       `bt-${key}`,
    value:    billTo[key],
    onChange: (e) => setBillTo(b => ({ ...b, [key]: e.target.value })),
  })

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      const call = httpsCallable(functions, 'createInvoice')
      const { data } = await call({ plan: planKey, billTo })
      navigate(`/invoices/${data.id}`, { replace: true })
    } catch (e) {
      setErr(e.message || 'Could not create the invoice. Please try again.')
      setBusy(false)
    }
  }

  return (
    <main className="acct">
      <div className="wrap inv-new-wrap">
        <header className="acct-head">
          <p className="label">Invoice</p>
          <h1>Who should this invoice be made out to?</h1>
          <p className="acct-email">
            Often that's a school or club's accounts department, not you — and you can
            still correct these details on the invoice afterwards.
          </p>
        </header>

        <div className="inv-plan-summary">
          <div>
            <p className="inv-plan-name">{planKey === 'pro' ? 'All-In Annual' : 'Single Competition'}</p>
            <p className="inv-plan-detail">
              {planKey === 'pro'
                ? 'Unlimited competitions across every sport for one year.'
                : 'One competition, on any one MatchPulse sport.'}
            </p>
          </div>
          <p className="inv-plan-price">
            {formatRand(plan.amount)} <span>{plan.once ? 'once-off' : '/ year'}</span>
          </p>
        </div>

        <form className="acct-form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="bt-name">Invoice to (organisation, school or person) *</label>
            <input type="text" required placeholder="e.g. St Andrew's College" {...bind('name')} />
          </div>
          <div className="field">
            <label htmlFor="bt-contact">Contact person <span className="opt">optional</span></label>
            <input type="text" placeholder="e.g. J Smith, Finance Office" {...bind('contact')} />
          </div>
          <div className="field">
            <label htmlFor="bt-email">Billing email *</label>
            <input type="email" required placeholder="accounts@school.co.za" {...bind('email')} />
          </div>
          <div className="field">
            <label htmlFor="bt-address">Billing address <span className="opt">optional</span></label>
            <textarea rows={2} placeholder="Street, town, postal code" {...bind('address')} />
          </div>
          <div className="field">
            <label htmlFor="bt-vatNumber">VAT number <span className="opt">optional</span></label>
            <input type="text" {...bind('vatNumber')} />
          </div>
          <div className="field">
            <label htmlFor="bt-reference">Your order / PO reference <span className="opt">optional</span></label>
            <input type="text" placeholder="If your organisation issues one" {...bind('reference')} />
          </div>

          {err && <p className="notice notice-err" role="alert">{err}</p>}

          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Creating invoice…' : `Create invoice — ${formatRand(plan.amount)}`}
          </button>
          <p className="acct-fine">
            No payment is taken now. You'll get an invoice with our bank details and a
            payment reference; your plan is activated as soon as the EFT reflects.
            {' '}<Link to="/products">Back to plans</Link>
          </p>
        </form>
      </div>
    </main>
  )
}
