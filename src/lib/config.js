// Site config values that are expected to change without a copy rewrite.
//
// Home Ground: R5 000 per month, billed by EFT invoice. The price is read from
// here (or the VITE_HOME_GROUND_PRICE deploy env) in one place so it can change
// without touching page copy. Keep the functions env HOME_GROUND_AMOUNT in step.
export const HOME_GROUND_PRICE  = Number(import.meta.env.VITE_HOME_GROUND_PRICE) || 5000
export const HOME_GROUND_PERIOD = 'per month'
// Pricing is confirmed; set VITE_HOME_GROUND_PRICE_PLACEHOLDER=true to show a
// "placeholder" note again while a new price is under review.
export const HOME_GROUND_PRICE_IS_PLACEHOLDER =
  String(import.meta.env.VITE_HOME_GROUND_PRICE_PLACEHOLDER || '') === 'true'

// Where the "request a sport" and "book a demo" links go.
// TODO: confirm this destination address with the business.
export const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL || 'hello@matchpulse.co.za'
