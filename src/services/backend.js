// Unified backend facade.
// - When VITE_API_URL + VITE_SUPABASE_URL are configured: real FastAPI backend
//   + Supabase Auth (see services/api.js).
// - Otherwise: in-browser demo backend (services/demoData.js) so the portal can
//   be previewed end-to-end without infrastructure.
// Business rules (closure engine, recurrence, client-wide checks) are ALWAYS
// enforced server-side in production by the FastAPI backend.

import { demoApi, demoAuth } from './demoData'
import { createRealApi, createRealAuth } from './api'

const hasRealBackend = !!(import.meta.env.VITE_API_URL && import.meta.env.VITE_SUPABASE_URL)

export const isDemoMode = !hasRealBackend

// Token holder for the real API client
let tokenRef = { token: null }

export const auth = hasRealBackend ? createRealAuth() : demoAuth

export const api = hasRealBackend
  ? createRealApi(() => tokenRef.token)
  : (() => {
      // Inject the current demo user into every mutation so audit trails are correct
      const wrap = (obj, parent) => {
        const out = {}
        for (const k of Object.keys(obj)) {
          if (typeof obj[k] === 'function') {
            out[k] = (...args) => {
              const user = getDemoUser()
              const fn = obj[k]
              // mutations defined as (payload, user) or (issueId, data, user)
              return fn(...args, user)
            }
          } else {
            out[k] = obj[k]
          }
        }
        return out
      }
      const wrapped = {}
      for (const ns of Object.keys(demoApi)) wrapped[ns] = wrap(demoApi[ns])
      return wrapped
    })()

function getDemoUser() {
  try {
    const s = JSON.parse(localStorage.getItem('tims.demo.session') || 'null')
    if (!s) return null
    return (demoAuth.demoUsers || []).find((u) => u.id === s.userId) || null
  } catch {
    return null
  }
}

export function setApiToken(token) {
  tokenRef.token = token
}

export function getApiToken() {
  return tokenRef.token
}
