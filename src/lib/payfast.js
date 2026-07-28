// PayFast — main site. Billing lives here and nowhere else on the platform.
//
// These are PayFast's HOSTED payment links ("pay now" buttons). We do not build
// or sign a payment payload ourselves — PayFast hosts the checkout, and the only
// server-side code involved is the ITN webhook that hears back about the result.
//
// The one thing we add to the plain button: `m_payment_id`, carrying the buyer's
// uid and plan. Hosted _paynow links accept extra query params, and the ITN
// echoes m_payment_id straight back — which is what lets the webhook attribute a
// payment to an account and activate it automatically. Without it, PayFast has
// no idea which MatchPulse user just paid, and activation has to be done by hand.

const MERCHANT_ID = '10266957'
const SITE        = 'https://matchpulse.co.za'

// Confirmation email PayFast copies on each successful payment.
const CONFIRM_TO = 'billing@matchpulse.co.za'

export const PLANS = {
  event: {
    key:    'event',
    label:  'Plus',
    amount: 2000,
    once:   true,
    item:   'MatchPulse Plus',
  },
  pro: {
    key:       'pro',
    label:     'Pro',
    amount:    15000,
    once:      false,
    item:      'MatchPulse Pro',
    // subscription_type=1 recurring · frequency=6 annual · cycles=0 indefinite
    recurring: { subscription_type: 1, frequency: 6, cycles: 0 },
  },
}

/**
 * Build the hosted checkout URL for a plan, tagged with who is buying.
 *
 * @param {'event'|'pro'} planKey
 * @param {{ uid: string, email?: string }} user  must be signed in — see below
 */
export function paymentUrl(planKey, user) {
  const plan = PLANS[planKey]
  if (!plan) throw new Error(`Unknown plan: ${planKey}`)
  if (!user?.uid) throw new Error('Sign in before starting a payment.')

  const params = new URLSearchParams({
    cmd:                  '_paynow',
    receiver:             MERCHANT_ID,
    item_name:            plan.item,
    amount:               String(plan.amount),
    // The ITN parses this back apart. Keep the shape in step with the webhook.
    m_payment_id:         `${user.uid}__${plan.key}__${Date.now()}`,
    return_url:           `${SITE}/portal`,
    cancel_url:           `${SITE}/plans`,
    notify_url:           `${SITE}/payfast/itn`,
    email_confirmation:   '1',
    confirmation_address: CONFIRM_TO,
  })

  if (user.email) params.set('email_address', user.email)

  if (!plan.once) {
    params.set('subscription_type', String(plan.recurring.subscription_type))
    params.set('recurring_amount',  String(plan.amount))
    params.set('frequency',         String(plan.recurring.frequency))
    params.set('cycles',            String(plan.recurring.cycles))
  }

  return `https://payment.payfast.io/eng/process?${params.toString()}`
}

export const formatRand = (n) => `R${n.toLocaleString('en-ZA')}`
