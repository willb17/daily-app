'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

type Mode = 'magic' | 'password'
type PwView = 'signin' | 'signup'

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(26,24,20,0.03)',
  border: 'none',
  borderBottom: '1.5px solid var(--ink-faint)',
  fontFamily: 'var(--mono)',
  fontSize: '14px',
  color: 'var(--ink)',
  padding: '10px 6px',
  outline: 'none',
}

const btnStyle = (disabled: boolean): React.CSSProperties => ({
  width: '100%',
  background: disabled ? 'var(--ink-faint)' : 'var(--ink)',
  color: 'var(--paper)',
  border: 'none',
  padding: '14px',
  fontFamily: 'var(--mono)',
  fontSize: '11px',
  letterSpacing: '0.15em',
  textTransform: 'uppercase' as const,
  cursor: disabled ? 'default' : 'pointer',
  transition: 'opacity 0.15s',
})

const labelStyle: React.CSSProperties = {
  fontSize: '9px',
  letterSpacing: '0.2em',
  textTransform: 'uppercase',
  color: 'var(--ink-faint)',
  marginBottom: '8px',
}

export default function AuthForm() {
  const [mode, setMode] = useState<Mode>('password')
  const [pwView, setPwView] = useState<PwView>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  function switchMode(m: Mode) {
    setMode(m)
    setError('')
    setInfo('')
  }

  // ── Magic link ──────────────────────────────────────────────────────────
  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true); setError('')
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setLoading(false)
    if (err) setError(err.message)
    else setInfo(`Link sent to ${email}. Check your inbox.`)
  }

  // ── Password sign-in ────────────────────────────────────────────────────
  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setLoading(true); setError('')
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setLoading(false)
    if (err) setError(err.message)
    // on success page.tsx detects session via onAuthStateChange
  }

  // ── Password sign-up ────────────────────────────────────────────────────
  async function signUpWithPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setLoading(true); setError('')
    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    // If identities is empty the email already exists — prompt to sign in instead
    if (data.user && data.user.identities?.length === 0) {
      setError('An account with this email already exists. Try signing in.')
      setPwView('signin')
      return
    }
    // If session is null, email confirmation is required
    if (!data.session) {
      setInfo('Account created. Check your inbox to confirm your email, then sign in.')
      setPwView('signin')
    }
    // If session exists, onAuthStateChange handles redirect automatically
  }

  // ── Shared header ───────────────────────────────────────────────────────
  const header = (
    <>
      <div style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--ink)', marginBottom: '8px' }}>
        Daily
      </div>
      <div style={{ fontSize: '11px', color: 'var(--ink-light)', letterSpacing: '0.05em', marginBottom: '36px', paddingBottom: '20px', borderBottom: '1px solid var(--rule-dark)' }}>
        your personal daily operating system
      </div>

      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '28px', borderBottom: '1px solid var(--rule-dark)' }}>
        {(['password', 'magic'] as Mode[]).map(m => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: mode === m ? '2px solid var(--ink)' : '2px solid transparent',
              fontFamily: 'var(--mono)',
              fontSize: '10px',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: mode === m ? 'var(--ink)' : 'var(--ink-faint)',
              cursor: 'pointer',
              padding: '0 0 10px',
              marginBottom: '-1px',
              marginRight: '24px',
            }}
          >
            {m === 'password' ? 'Password' : 'Magic link'}
          </button>
        ))}
      </div>
    </>
  )

  // ── Password mode ───────────────────────────────────────────────────────
  if (mode === 'password') {
    return (
      <div style={{ background: 'var(--paper)', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>
          {header}

          <div style={{ fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: '20px' }}>
            {pwView === 'signin' ? 'Sign in' : 'Create account'}
          </div>

          <form onSubmit={pwView === 'signin' ? signInWithPassword : signUpWithPassword}>
            <div style={{ marginBottom: '14px' }}>
              <div style={labelStyle}>Email</div>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                autoFocus
                style={inputStyle}
                onFocus={e => { e.target.style.borderBottomColor = 'var(--ink)' }}
                onBlur={e => { e.target.style.borderBottomColor = 'var(--ink-faint)' }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={labelStyle}>Password</div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={pwView === 'signup' ? 'choose a password' : '••••••••'}
                  required
                  style={{ ...inputStyle, paddingRight: '40px' }}
                  onFocus={e => { e.target.style.borderBottomColor = 'var(--ink)' }}
                  onBlur={e => { e.target.style.borderBottomColor = 'var(--ink-faint)' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--ink-faint)', cursor: 'pointer', letterSpacing: '0.05em' }}
                >
                  {showPw ? 'hide' : 'show'}
                </button>
              </div>
            </div>

            {error && <div style={{ fontSize: '11px', color: 'var(--red)', marginBottom: '12px', fontStyle: 'italic' }}>{error}</div>}
            {info  && <div style={{ fontSize: '11px', color: 'var(--green)', marginBottom: '12px' }}>{info}</div>}

            <button type="submit" disabled={loading || !email.trim() || !password} style={btnStyle(loading || !email.trim() || !password)}>
              {loading ? 'please wait...' : pwView === 'signin' ? 'Sign in →' : 'Create account →'}
            </button>
          </form>

          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            {pwView === 'signin' ? (
              <button onClick={() => { setPwView('signup'); setError(''); setInfo('') }} style={{ background: 'none', border: 'none', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--ink-faint)', cursor: 'pointer', letterSpacing: '0.1em' }}>
                No account? Create one →
              </button>
            ) : (
              <button onClick={() => { setPwView('signin'); setError(''); setInfo('') }} style={{ background: 'none', border: 'none', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--ink-faint)', cursor: 'pointer', letterSpacing: '0.1em' }}>
                ← Already have an account? Sign in
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Magic link mode ─────────────────────────────────────────────────────
  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', padding: '40px 24px' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        {header}

        {info ? (
          <div>
            <div style={{ fontSize: '9px', letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--green)', marginBottom: '16px' }}>✓ Link sent</div>
            <div style={{ fontSize: '13px', color: 'var(--ink-mid)', lineHeight: '1.7', marginBottom: '32px' }}>
              Check your inbox at <strong style={{ color: 'var(--ink)' }}>{email}</strong>. Click the link to sign in.
            </div>
            <button onClick={() => { setInfo(''); setEmail('') }} style={{ background: 'none', border: 'none', fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '0.15em', color: 'var(--ink-faint)', cursor: 'pointer', textTransform: 'uppercase', padding: '0' }}>
              ← use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={sendMagicLink}>
            <div style={{ fontSize: '9px', letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: '20px' }}>
              Sign in — no password needed
            </div>
            <div style={{ marginBottom: '16px' }}>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                autoFocus
                style={inputStyle}
                onFocus={e => { e.target.style.borderBottomColor = 'var(--ink)' }}
                onBlur={e => { e.target.style.borderBottomColor = 'var(--ink-faint)' }}
              />
            </div>
            {error && <div style={{ fontSize: '11px', color: 'var(--red)', marginBottom: '12px', fontStyle: 'italic' }}>{error}</div>}
            <button type="submit" disabled={loading || !email.trim()} style={btnStyle(loading || !email.trim())}>
              {loading ? 'sending...' : 'send magic link →'}
            </button>
            <div style={{ marginTop: '20px', fontSize: '10px', color: 'var(--ink-faint)', fontStyle: 'italic', lineHeight: '1.6' }}>
              We&apos;ll email you a one-click sign-in link. Works for new and existing accounts.
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
