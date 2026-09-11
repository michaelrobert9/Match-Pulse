// The sport registry — the single source of truth for which sports exist, where
// they live, and what colour identifies them. Drives the hub cards and the
// footer links. Each card links straight to that sport's own origin, where the
// user signs in; there is no server-side mirror to keep in step.
//
// `host` is the deployed origin. Swap to the custom subdomain
// (hockey.matchpulse.co.za, …) once DNS is wired — nothing else changes.
//
// `newlyLaunched: true` shows a small "Newly launched" tag on the homepage sport
// cards, so a sport that has just finished development reads as new rather than
// empty. Flip a sport to false once schools are using it. (Hockey already has
// real competitions.)

export const SPORTS = [
  {
    key:   'hockey',
    name:  'Hockey',
    hue:   '#059669',
    host:  'https://hockey.matchpulse.co.za',
    blurb: 'Goals, cards and quarters, with full team and player records.',
    newlyLaunched: false,
  },
  {
    key:   'netball',
    name:  'Netball',
    hue:   '#7C3AED',
    host:  'https://netball.matchpulse.co.za',
    blurb: 'Quarters, centre passes and shooting stats, live from courtside.',
    newlyLaunched: true,
  },
  {
    key:   'rugby',
    name:  'Rugby',
    hue:   '#15803D',
    host:  'https://rugby.matchpulse.co.za',
    blurb: 'Tries, conversions and cards, with log points and bonus rules.',
    newlyLaunched: true,
  },
  {
    key:   'waterpolo',
    name:  'Water Polo',
    hue:   '#2563EB',
    host:  'https://waterpolo.matchpulse.co.za',
    blurb: 'Goals, exclusions and quarters, scored poolside in real time.',
    newlyLaunched: true,
  },
  {
    key:   'soccer',
    name:  'Soccer',
    hue:   '#1D4ED8',
    host:  'https://soccer.matchpulse.co.za',
    blurb: 'Goals, cards and halves, with full team and player records.',
    newlyLaunched: true,
  },
]

// Sports that are built and ready to activate, but not yet publicly launched.
// Shown as "coming soon" on the homepage (not clickable — there's no live site
// to send people to yet) and offered in the org "Activate on sports" list so an
// owner can set their organisation up ahead of the public launch. Colours are
// the brand-book sport accents. The backend SPORT_DBS must carry the same keys
// (each key is the named Firestore database id) for activation to succeed.
export const COMING_SOON_SPORTS = [
  { key: 'basketball', name: 'Basketball',  hue: '#C2400C', host: 'https://basketball.matchpulse.co.za', comingSoon: true },
  { key: 'cricket',    name: 'Cricket',     hue: '#B45309', host: 'https://cricket.matchpulse.co.za',    comingSoon: true },
  { key: 'sevens',     name: 'Sevens',      hue: '#4D7C0F', host: 'https://sevens.matchpulse.co.za',     comingSoon: true },
  { key: 'touchrugby', name: 'Touch Rugby', hue: '#037857', host: 'https://touchrugby.matchpulse.co.za', comingSoon: true },
]

// Every sport shown in the org "Activate on sports" list: the live sports plus
// the built-but-not-yet-launched ones (flagged comingSoon, listed but not yet
// activatable). Sorted alphabetically by name for the picker.
export const ACTIVATABLE_SPORTS = [...SPORTS, ...COMING_SOON_SPORTS]
  .slice()
  .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

// Resolve a key across both live and coming-soon sports, so an org activated on
// a coming-soon sport still shows that sport's name/colour everywhere.
export const sportByKey = (key) => ACTIVATABLE_SPORTS.find(s => s.key === key) ?? null

// Display host, without the scheme — used as the subtitle on each hub card.
export const displayHost = (sport) => sport.host.replace(/^https?:\/\//, '')
