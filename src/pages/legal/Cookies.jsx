import { Link } from 'react-router-dom'
import LegalLayout from './LegalLayout'

export default function Cookies() {
  return (
    <LegalLayout title="Cookie Policy" updated="14 July 2026">
      <p>
        This Cookie Policy explains how MatchPulse ("we", "us", "our") uses
        cookies and similar technologies on our platform (the "Platform"). It
        should be read alongside our{' '}
        <Link to="/legal/privacy">Privacy Policy</Link>.
      </p>

      <h2>1. What cookies are</h2>
      <p>Cookies are small text files stored on your device when you visit a website. Similar technologies, such as local storage, work in comparable ways. They help a site remember your actions and preferences, keep you signed in, and understand how the site is used.</p>

      <h2>2. How we use them</h2>
      <p>We use cookies and similar technologies to:</p>
      <p><strong>Keep the Platform working.</strong> These are necessary for core features, such as signing you in, keeping you signed in, and remembering your session. The Platform does not work properly without them.</p>
      <p><strong>Remember your preferences.</strong> These remember choices you make, so you don't have to set them each time.</p>
      <p><strong>Understand usage.</strong> These help us see how the Platform is used so we can improve it. This information is used in aggregate wherever possible.</p>
      <p>We do not use cookies to sell your information.</p>

      <h2>3. Third-party cookies</h2>
      <p>Some cookies are set by the services we use to run the Platform, such as our hosting provider (Google Firebase) and our payment processor (PayFast) during checkout. These providers set cookies to deliver their part of the service. Their use of cookies is governed by their own policies.</p>

      <h2>4. Managing cookies</h2>
      <p>You can control cookies through your browser settings, including blocking or deleting them. If you block cookies that are necessary for the Platform to work, some features may not function properly, including signing in.</p>
      <p>Most browsers let you:</p>
      <ul>
        <li>see what cookies are stored and delete them;</li>
        <li>block cookies from specific sites or all sites;</li>
        <li>clear cookies when you close the browser.</li>
      </ul>
      <p>Check your browser's help pages for how to do this.</p>

      <h2>5. Changes to this policy</h2>
      <p>We may update this policy as our use of cookies changes. The "last updated" date shows when it last changed.</p>

      <h2>6. Contact</h2>
      <p>For any question about this policy, please use our <Link to="/#contact">contact form</Link>.</p>
    </LegalLayout>
  )
}
