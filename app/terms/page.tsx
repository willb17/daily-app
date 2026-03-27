export default function TermsPage() {
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
          Terms of Service
        </h1>
        <div style={{ fontSize: '11px', color: 'var(--ink-faint)', marginBottom: '48px', paddingBottom: '24px', borderBottom: '1px solid var(--rule-dark)' }}>
          Last updated: March 2025
        </div>

        <Section title="Personal use">
          Daily is a personal productivity tool intended for individual use only. By using this app, you agree to use it solely for your own personal planning and productivity purposes.
        </Section>

        <Section title="SMS reminders">
          If you provide a phone number, you will receive daily SMS reminder messages. Message frequency is approximately one message per day. Message and data rates may apply depending on your mobile carrier and plan.
        </Section>

        <Section title="Opt-out">
          You can opt out of SMS reminders at any time by replying STOP to any message. You will receive a confirmation and no further messages will be sent. You can re-enable reminders in the app settings at any time.
        </Section>

        <Section title="Help">
          Reply HELP to any SMS message for support information, or contact us directly at the email address below.
        </Section>

        <Section title="Availability">
          This app is provided as-is for personal use. There are no guarantees of uptime or availability. Features may change at any time.
        </Section>

        <Section title="Contact">
          For questions, support, or to request account deletion, contact:{' '}
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
