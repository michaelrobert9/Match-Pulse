// Site config values that are expected to change without a copy rewrite.
//
// Home Ground is a NEW plan and its price is a PLACEHOLDER for review, not a
// decision. It is read from here (or the VITE_HOME_GROUND_PRICE deploy env) in
// one place so it can change without touching page copy. Keep the placeholder
// flag true until pricing is confirmed; the pricing card shows a "placeholder"
// note while it is true.
export const HOME_GROUND_PRICE = Number(import.meta.env.VITE_HOME_GROUND_PRICE) || 5000
export const HOME_GROUND_PRICE_IS_PLACEHOLDER =
  String(import.meta.env.VITE_HOME_GROUND_PRICE_CONFIRMED || '') !== 'true'

// Where the "request a sport" and "book a demo" links go.
// TODO: confirm this destination address with the business.
export const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL || 'hello@matchpulse.co.za'
