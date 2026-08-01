import { Link } from 'react-router-dom'
import { PLANS, paymentUrl, formatRand } from '../lib/payfast'
import { useAuth } from '../contexts/AuthContext'

// Bank details for EFT / manual payment. Kept as a plain constant here so it's
// one edit if a detail changes; the same block renders under every paid plan.
const EFT = {
  bank:        'First National Bank',
  accountName: 'MatchPulse (Pty) Ltd',
  accountType: 'Business Cheque',
  accountNo:   '628 4402 1367',
  branchCode:  '250655',
  reference:   'Your email address + plan (e.g. name@example.com Pro)',
  email:       'billing@matchpulse.co.za',
}

function PayButton({ planKey, children }) {
  const { user } = useAuth()
  if (!user) {
    return (
      <Link className="btn btn-primary" to={`/signup?next=${encodeURIComponent(`/products#${planKey}`)}`}>
        {children}
      </Link>
    )
  }
  return (
    <a className="btn btn-primary" href={paymentUrl(planKey, user)}>{children}</a>
  )
}

function EftBlock({ plan }) {
  return (
    <details className="eft-panel">
      <summary>Pay by EFT instead</summary>
      <div className="eft-body">
        <p className="eft-lede">
          Prefer EFT? Transfer <strong>{formatRand(plan.amount)}</strong> to the account below and email proof of payment to{' '}
          <a href={`mailto:${EFT.email}`}>{EFT.email}</a>. We'll activate your plan within one business day, and you'll receive an invoice by email.
        </p>
        <dl className="eft-details">
          <div><dt>Bank</dt><dd>{EFT.bank}</dd></div>
          <div><dt>Account name</dt><dd>{EFT.accountName}</dd></div>
          <div><dt>Account type</dt><dd>{EFT.accountType}</dd></div>
          <div><dt>Account number</dt><dd>{EFT.accountNo}</dd></div>
          <div><dt>Branch code</dt><dd>{EFT.branchCode}</dd></div>
          <div><dt>Reference</dt><dd>{EFT.reference}</dd></div>
        </dl>
      </div>
    </details>
  )
}

export default function Products() {
  const plus = PLANS.event
  const pro  = PLANS.pro

  return (
    <main className="products">
      <div className="wrap">
        <header className="products-head">
          <p className="label">Plans</p>
          <h1>One account. One plan. Every sport.</h1>
          <p className="products-sub">
            Buy once on the main site and access unlocks across every MatchPulse sport
            you play. All prices in South African Rand, VAT inclusive.
          </p>
        </header>

        <div className="products-grid">
          {/* Free */}
          <article className="product-card">
            <header>
              <h2>Free</h2>
              <p className="product-price"><span className="amount">R0</span></p>
              <p className="product-tagline">Unlimited teams &amp; fixtures. Zero cost, forever.</p>
            </header>
            <ul className="product-features">
              <li>Unlimited teams, players and matches</li>
              <li>Live match capture on any device</li>
              <li>Public team &amp; player pages, always free to view</li>
              <li>Sign in on any MatchPulse sport with one account</li>
            </ul>
            <div className="product-cta">
              <Link className="btn btn-ghost" to="/signup">Create an account</Link>
            </div>
          </article>

          {/* Plus */}
          <article className="product-card featured" id="event">
            <span className="product-flag">Most popular</span>
            <header>
              <h2>Plus</h2>
              <p className="product-price">
                <span className="amount">{formatRand(plus.amount)}</span>
                <span className="unit">once-off</span>
              </p>
              <p className="product-tagline">Run a competition when you need one. No subscription.</p>
            </header>
            <ul className="product-features">
              <li>Everything in Free</li>
              <li>Run a competition (league, cup or tournament)</li>
              <li>Live standings, fixtures &amp; results pages</li>
              <li>Team &amp; player awards, top-scorer tables</li>
              <li>Downloadable invoice on payment</li>
            </ul>
            <div className="product-cta">
              <PayButton planKey="event">Buy Plus — {formatRand(plus.amount)}</PayButton>
            </div>
            <EftBlock plan={plus} />
          </article>

          {/* Pro */}
          <article className="product-card" id="pro">
            <header>
              <h2>Pro</h2>
              <p className="product-price">
                <span className="amount">{formatRand(pro.amount)}</span>
                <span className="unit">/ year</span>
              </p>
              <p className="product-tagline">
                Unlimited competitions across every sport, all season long.
              </p>
            </header>
            <ul className="product-features">
              <li>Everything in Plus</li>
              <li>Unlimited competitions across every sport</li>
              <li>Priority email support</li>
              <li>Annual invoice, VAT inclusive</li>
            </ul>
            <div className="product-cta">
              <PayButton planKey="pro">Go Pro — {formatRand(pro.amount)} / yr</PayButton>
            </div>
            <EftBlock plan={pro} />
          </article>
        </div>

        <section className="products-fine">
          <h3>How activation works</h3>
          <ul>
            <li><strong>Card &amp; instant EFT via PayFast:</strong> access unlocks automatically the moment the payment clears.</li>
            <li><strong>Manual EFT:</strong> we activate within one business day of the transfer landing, and email you the invoice.</li>
            <li>All plans are billed by <strong>MatchPulse (Pty) Ltd</strong>, South Africa. Invoices are downloadable from your account after purchase.</li>
            <li>Questions? <a href="mailto:billing@matchpulse.co.za">billing@matchpulse.co.za</a>.</li>
          </ul>
        </section>
      </div>
    </main>
  )
}
