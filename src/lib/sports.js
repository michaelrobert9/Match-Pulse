// The sport registry — the single source of truth for which codes exist, where
// they live, and what colour identifies them.
//
// This list is mirrored server-side in functions/index.js (SPORT_HOSTS). Both
// must agree: the client uses it to render the hub, the server uses it as the
// redirect allowlist. Adding a sport means editing both.
//
// `host` is the deployed origin. Swap to the custom subdomain
// (hockey.matchpulse.co.za, …) once DNS is wired — nothing else changes.

export const SPORTS = [
  {
    key:   'hockey',
    name:  'Hockey',
    hue:   '#059669',
    host:  'https://match-pulse-hockey.web.app',
    blurb: 'Goals, cards and quarters, with full team and player records.',
  },
  {
    key:   'netball',
    name:  'Netball',
    hue:   '#7C3AED',
    host:  'https://match-pulse-netball-9701f.web.app',
    blurb: 'Quarters, centre passes and shooting stats, live from courtside.',
  },
  {
    key:   'rugby',
    name:  'Rugby',
    hue:   '#15803D',
    host:  'https://match-pulse-4560e-ff0fe.web.app',
    blurb: 'Tries, conversions and cards, with log points and bonus rules.',
  },
  {
    key:   'waterpolo',
    name:  'Water Polo',
    hue:   '#2563EB',
    host:  'https://match-pulse-waterpolo-f9b4c.web.app',
    blurb: 'Goals, exclusions and quarters, scored poolside in real time.',
  },
]

export const sportByKey = (key) => SPORTS.find(s => s.key === key) ?? null

// Display host, without the scheme — used as the subtitle on each hub card.
export const displayHost = (sport) => sport.host.replace(/^https?:\/\//, '')
