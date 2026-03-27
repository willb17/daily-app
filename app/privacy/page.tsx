export default function PrivacyPage() {
  return (
    <div style={{
      background: 'var(--paper)',
      minHeight: '100vh',
      fontFamily: 'var(--mono)',
      color: 'var(--ink)',
      padding: '60px 24px',
    }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>

        <div style={{ fontSize: '10px', letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: '8px' }}>
          Daily
        </div>
        <h1 style={{ fontSize: '18px', fontWeight: 600, letterSpacing: '0.05em', margin: '0 0 8px' }}>
          Privacy Policy
        </h1>
        <div style={{ fontSize: '11px', color: 'var(--ink-faint)', marginBottom: '48px', paddingBottom: '24px', borderBottom: '1px solid var(--rule-dark)' }}>
          Last updated: March 2025
        </div>

        <Section title="What this app is">
          Daily is a personal productivity app for planning your day. It is designed for individual personal use.
        </Section>

        <Section title="Data storage">
          Your data — tasks, notes, anchors, and settings — is stored securely in Supabase, a managed cloud database. Data is associated with your account and is not accessible to other users.
        </Section>

        <Section title="Data sharing">
          We do not share, sell, or disclose your personal data to any third parties. Your data is used solely to operate the app for your personal use.
        </Section>

        <Section title="SMS &amp; push notifications">
          Morning reminder notifications (SMS and/or push) are sent only to the account owner at the phone number or device you have registered. You can opt out at any time by replying STOP to any SMS message, or by disabling notifications in the app settings.
        </Section>

        <Section title="Email">
          If you provide an email address, it is used to send you daily summaries and sign-in links. It is not used for marketing and is not shared with third parties.
        </Section>

        <Section title="Cookies &amp; analytics">
          This app does not use tracking cookies or third-party analytics.
        </Section>

        <Section title="Contact">
          For any privacy questions or data deletion requests, contact:{' '}
          <a href="mailto:william.bitsky@gmail.com" style={{ color: 'var(--ink)', textDecoration: 'underline' }}>
            william.bitsky@gmail.com
          </a>
        </Section>

        <div style={{ marginTop: '48px', paddingTop: '24px', borderTop: '1px solid var(--rule-dark)' }}>
          <a href="/" style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--ink-faint)', textDecoration: 'none' }}>
            ← Back to app
          </a>
        </div>

      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '32px' }}>
      <div style={{ fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: '10px' }}>
        {title}
      </div>
      <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.8', color: 'var(--ink-mid)' }}>
        {children}
      </p>
    </div>
  )
}
