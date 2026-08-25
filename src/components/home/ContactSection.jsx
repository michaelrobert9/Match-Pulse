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
// WhatsApp — the sales motion's preferred channel. The number is supplied via
// config so it can be set without a code change.
// TODO: set VITE_WHATSAPP_NUMBER in the deploy env to the real WhatsApp number
// in international format, digits only (e.g. 27821234567). Until it is set the
// button is hidden rather than pointing at a broken link.
const WHATSAPP_NUMBER = (import.meta.env.VITE_WHATSAPP_NUMBER || '').replace(/\D/g, '')

function WhatsAppButton() {
  if (!WHATSAPP_NUMBER) return null
  const href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Hi MatchPulse, I'd like to know more.")}`
  return (
    <a className="btn btn-dark ci-wa" href={href} target="_blank" rel="noreferrer" aria-label="Message us on WhatsApp">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.2 4.79 1.2h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.15h-.01c-1.52 0-3.01-.41-4.3-1.18l-.31-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.37c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.69 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43l-.48-.01c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29z"/>
      </svg>
      WhatsApp us
    </a>
  )
}

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
            <p>Prefer to talk? WhatsApp us or book a demo at your school. Prefer to write? Use the form and we'll come back to you by email.</p>
            <div className="contact-list">
              {WHATSAPP_NUMBER && (
                <div className="contact-item">
                  <span className="ci-ico"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.2 4.79 1.2h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm4.52 11.99c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43l-.48-.01c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29z"/></svg></span>
                  <div>
                    <div className="ci-label">WhatsApp</div>
                    <div className="ci-value"><WhatsAppButton /></div>
                  </div>
                </div>
              )}
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
