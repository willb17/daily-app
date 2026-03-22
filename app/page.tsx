'use client'

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import AuthForm from './components/AuthForm'
import DailyApp from './components/DailyApp'

export default function Page() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
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
        loading...
      </div>
    )
  }

  if (!user) return <AuthForm />

  return (
    <DailyApp
      userId={user.id}
      userEmail={user.email ?? ''}
      onSignOut={() => supabase.auth.signOut()}
    />
  )
}
