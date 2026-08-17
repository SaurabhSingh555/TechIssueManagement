// Real API client for the FastAPI backend.
// Used automatically when VITE_API_URL and VITE_SUPABASE_URL are configured.
// Authentication: Supabase JWT sent as `Authorization: Bearer <token>`.
// The FastAPI backend verifies the JWT server-side (Supabase service role key
// never leaves the backend).

import { createClient } from '@supabase/supabase-js'

const API_URL = (import.meta.env.VITE_API_URL || 'https://tech-issue-management.vercel.app').replace(/\/$/, '')
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message)
    this.status = status
    this.data = data
  }
}

export function createRealAuth() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: true, autoRefreshToken: true },
  })

  return {
    async signIn(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw new Error(error.message)
      // Load the user's role from the `users` table (RLS: own row readable)
      const { data: profile, error: profileError } = await supabase
        .from('users').select('*').eq('id', data.user.id).maybeSingle()
      if (profileError || !profile) throw new Error('User profile not found. Ask an admin to add you to the users table.')
      const user = {
        id: data.user.id, email: data.user.email, name: profile.name,
        role: profile.role, active: profile.active,
      }
      if (!user.active) throw new Error('Your account is inactive. Contact an administrator.')
      return { user, token: data.session.access_token }
    },
    async signOut() { await supabase.auth.signOut() },
    async getSession() {
      const { data } = await supabase.auth.getSession()
      if (!data.session) return null
      const { data: profile } = await supabase.from('users').select('*').eq('id', data.session.user.id).maybeSingle()
      if (!profile) return null
      return {
        user: { id: data.session.user.id, email: data.session.user.email, name: profile.name, role: profile.role, active: profile.active },
        token: data.session.access_token,
      }
    },
  }
}

