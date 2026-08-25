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
]

export const sportByKey = (key) => SPORTS.find(s => s.key === key) ?? null

// Display host, without the scheme — used as the subtitle on each hub card.
export const displayHost = (sport) => sport.host.replace(/^https?:\/\//, '')
