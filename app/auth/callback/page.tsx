'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// Handles the magic-link redirect. Supabase appends ?code=... to this URL;
// the client exchanges it for a session, then we redirect home.
export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(() => {
      router.replace('/')
    })
  }, [router])

  return (
    <div style={{
      background: 'var(--paper)',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--mono)',
      fontSize: '11px',
      color: 'var(--ink-faint)',
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
    }}>
      signing you in...
    </div>
  )
}