function buildRequest(getToken) {
  return async (path, { method = 'GET', body, params } = {}) => {
    const token = typeof getToken === 'function' ? getToken() : null
    const qs = params
      ? '?' + new URLSearchParams(
          Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v])
        ).toString()
      : ''
    const res = await fetch(`${API_URL}/api${path}${qs}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      let detail = null
      try { detail = await res.json() } catch { /* ignore */ }
      const message = detail?.detail?.msg || detail?.detail || `Request failed (${res.status})`
      const err = new ApiError(message, res.status, detail)
      throw err
    }
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('text/csv')) return await res.text()
    return res.status === 204 ? null : res.json()
  }
}

export function createRealApi(getToken) {
  const req = buildRequest(getToken)

  const api = {
    isDemo: false,
    issues: {
      list: (f = {}) => req('/issues', { params: f }),
      get: (id) => req(`/issues/${id}`),
      create: (payload) => req('/issues', { method: 'POST', body: payload }),
      update: (id, payload) => req(`/issues/${id}`, { method: 'PUT', body: payload }),
      canClose: (id) => req(`/issues/${id}/can-close`),
      close: (id, remarks) => req(`/issues/${id}/close`, { method: 'POST', body: { remarks } }),
      reopen: (id, data) => req(`/issues/${id}/reopen`, { method: 'POST', body: data }),
    },
    rca: {
      list: (issueId) => req('/rca', { params: { issue_id: issueId } }),
      create: (issueId, data) => req(`/issues/${issueId}/rca`, { method: 'POST', body: data }),
      update: (id, data) => req(`/rca/${id}`, { method: 'PUT', body: data }),
    },
    solutions: {
      list: (issueId) => req('/solutions', { params: { issue_id: issueId } }),
      create: (issueId, data) => req(`/issues/${issueId}/solutions`, { method: 'POST', body: data }),
      update: (id, data) => req(`/solutions/${id}`, { method: 'PUT', body: data }),
    },
    checks: {
      list: (issueId) => req('/client-checks', { params: { issue_id: issueId } }),
      start: (issueId) => req(`/issues/${issueId}/client-check/start`, { method: 'POST' }),
      update: (checkId, data) => req(`/client-checks/${checkId}`, { method: 'PUT', body: data }),
      summary: (issueId) => req(`/issues/${issueId}/client-check/summary`),
    },
    monitoring: {
      list: (issueId) => req('/monitoring', { params: { issue_id: issueId } }),
      start: (issueId, periodDays) => req(`/issues/${issueId}/monitoring/start`, { method: 'POST', body: { period_days: periodDays } }),
      addLog: (issueId, data) => req(`/issues/${issueId}/monitoring/logs`, { method: 'POST', body: data }),
    },
    recurrence: {
      list: () => req('/recurrence'),
      create: (issueId, data) => req(`/issues/${issueId}/recurrence`, { method: 'POST', body: data }),
    },
    similar: {
      find: (id, searchText) => req(`/issues/${id}/find-similar`, { method: 'POST', body: { search_text: searchText || '' } }),
      list: (id) => req(`/issues/${id}/similar`),
    },
    relationships: {
      list: (id) => req(`/issues/${id}/relationships`),
      create: (id, data) => req(`/issues/${id}/relationships`, { method: 'POST', body: data }),
      confirm: (id, data) => req(`/issues/${id}/confirm-similar`, { method: 'POST', body: data }),
    },
    knowledge: {
      search: (params) => req('/issues/search', { params }),
    },
    dashboard: { get: (f = {}) => req('/dashboard', { params: f }) },
    reports: {
      get: (type, f = {}) => req(`/reports/${type}`, { params: f }),
      export: (type, f = {}) => req(`/reports/${type}/export`, { params: f }),
    },
    audit: { list: (f = {}) => req('/audit-logs', { params: f }) },
    clients: {
      list: () => req('/settings/clients'),
      save: (c) => req(c.id ? `/settings/clients/${c.id}` : '/settings/clients', { method: c.id ? 'PUT' : 'POST', body: c }),
      remove: (id) => req(`/settings/clients/${id}`, { method: 'DELETE' }),
    },
    processes: {
      list: () => req('/settings/processes'),
      save: (p) => req(p.id ? `/settings/processes/${p.id}` : '/settings/processes', { method: p.id ? 'PUT' : 'POST', body: p }),
      remove: (id) => req(`/settings/processes/${id}`, { method: 'DELETE' }),
    },
    categories: {
      list: () => req('/settings/categories'),
      save: (c) => req(c.id ? `/settings/categories/${c.id}` : '/settings/categories', { method: c.id ? 'PUT' : 'POST', body: c }),
      remove: (id) => req(`/settings/categories/${id}`, { method: 'DELETE' }),
    },
    users: {
      list: () => req('/settings/users'),
      save: (u) => req(`/settings/users/${u.id}`, { method: 'PUT', body: u }),
    },
    settings: {
      get: () => req('/settings'),
      saveSla: (sla) => req('/settings/sla', { method: 'PUT', body: sla }),
      savePeriods: (periods) => req('/settings/monitoring-periods', { method: 'PUT', body: { periods } }),
      saveSimilarity: (s) => req('/settings/similarity', { method: 'PUT', body: s }),
      listRecipients: () => req('/settings/recipients'),
      saveRecipient: (r) => req(r.id ? `/settings/recipients/${r.id}` : '/settings/recipients', { method: r.id ? 'PUT' : 'POST', body: r }),
      removeRecipient: (id) => req(`/settings/recipients/${id}`, { method: 'DELETE' }),
    },
    notifications: {
      list: () => req('/notifications'),
      markRead: (id) => req(`/notifications/${id}/read`, { method: 'POST' }),
    },
    attachments: {
      list: (issueId) => req(`/issues/${issueId}/attachments`),
      upload: async (issueId, file) => {
        const form = new FormData()
        form.append('file', file)
        const res = await fetch(`${API_URL}/api/issues/${issueId}/attachments`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${getToken()}` },
          body: form,
        })
        if (!res.ok) throw new ApiError('Upload failed', res.status)
        return res.json()
      },
    },
  }
  return api
}
