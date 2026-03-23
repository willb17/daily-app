import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Explicit localStorage keeps sessions alive when the app is reopened
    // from the iPhone home screen (PWA context has its own storage scope).
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    storageKey: 'daily-app-auth',
    detectSessionInUrl: true,
  },
})
