import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { identityDb } from '../firebase'
import { EFT, statusOf } from '../lib/billing'
import { formatRand } from '../lib/payfast'

function fmtDate(v) {
  const d = v?.toDate?.() ?? (v ? new Date(v) : null)
  if (!d || isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function Invoice() {
  const { id } = useParams()
  const { user, profile } = useAuth()
  const isAdmin = profile?.platformAdmin === true

  const [inv,     setInv]     = useState(null)
  const [err,     setErr]     = useState('')
  const [editing, setEditing] = useState(false)
  const [billTo,  setBillTo]  = useState(null)
  const [busy,    setBusy]    = useState(false)
  const [msg,     setMsg]     = useState('')

  useEffect(() => {
    let cancel = false
    ;(async () => {
      try {
        const snap = await getDoc(doc(identityDb, 'invoices', id))
        if (cancel) return
        if (!snap.exists()) { setErr('Invoice not found.'); return }
        setInv({ id: snap.id, ...snap.data() })
      } catch (e) {
        if (!cancel) setErr('You don\'t have access to this invoice.')
      }
    })()
    return () => { cancel = true }
  }, [id])

  const canEdit = inv && inv.status === 'outstanding' && (inv.uid === user?.uid || isAdmin)

  function startEdit() {
    setBillTo({ ...inv.billTo })
    setEditing(true)
    setMsg('')
  }

  const bind = (key) => ({
    id:       `ed-${key}`,
    value:    billTo?.[key] ?? '',
    onChange: (e) => setBillTo(b => ({ ...b, [key]: e.target.value })),
  })

  async function saveEdit(e) {
    e.preventDefault()
    setBusy(true); setMsg('')
    try {
      await updateDoc(doc(identityDb, 'invoices', inv.id), {
        billTo, updatedAt: serverTimestamp(),
      })
      setInv(v => ({ ...v, billTo }))
      setEditing(false)
      setMsg('Billing details updated.')
    } catch (e) {
      setMsg(e.message || 'Could not save. Only outstanding invoices can be edited.')
    } finally {
      setBusy(false)
    }
  }

  if (err) {
    return (
      <main className="acct"><div className="wrap">
        <p className="notice notice-err" style={{ marginTop: 40 }}>{err}</p>
        <p><Link to="/account">Back to your account</Link></p>
      </div></main>
    )
  }
  if (!inv) {
    return <main className="acct"><div className="wrap"><p className="adm-loading" style={{ paddingTop: 40 }}>Loading…</p></div></main>
  }

  const st = statusOf(inv.status)

  return (
    <main className="acct inv-page">
      <div className="wrap inv-wrap">

        {/* Screen-only toolbar */}
        <div className="inv-toolbar noprint">
          <Link to="/account" className="btn btn-ghost btn-sm">← Your account</Link>
          <div className="inv-toolbar-actions">
            {canEdit && !editing && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={startEdit}>
                Edit billing details
              </button>
            )}
            <button type="button" className="btn btn-dark btn-sm" onClick={() => window.print()}>
              Print / save PDF
            </button>
          </div>
        </div>

        {msg && <p className="notice notice-ok noprint">{msg}</p>}

        {/* Bill-to editor (screen only) */}
        {editing && (
          <form className="acct-form inv-edit noprint" onSubmit={saveEdit}>
            <h2 className="inv-edit-h">Correct the billing details</h2>
            <div className="field">
              <label htmlFor="ed-name">Invoice to *</label>
              <input type="text" required {...bind('name')} />
            </div>
            <div className="field">
              <label htmlFor="ed-contact">Contact person</label>
              <input type="text" {...bind('contact')} />
            </div>
            <div className="field">
              <label htmlFor="ed-email">Billing email *</label>
              <input type="email" required {...bind('email')} />
            </div>
            <div className="field">
              <label htmlFor="ed-address">Billing address</label>
              <textarea rows={2} {...bind('address')} />
            </div>
            <div className="field">
              <label htmlFor="ed-vatNumber">VAT number</label>
              <input type="text" {...bind('vatNumber')} />
            </div>
            <div className="field">
              <label htmlFor="ed-reference">Order / PO reference</label>
              <input type="text" {...bind('reference')} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save details'}</button>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </form>
        )}

        {/* The invoice document */}
        <article className="inv-doc">
          <header className="inv-head">
            <div>
              <span className="wordmark inv-mark"><span className="m">Match</span><span className="p">Pulse</span></span>
              <p className="inv-site">matchpulse.co.za</p>
            </div>
            <div className="inv-title">
              <h1>Invoice</h1>
              <p className="inv-number tnum">{inv.number}</p>
              <span className={`pill pill-${st.pill}`}>{st.label}</span>
            </div>
          </header>

          <div className="inv-meta">
            <div className="inv-billto">
              <h3>Invoiced to</h3>
              <p className="inv-billto-name">{inv.billTo?.name}</p>
              {inv.billTo?.contact && <p>Attn: {inv.billTo.contact}</p>}
              {inv.billTo?.email && <p>{inv.billTo.email}</p>}
              {inv.billTo?.address && <p className="inv-pre">{inv.billTo.address}</p>}
              {inv.billTo?.vatNumber && <p>VAT no: {inv.billTo.vatNumber}</p>}
              {inv.billTo?.reference && <p>Your ref: {inv.billTo.reference}</p>}
            </div>
            <div className="inv-dates">
              <h3>Details</h3>
              <p><span>Date issued</span>{fmtDate(inv.createdAt)}</p>
              {inv.status === 'paid' && <p><span>Date paid</span>{fmtDate(inv.paidAt)}</p>}
              <p><span>Account</span>{inv.accountEmail || '—'}</p>
            </div>
          </div>

          <table className="inv-lines">
            <thead>
              <tr><th>Description</th><th className="num">Amount</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>MatchPulse — {inv.planLabel}</strong>
                  <div className="inv-line-detail">
                    {inv.kind === 'orgProfile'
                      ? 'Home Ground: this school’s matches, results and Match Days across every MatchPulse sport, on one branded public page, for one year.'
                      : inv.plan === 'pro'
                        ? `Unlimited competitions across every MatchPulse sport for ${inv.years === 1 ? 'one year' : `${inv.years} years`}.`
                        : `${inv.credits === 1 ? 'One competition' : `${inv.credits} competitions`}, usable on any MatchPulse sport.`}
                  </div>
                </td>
                <td className="num tnum">{formatRand(inv.amount)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td>Total due <span className="inv-vat">(VAT included where applicable)</span></td>
                <td className="num tnum">{formatRand(inv.amount)}</td>
              </tr>
            </tfoot>
          </table>

          {inv.status !== 'void' ? (
            <div className="inv-pay">
              <h3>{inv.status === 'paid' ? 'Paid — thank you' : 'How to pay'}</h3>
              {inv.status === 'outstanding' && (
                <p className="inv-pay-lede">
                  Pay by EFT to the account below. <strong>Use the invoice number
                  {' '}<span className="tnum">{inv.number}</span> as your payment reference</strong> —
                  it's how we match your payment. Your plan is activated as soon as the
                  payment reflects.
                </p>
              )}
              <dl className="inv-bank">
                <div><dt>Bank</dt><dd>{EFT.bank}</dd></div>
                <div><dt>Account name</dt><dd>{EFT.accountName}</dd></div>
                <div><dt>Account type</dt><dd>{EFT.accountType}</dd></div>
                <div><dt>Account number</dt><dd className="tnum">{EFT.accountNo}</dd></div>
                <div><dt>Branch code</dt><dd className="tnum">{EFT.branchCode}</dd></div>
                <div><dt>Reference</dt><dd className="tnum inv-ref">{inv.number}</dd></div>
              </dl>
            </div>
          ) : (
            <p className="inv-voidnote">This invoice has been voided{inv.voidNote ? ` — ${inv.voidNote}` : ''}. No payment is due.</p>
          )}

          <footer className="inv-foot">
            <p>MatchPulse · matchpulse.co.za · Questions about this invoice? Use the contact form at matchpulse.co.za/#contact</p>
          </footer>
        </article>
      </div>
    </main>
  )
}
