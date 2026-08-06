// A product-shaped visual built from the design system, not stock photography.
// It shows the core idea literally: several coaches each enter one result, and
// those results appear together in one place. Pure CSS/markup — no images, no
// network, fast and theme-consistent. Decorative, so hidden from assistive tech.

const ENTRIES = [
  { sport: 'Rugby',     hue: '#15803D', home: 'Grey',       hs: 24, as: 17, away: 'Paul Roos' },
  { sport: 'Hockey',    hue: '#059669', home: 'Rustenburg', hs: 4,  as: 2,  away: 'Herschel' },
  { sport: 'Netball',   hue: '#7C3AED', home: 'DSG',        hs: 38, as: 31, away: 'Collegiate' },
  { sport: 'Water Polo',hue: '#2563EB', home: 'Reddam',     hs: 11, as: 9,  away: 'Bishops' },
]

function ScoreLine({ e, compact = false }) {
  return (
    <div className={`pv-line ${compact ? 'compact' : ''}`}>
      <span className="pv-swatch" style={{ background: e.hue }} />
      <span className="pv-team">{e.home}</span>
      <span className="pv-score tnum">{e.hs}</span>
      <span className="pv-dash">–</span>
      <span className="pv-score tnum">{e.as}</span>
      <span className="pv-team pv-team-away">{e.away}</span>
    </div>
  )
}

export default function ProductVisual() {
  return (
    <div className="pv" aria-hidden="true">
      {/* Left: individual coaches each entering one result */}
      <div className="pv-coaches">
        {ENTRIES.slice(0, 3).map((e, i) => (
          <div className="pv-entry" key={e.sport} style={{ '--d': `${i * 90}ms` }}>
            <div className="pv-entry-head">
              <span className="pv-pill" style={{ color: e.hue, background: `color-mix(in srgb, ${e.hue} 12%, white)` }}>
                {e.sport}
              </span>
              <span className="pv-coach">Coach entry</span>
            </div>
            <ScoreLine e={e} />
            <div className="pv-entry-foot"><span className="pv-check" style={{ background: e.hue }}>✓</span> Result entered</div>
          </div>
        ))}
      </div>

      {/* Connector arrow */}
      <div className="pv-arrow" aria-hidden="true">
        <svg viewBox="0 0 40 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12h30M26 5l8 7-8 7" />
        </svg>
      </div>

      {/* Right: everything together, one place */}
      <div className="pv-board">
        <div className="pv-board-head">
          <span className="pv-board-title">Today’s results</span>
          <span className="pv-livepill"><i />Live</span>
        </div>
        <div className="pv-board-body">
          {ENTRIES.map(e => <ScoreLine key={e.sport} e={e} compact />)}
        </div>
        <div className="pv-board-foot">Everyone sees them all</div>
      </div>
    </div>
  )
}
