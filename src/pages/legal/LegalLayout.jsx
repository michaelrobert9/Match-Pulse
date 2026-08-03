import { Link, NavLink } from 'react-router-dom'

// Every legal page renders inside this shell: the same header, the same
// sibling navigation, the same footnote. Kept in one place so a policy change
// (contact link, updated-date banner, etc.) is a single edit.
const PAGES = [
  { to: '/legal/terms',           label: 'Terms & Conditions' },
  { to: '/legal/privacy',         label: 'Privacy Policy' },
  { to: '/legal/acceptable-use',  label: 'Acceptable Use' },
  { to: '/legal/cookies',         label: 'Cookie Policy' },
]

export default function LegalLayout({ title, updated, children }) {
  return (
    <main className="legal">
      <div className="wrap legal-wrap">
        <aside className="legal-nav" aria-label="Legal documents">
          <p className="label">Legal</p>
          <ul>
            {PAGES.map(p => (
              <li key={p.to}>
                <NavLink
                  to={p.to}
                  className={({ isActive }) => isActive ? 'active' : ''}
                >
                  {p.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </aside>

        <article className="legal-body">
          <header className="legal-head">
            <h1>{title}</h1>
            {updated && <p className="legal-updated">Last updated: {updated}</p>}
          </header>
          {children}
          <footer className="legal-foot">
            <p>
              Questions about this document? <Link to="/#contact">Get in touch</Link>.
            </p>
          </footer>
        </article>
      </div>
    </main>
  )
}
