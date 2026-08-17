import { createContext, useContext, useEffect, useState } from 'react'
import { auth, setApiToken } from './backend'

const AuthCtx = createContext(null)

const DEFAULT_DEMO_EMAIL = 'admin@tims.io'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const boot = async () => {
      try {
        // Restore an existing session (Supabase JWT or demo session)
        const s = await auth.getSession()
        if (s) {
          if (active) { setUser(s.user); setApiToken(s.token) }
        } else if (auth.isDemo) {
          // No login page — automatically sign in with the default portal account
          const s2 = await auth.signIn(DEFAULT_DEMO_EMAIL, auth.demoPassword)
          if (active) { setUser(s2.user); setApiToken(s2.token) }
        }
        // In production mode with a real backend, a valid session is required.
        // Sessions are restored automatically; see docs/DATABASE_SETUP.md.
      } catch {
        /* no session available — app still renders */
      } finally {
        if (active) setLoading(false)
      }
    }
    boot()
    return () => { active = false }
  }, [])

  // Demo-mode helper: switch the active role/account for testing (replaces the login page)
  const switchUser = async (email) => {
    if (!auth.isDemo) return null
    try {
      const s = await auth.signIn(email, auth.demoPassword)
      setUser(s.user)
      setApiToken(s.token)
      return s.user
    } catch {
      return null
    }
  }

  return <AuthCtx.Provider value={{ user, loading, switchUser }}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
