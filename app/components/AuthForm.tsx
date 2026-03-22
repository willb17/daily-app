'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AuthForm() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError('')

    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
    } else {
      setSent(true)
      setLoading(false)
    }
  }

  return (
    <div style={{
      background: 'var(--paper)',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--mono)',
      padding: '40px 24px',
    }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>

        {/* Logo */}
        <div style={{
          fontSize: '13px',
          fontWeight: 600,
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
          color: 'var(--ink)',
          marginBottom: '8px',
        }}>
          Daily
        </div>
        <div style={{
          fontSize: '11px',
          color: 'var(--ink-light)',
          letterSpacing: '0.05em',
          marginBottom: '48px',
          paddingBottom: '20px',
          borderBottom: '1px solid var(--rule-dark)',
        }}>
          your personal daily operating system
        </div>

        {sent ? (
          <div>
            <div style={{
              fontSize: '9px',
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
              color: 'var(--green)',
              marginBottom: '16px',
            }}>
              ✓ Link sent
            </div>
            <div style={{
              fontSize: '13px',
              color: 'var(--ink-mid)',
              lineHeight: '1.7',
              marginBottom: '32px',
            }}>
              Check your inbox at <strong style={{ color: 'var(--ink)' }}>{email}</strong>.
              Click the link to sign in — no password needed.
            </div>
            <button
              onClick={() => { setSent(false); setEmail('') }}
              style={{
                background: 'none',
                border: 'none',
                fontFamily: 'var(--mono)',
                fontSize: '10px',
                letterSpacing: '0.15em',
                color: 'var(--ink-faint)',
                cursor: 'pointer',
                textTransform: 'uppercase',
                padding: '0',
              }}
            >
              ← use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{
              fontSize: '9px',
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
              color: 'var(--ink-faint)',
              marginBottom: '20px',
            }}>
              Sign in with magic link
            </div>

            <div style={{ marginBottom: '16px' }}>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                autoFocus
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--rule-dark)',
                  fontFamily: 'var(--mono)',
                  fontSize: '14px',
                  color: 'var(--ink)',
                  padding: '10px 0',
                  outline: 'none',
                }}
                onFocus={e => { e.target.style.borderBottomColor = 'var(--ink)' }}
                onBlur={e => { e.target.style.borderBottomColor = 'var(--rule-dark)' }}
              />
            </div>

            {error && (
              <div style={{
                fontSize: '11px',
                color: 'var(--red)',
                marginBottom: '12px',
                fontStyle: 'italic',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              style={{
                width: '100%',
                background: loading || !email.trim() ? 'var(--ink-faint)' : 'var(--ink)',
                color: 'var(--paper)',
                border: 'none',
                padding: '14px',
                fontFamily: 'var(--mono)',
                fontSize: '11px',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                cursor: loading || !email.trim() ? 'default' : 'pointer',
                transition: 'opacity 0.15s',
              }}
            >
              {loading ? 'sending...' : 'send magic link →'}
            </button>

            <div style={{
              marginTop: '24px',
              fontSize: '10px',
              color: 'var(--ink-faint)',
              fontStyle: 'italic',
              lineHeight: '1.6',
            }}>
              No password. We&apos;ll email you a one-click sign-in link.
              Works for both new and existing accounts.
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
