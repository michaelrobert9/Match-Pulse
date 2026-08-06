import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { httpsCallable } from 'firebase/functions'
import { useAuth } from '../../contexts/AuthContext'
import { functions } from '../../firebase'

// The two visible email addresses are gone — reduces scraping. In their place:
// (a) a Call button whose tel: number is assembled from string parts inside a
// useEffect, so an HTML-only bot never sees it, and (b) a form that posts to
// the submitContactForm callable. Message copy sits in /admin > Messages until
// the SMTP-based email hop is wired.
function CallButton() {
  const [tel, setTel] = useState('')
  useEffect(() => {
    // Assembled at runtime — do not fold this into a single literal.
    setTel(['082', '886', '5413'].join(''))
  }, [])
  const pretty = tel ? `${tel.slice(0, 3)} ${tel.slice(3, 6)} ${tel.slice(6)}` : 'Call us'
  if (!tel) return <button className="btn btn-dark ci-call" disabled aria-label="Call us">Call us</button>
  return (
    <a className="btn btn-dark ci-call" href={`tel:${tel}`} aria-label={`Call ${pretty}`}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2-.5c.9.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2z" />
      </svg>
      Call {pretty}
    </a>
  )
}

export default function ContactSection() {
  const { user } = useAuth()
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' })
  const [busy, setBusy] = useState(false)
  const [msg,  setMsg]  = useState(null)

  // Pre-fill from the signed-in profile so a member doesn't retype their basics.
  useEffect(() => {
    if (!user) return
    setForm(f => ({
      ...f,
      name:  f.name  || user.displayName || '',
      email: f.email || user.email       || '',
    }))
  }, [user])

  const bind = (key) => ({
    id:       `c-${key}`,
    value:    form[key],
    onChange: (e) => setForm(f => ({ ...f, [key]: e.target.value })),
  })

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      const call = httpsCallable(functions, 'submitContactForm')
      await call(form)
      setMsg({ kind: 'ok', text: 'Thanks — your message is on its way. We\'ll be in touch shortly.' })
      setForm({ name: '', email: '', phone: '', message: '' })
    } catch (err) {
      setMsg({ kind: 'err', text: err?.message || 'Something went wrong. Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="block" id="contact">
      <div className="wrap">
        <div className="sec-head">
          <p className="label reveal">Contact</p>
          <h2 className="h2 reveal">Get in touch.</h2>
          <p className="sub reveal">Running a league, a festival or a whole association? Tell us your sport and we'll help you get set up.</p>
        </div>

        <div className="contact-grid">
          <div className="contact-info reveal">
            <h3>We'd love to hear from you.</h3>
            <p>Prefer to talk? Give us a call. Prefer to write? Use the form and we'll come back to you by email.</p>
            <div className="contact-list">
              <div className="contact-item">
                <span className="ci-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2-.5c.9.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2z" /></svg></span>
                <div>
                  <div className="ci-label">Call</div>
                  <div className="ci-value"><CallButton /></div>
                </div>
              </div>
              <div className="contact-item">
                <span className="ci-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></svg></span>
                <div><div className="ci-label">Write</div><div className="ci-value">Use the form and we'll email you back within one business day.</div></div>
              </div>
              <div className="contact-item">
                <span className="ci-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 6-9 12-9 12S3 16 3 10a9 9 0 1118 0z" /><circle cx="12" cy="10" r="3" /></svg></span>
                <div><div className="ci-label">Based in</div><div className="ci-value">South Africa</div></div>
              </div>
            </div>
          </div>

          <form className="contact-form reveal" onSubmit={submit}>
            <div className="field">
              <label htmlFor="c-name">Your name</label>
              <input type="text" placeholder="Full name" autoComplete="name" required {...bind('name')} />
            </div>
            <div className="field">
              <label htmlFor="c-email">Email address</label>
              <input type="email" placeholder="you@example.com" autoComplete="email" required {...bind('email')} />
            </div>
            <div className="field">
              <label htmlFor="c-phone">Cellphone number <span className="opt">optional</span></label>
              <input type="tel" placeholder="e.g. 082 123 4567" autoComplete="tel" {...bind('phone')} />
            </div>
            <div className="field">
              <label htmlFor="c-message">Message</label>
              <textarea rows={4} placeholder="Which sport do you run, and how can we help?" required {...bind('message')} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Sending…' : 'Send message'}
            </button>
            {msg && (
              <p className={`form-fine ${msg.kind === 'ok' ? 'form-ok' : 'form-err'}`} role="status">
                {msg.text}
              </p>
            )}
            {!msg && (
              <p className="form-fine">
                By sending this message you agree to our <Link to="/legal/terms">Terms</Link> and{' '}
                <Link to="/legal/privacy">Privacy Policy</Link>.
              </p>
            )}
          </form>
        </div>
      </div>
    </section>
  )
}
