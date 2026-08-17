// ============================================================
// DEMO BACKEND (in-browser)
// Active ONLY when VITE_API_URL / VITE_SUPABASE_URL are not configured,
// so the portal can be previewed without infrastructure. It mirrors the
// FastAPI backend 1:1 including the closure engine, recurrence rules,
// client-wide checks, monitoring, SLA and audit logging.
//
// NO DUMMY DATA — the system starts with a clean, empty database.
// Build your own clients, processes, categories and issues through the
// portal (created data is kept for the current browser session).
// ============================================================

const DAY = 86400000
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2))
const latency = (ms = 180) => new Promise((r) => setTimeout(r, ms))
const today = () => new Date().toISOString().slice(0, 10)

// ---------------- PORTAL ROLE ACCOUNTS (sign-in only — no dummy business data) ----
const users = [
  { id: 'u-admin', email: 'admin@tims.io', name: 'Portal Admin', role: 'admin', active: true },
  { id: 'u-manager', email: 'manager@tims.io', name: 'Issue Manager', role: 'manager', active: true },
  { id: 'u-tech', email: 'tech@tims.io', name: 'Tech Owner', role: 'tech_owner', active: true },
  { id: 'u-viewer', email: 'viewer@tims.io', name: 'Viewer', role: 'viewer', active: true },
]
const DEMO_PASSWORD = 'Password123!'

// ---------------- EMPTY MASTER DATA (create your own via Settings) ----
const clients = []
const processes = []
const categories = []

// ---------------- EMPTY TRANSACTIONAL DATA (no dummy records) ----------------
const issues = []
const rcaLogs = []
const solutions = []
const checks = []
const monitoringLogs = []
const recurrences = []
const auditLogs = []
const notifications = []
const attachments = []

const settings = {
  sla: { Critical: 1, High: 2, Medium: 5, Low: 10 },
  monitoringPeriods: [3, 7, 14, 30],
  recipients: [],
  similarity: { high: 0.9, medium: 0.75 },
}

// AI similarity engine state (in-memory mirror of the backend + pgvector)
const similarityResults = []
const relationships = []

let seq = 0
const state = { users, clients, processes, categories, issues, rcaLogs, solutions, checks, monitoringLogs, recurrences, auditLogs, notifications, attachments, settings, similarityResults, relationships, seq }

// ---------------- helpers ----------------
const clientName = (id) => state.clients.find((c) => c.id === id)?.client_name || '—'
const userName = (id) => state.users.find((u) => u.id === id)?.name || '—'
const byIssue = (id) => state.issues.find((i) => i.id === id || i.issue_id === id)

function audit(user, issue, action, field, oldV, newV) {
  state.auditLogs.unshift({
    id: state.auditLogs.length + 1, user_name: user?.name || 'System', issue_id_text: issue?.issue_id || null,
    action, field_name: field, old_value: oldV ?? null, new_value: newV ?? null, timestamp: new Date().toISOString(),
  })
}

function touch(issue, user) {
  issue.updated_at = new Date().toISOString()
  if (user) issue.updated_by = user.id
}

// ---------------- Closure engine (mirrors FastAPI services/closure.py) ----------------
function canClose(issue) {
  const reasons = []
  const clientNameList = (id) => state.clients.find((c) => c.id === id)?.client_name
  if (!issue.root_cause || !state.rcaLogs.some((r) => r.issue_id === issue.id && r.status === 'Completed'))
    reasons.push('RCA: Root cause missing or RCA not completed')
  if (!issue.permanent_solution || !state.solutions.some((s) => s.issue_id === issue.id && s.solution_type === 'Permanent'))
    reasons.push('Solution: Permanent solution missing')
  if (issue.testing_status !== 'Passed')
    reasons.push('Testing: Not completed (must be Passed)')
  const relevant = state.clients.filter((c) => c.active && c.relevant_for_client_wide_check)
  const issueChecks = state.checks.filter((c) => c.issue_id === issue.id)
  const pending = issue.client_wide_check_required
    ? relevant.filter((c) => !issueChecks.some((ch) => ch.client_id === c.id && ch.check_date))
    : []
  if (pending.length)
    reasons.push(`Client-Wide Check: Pending for ${pending.map((c) => c.client_name).join(', ')}`)
  const affected = issueChecks.filter((ch) => ch.same_issue_found)
  const unfixed = affected.filter((ch) => ch.fix_required && !ch.fix_implemented)
  if (unfixed.length)
    reasons.push(`Affected client fix not implemented: ${unfixed.map((ch) => clientNameList(ch.client_id)).join(', ')}`)
  if (issue.global_fix_required && issue.global_fix_status !== 'Completed')
    reasons.push('Global Fix: Required but not completed')
  if (issue.monitoring_required) {
    if (!issue.monitoring_end_date || new Date(issue.monitoring_end_date) > new Date())
      reasons.push(`Monitoring: Period not elapsed (ends ${issue.monitoring_end_date || '—'})`)
    const logs = state.monitoringLogs.filter((m) => m.issue_id === issue.id)
    if (!logs.length || issue.monitoring_result !== 'Successful')
      reasons.push('Monitoring: No successful result recorded')
  }
  const openRec = state.recurrences.filter((r) => r.original_issue_id === issue.id && !['Resolved', 'Closed'].includes(r.status))
  if (openRec.length)
    reasons.push('Recurrence: Unresolved recurrence record exists')
  return { allowed: reasons.length === 0, blocking_reasons: reasons }
}

// ---------------- API surface ----------------
export const demoApi = {
  isDemo: true,

  issues: {
    async list(f = {}) {
      await latency()
      let items = [...state.issues]
      const q = (f.search || '').toLowerCase()
      if (q) items = items.filter((i) =>
        [i.issue_id, i.issue_title, i.issue_description, clientName(i.client_id), categoryName(i.category_id), userName(i.assigned_to)]
          .filter(Boolean).some((v) => v.toLowerCase().includes(q)))
      if (f.client_id) items = items.filter((i) => i.client_id === f.client_id)
      if (f.process_id) items = items.filter((i) => i.process_id === f.process_id)
      if (f.category_id) items = items.filter((i) => i.category_id === f.category_id)
      if (f.priority) items = items.filter((i) => i.priority === f.priority)
      if (f.status) items = items.filter((i) => i.status === f.status)
      if (f.owner_id) items = items.filter((i) => i.assigned_to === f.owner_id)
      if (f.recurrence) items = items.filter((i) => f.recurrence === 'true' ? i.recurrence : !i.recurrence)
      if (f.date_from) items = items.filter((i) => i.reported_date >= f.date_from)
      if (f.date_to) items = items.filter((i) => i.reported_date <= f.date_to)
      items.sort((a, b) => b.issue_id.localeCompare(a.issue_id))
      const page = Number(f.page || 1), pageSize = Number(f.page_size || 10)
      const total = items.length
      return { items: items.slice((page - 1) * pageSize, page * pageSize), total, page, page_size: pageSize }
    },

    async get(id) {
      await latency()
      const issue = byIssue(id)
      if (!issue) throw new Error('Issue not found')
      return {
        issue: { ...issue, client_name: clientName(issue.client_id), process_name: processName(issue.process_id), category_name: categoryName(issue.category_id), assigned_name: userName(issue.assigned_to) },
        rca: state.rcaLogs.filter((r) => r.issue_id === issue.id),
        solutions: state.solutions.filter((s) => s.issue_id === issue.id),
        checks: state.checks.filter((c) => c.issue_id === issue.id).map((c) => ({ ...c, client_name: clientName(c.client_id) })),
        monitoring: state.monitoringLogs.filter((m) => m.issue_id === issue.id),
        recurrences: state.recurrences.filter((r) => r.original_issue_id === issue.id),
        attachments: state.attachments.filter((a) => a.issue_id === issue.id),
        audit: state.auditLogs.filter((a) => a.issue_id_text === issue.issue_id),
        similar: matchesFor(issue),
        relationships: relsFor(issue),
      }
    },

    async create(payload, user) {
      await latency()
      state.seq += 1
      const year = new Date().getFullYear()
      const issue_id = `TECH-${year}-${String(state.seq).padStart(3, '0')}`
      const issue = {
        id: uid(), issue_id, reported_date: today(), reported_by: payload.reported_by || user?.name || '',
        client_id: payload.client_id, process_id: payload.process_id || null, category_id: payload.category_id || null,
        issue_title: payload.issue_title, issue_description: payload.issue_description || '',
        business_impact: payload.business_impact || '',
        system_name: payload.system_name || null, error_message: payload.error_message || null,
        priority: payload.priority || 'Medium', status: 'New', assigned_to: payload.assigned_to || null,
        root_cause: null, temporary_solution: null, permanent_solution: null, solution_implemented_date: null,
        testing_status: 'Pending', testing_result: '',
        client_wide_check_required: payload.client_wide_check_required ?? false, client_wide_check_status: 'Pending',
        global_fix_required: false, global_fix_status: 'Not Required',
        monitoring_required: payload.monitoring_required ?? false, monitoring_period: null,
        monitoring_start_date: null, monitoring_end_date: null, monitoring_result: null,
        recurrence: false, recurrence_count: 0, final_closure_status: null, closure_date: null, closure_remarks: null,
        created_by: user?.id || null, updated_by: user?.id || null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }
      state.issues.push(issue)
      audit(user, issue, 'Issue Created', 'status', null, 'New')
      if (payload.attachment && payload.attachment.file_name)
        state.attachments.push({ id: uid(), issue_id: issue.id, file_name: payload.attachment.file_name, file_type: payload.attachment.file_type || 'file', uploaded_by: user?.name, created_at: new Date().toISOString() })
      state.notifications.unshift({ id: state.notifications.length + 1, issue_id_text: issue.issue_id, type: ['Critical', 'High'].includes(issue.priority) ? 'New ' + issue.priority + ' Issue' : 'New Issue', subject: `New issue: ${issue.issue_id}`, message: `${issue.priority} issue created for ${clientName(issue.client_id)}.`, sent_at: new Date().toISOString(), read: false })
      // AI: automatic previous-issue recognition on creation (server-side in production)
      computeMatchesFor(issue)
      return { ...issue, similar_matches: matchesFor(issue) }
    },

    async update(id, payload, user) {
      await latency()
      const issue = byIssue(id)
      if (!issue) throw new Error('Issue not found')
      for (const k of ['issue_title', 'issue_description', 'business_impact', 'priority', 'status', 'assigned_to', 'client_id', 'process_id', 'category_id', 'system_name', 'error_message', 'root_cause', 'temporary_solution', 'permanent_solution', 'solution_implemented_date', 'testing_status', 'testing_result', 'global_fix_required', 'global_fix_status', 'monitoring_required']) {
        if (payload[k] !== undefined && payload[k] !== issue[k]) {
          if (k === 'priority' || k === 'status' || k === 'assigned_to') {
            const labels = { status: 'Status Change', priority: 'Priority Change', assigned_to: 'Assignment' }
            const oldV = k === 'assigned_to' ? userName(issue[k]) : issue[k]
            const newV = k === 'assigned_to' ? userName(payload[k]) : payload[k]
            audit(user, issue, labels[k], k, oldV, newV)
          }
          issue[k] = payload[k]
        }
      }
      touch(issue, user)
      // re-run the similarity search if search-relevant fields changed
      if (['issue_title', 'issue_description', 'system_name', 'error_message'].some((k) => payload[k] !== undefined && payload[k] !== issue[k])) {
        computeMatchesFor(issue)
      }
      return issue
    },

    async canClose(id) {
      await latency()
      const issue = byIssue(id)
      return canClose(issue)
    },

    async close(id, remarks, user) {
      await latency()
      const issue = byIssue(id)
      const check = canClose(issue)
      if (!check.allowed) {
        audit(user, issue, 'Closure Blocked', 'closure', null, `Blocked: ${check.blocking_reasons.join('; ')}`)
        const err = new Error('Issue cannot be closed. Blocking reasons:\n• ' + check.blocking_reasons.join('\n• '))
        err.blocking_reasons = check.blocking_reasons
        throw err
      }
      issue.status = 'Resolved'
      const rec = { old: issue.final_closure_status || 'Resolved', val: 'Closed' }
      issue.final_closure_status = 'Closed'
      issue.closure_date = new Date().toISOString()
      issue.closure_remarks = remarks || ''
      issue.updated_at = new Date().toISOString()
      issue.updated_by = user?.id
      audit(user, issue, 'Closure', 'final_closure_status', rec.old, rec.val)
      return issue
    },

    async reopen(id, data, user) {
      await latency()
      const issue = byIssue(id)
      if (!issue) throw new Error('Issue not found')
      if (!['Closed', 'Resolved'].includes(issue.status) && !issue.recurrence)
        throw new Error('Only a closed/resolved issue can be reopened as a recurrence.')
      issue.recurrence = true
      issue.recurrence_count = (issue.recurrence_count || 0) + 1
      issue.status = 'Reopened'
      issue.final_closure_status = 'Reopened'
      issue.testing_status = 'Pending'
      issue.client_wide_check_status = 'Pending'
      issue.global_fix_required = false
      issue.global_fix_status = 'Not Required'
      issue.monitoring_result = null
      issue.monitoring_start_date = null
      issue.monitoring_end_date = null
      issue.permanent_solution = null
      state.recurrences.unshift({
        id: uid(), original_issue_id: issue.id, recurrence_date: today(), client_id: issue.client_id, same_issue: true,
        recurrence_description: data.description || 'Issue recurred. New RCA and corrective action cycle started.',
        new_rca_required: true, new_rca: data.rca || '', new_solution: '', preventive_action: '',
        owner: userName(issue.assigned_to) || '', status: 'Under RCA', closure_date: null,
        remarks: 'Original closure history preserved.', created_at: new Date().toISOString(),
      })
      touch(issue, user)
      audit(user, issue, 'Issue Reopened', 'recurrence', 'false', 'true')
      audit(user, issue, 'Recurrence Recorded', 'recurrence_tracker', null, 'Same issue — new RCA required')
      return issue
    },
  },

  rca: {
    async list(issueId) { await latency(); return state.rcaLogs.filter((r) => !issueId || r.issue_id === issueId || byIssue(issueId)?.id === r.issue_id).map((r) => ({ ...r, issue_id_text: byIssue(r.issue_id)?.issue_id })) },
    async create(issueId, data, user) {
      await latency()
      const issue = byIssue(issueId)
      if (!issue) throw new Error('Issue not found')
      state.rcaLogs.forEach((r) => { if (r.issue_id === issue.id && r.status === 'In Progress') r.status = 'Superseded' })
      const rec = { id: uid(), issue_id: issue.id, rca_date: today(), ...data, created_by: user?.id, created_at: new Date().toISOString() }
      state.rcaLogs.push(rec)
      if (!issue.root_cause) issue.root_cause = data.root_cause
      if (issue.status === 'New' || issue.status === 'Under Investigation') issue.status = 'RCA In Progress'
      touch(issue, user)
      audit(user, issue, 'RCA Added', 'rca_logs', null, (data.root_cause || '').slice(0, 60))
      return rec
    },
    async update(id, data, user) {
      await latency()
      const rec = state.rcaLogs.find((r) => r.id === id)
      if (!rec) throw new Error('RCA record not found')
      if (data.verified) {
        rec.verified_at = new Date().toISOString()
        rec.verified_by = data.verified_by || user?.name || ''
        audit(user, byIssue(rec.issue_id), 'RCA Verified', 'rca_logs', null, 'Verification recorded')
      }
      Object.assign(rec, data)
      touch(byIssue(rec.issue_id), user)
      return rec
    },
  },

  solutions: {
    async list(issueId) { await latency(); return state.solutions.filter((s) => !issueId || s.issue_id === issueId || byIssue(issueId)?.id === s.issue_id) },
    async create(issueId, data, user) {
      await latency()
      const issue = byIssue(issueId)
      if (!issue) throw new Error('Issue not found')
      const rec = { id: uid(), issue_id: issue.id, proposed_date: today(), created_at: new Date().toISOString(), ...data }
      state.solutions.push(rec)
      if (data.solution_type === 'Permanent') {
        issue.permanent_solution = data.solution_description
        if (issue.status === 'RCA In Progress') issue.status = 'Solution Proposed'
      } else issue.temporary_solution = data.solution_description
      touch(issue, user)
      audit(user, issue, 'Solution Added', 'solutions', null, `${data.solution_type}: ${(data.solution_description || '').slice(0, 60)}`)
      if (data.solution_effective === 'Not Effective') {
        issue.status = 'Under Investigation'
        audit(user, issue, 'Solution Not Effective', 'status', 'Testing', 'Under Investigation')
      }
      return rec
    },
    async update(id, data, user) {
      await latency()
      const rec = state.solutions.find((s) => s.id === id)
      if (!rec) throw new Error('Solution not found')
      Object.assign(rec, data)
      const issue = byIssue(rec.issue_id)
      if (data.solution_effective === 'Not Effective' && issue) {
        issue.status = 'Under Investigation'
        audit(user, issue, 'Solution Not Effective', 'status', 'Testing', 'Under Investigation')
      }
      if (data.testing_status === 'Passed' && issue) { issue.testing_status = 'Passed'; issue.testing_result = data.testing_result || issue.testing_result }
      return rec
    },
  },

  checks: {
    async list(issueId) { await latency(); return state.checks.filter((c) => !issueId || c.issue_id === issueId || byIssue(issueId)?.id === c.issue_id).map((c) => ({ ...c, client_name: clientName(c.client_id) })) },
    async start(issueId, user) {
      await latency()
      const issue = byIssue(issueId)
      if (!issue) throw new Error('Issue not found')
      const relevant = state.clients.filter((c) => c.active && c.relevant_for_client_wide_check)
      let created = 0
      relevant.forEach((c) => {
        if (!state.checks.some((ch) => ch.issue_id === issue.id && ch.client_id === c.id)) {
          state.checks.push({ id: uid(), issue_id: issue.id, client_id: c.id, checked_by: '', check_date: null, same_issue_found: false, severity: '', impact: '', fix_required: false, fix_implemented: false, monitoring_required: false, monitoring_status: 'Pending', remarks: '' })
          created++
        }
      })
      issue.client_wide_check_status = 'In Progress'
      touch(issue, user)
      audit(user, issue, 'Client-Wide Check Started', 'client_wide_check_status', 'Pending', 'In Progress')
      return { created, total: relevant.length, rows: state.checks.filter((c) => c.issue_id === issue.id).map((c) => ({ ...c, client_name: clientName(c.client_id) })) }
    },
    async update(checkId, data, user) {
      await latency()
      const rec = state.checks.find((c) => c.id === checkId)
      if (!rec) throw new Error('Check record not found')
      const issue = byIssue(rec.issue_id)
      Object.assign(rec, data, { check_date: rec.check_date || today(), checked_by: userName(user?.id) || user?.name })
      rec.monitoring_status = data.fix_required && data.fix_implemented ? 'Completed' : data.check_date ? 'Completed' : 'Pending'
      const relevant = state.clients.filter((c) => c.active && c.relevant_for_client_wide_check)
      const rows = state.checks.filter((c) => c.issue_id === issue.id)
      const allChecked = relevant.every((c) => rows.some((r) => r.client_id === c.id && r.check_date))
      if (allChecked) issue.client_wide_check_status = 'Completed'
      const affected = rows.filter((r) => r.same_issue_found)
      issue.global_fix_required = affected.length > 1
      if (issue.global_fix_required && issue.global_fix_status === 'Not Required') issue.global_fix_status = 'Pending'
      if (!issue.global_fix_required) issue.global_fix_status = 'Not Required'
      touch(issue, user)
      if (data.same_issue_found)
        audit(user, issue, 'Client-Wide Check', 'client_impact_checks', null, `${clientName(rec.client_id)}: Same Issue Found = Yes`)
      else audit(user, issue, 'Client-Wide Check', 'client_impact_checks', null, `${clientName(rec.client_id)}: Same Issue Found = No`)
      return rec
    },
    async summary(issueId) {
      await latency()
      const issue = byIssue(issueId)
      const relevant = state.clients.filter((c) => c.active && c.relevant_for_client_wide_check)
      const rows = state.checks.filter((c) => c.issue_id === issue.id)
      const checked = rows.filter((r) => r.check_date)
      return {
        total_relevant: relevant.length, checked: checked.length, pending: relevant.length - checked.length,
        affected: rows.filter((r) => r.same_issue_found).length,
        affected_clients: rows.filter((r) => r.same_issue_found).map((r) => clientName(r.client_id)),
        global_fix_required: issue.global_fix_required, global_fix_status: issue.global_fix_status,
        fix_pending: rows.filter((r) => r.fix_required && !r.fix_implemented).map((r) => clientName(r.client_id)),
      }
    },
  },

  monitoring: {
    async list(issueId) { await latency(); return state.monitoringLogs.filter((m) => !issueId || m.issue_id === issueId || byIssue(issueId)?.id === m.issue_id) },
    async start(issueId, periodDays, user) {
      await latency()
      const issue = byIssue(issueId)
      if (!issue) throw new Error('Issue not found')
      issue.monitoring_required = true
      issue.monitoring_period = periodDays
      issue.monitoring_start_date = today()
      issue.monitoring_end_date = new Date(Date.now() + periodDays * DAY).toISOString().slice(0, 10)
      issue.monitoring_result = 'In Progress'
      issue.status = 'Monitoring'
      touch(issue, user)
      audit(user, issue, 'Monitoring Started', 'monitoring', null, `${periodDays}-day period started`)
      return issue
    },
    async addLog(issueId, data, user) {
      await latency()
      const issue = byIssue(issueId)
      if (!issue) throw new Error('Issue not found')
      const rec = {
        id: uid(), issue_id: issue.id, monitoring_start_date: issue.monitoring_start_date, monitoring_end_date: issue.monitoring_end_date,
        monitoring_period: issue.monitoring_period, check_date: today(), checked_by: userName(user?.id) || user?.name, ...data,
      }
      state.monitoringLogs.push(rec)
      if (data.issue_recurred) {
        issue.monitoring_result = 'Failed'
        audit(user, issue, 'Monitoring: Issue Recurred', 'monitoring_result', null, 'Failed — issue recurred')
      } else {
        issue.monitoring_result = data.system_stable === false ? 'Failed' : (today() >= (issue.monitoring_end_date || '') ? 'Successful' : 'In Progress')
        if (issue.monitoring_result === 'Successful') { issue.status = 'Resolved'; audit(user, issue, 'Monitoring Result', 'monitoring_result', null, 'Successful') }
        else audit(user, issue, 'Monitoring Check', 'monitoring_logs', null, issue.monitoring_result)
      }
      touch(issue, user)
      return rec
    },
  },

  recurrence: {
    async list() { await latency(); return state.recurrences.map((r) => ({ ...r, issue_id_text: byIssue(r.original_issue_id)?.issue_id, client_name: clientName(r.client_id) })) },
    async create(issueId, data, user) {
      await latency()
      const issue = byIssue(issueId)
      const rec = { id: uid(), original_issue_id: issue.id, recurrence_date: today(), client_id: issue.client_id, ...data, created_at: new Date().toISOString() }
      state.recurrences.unshift(rec)
      issue.recurrence = true
      issue.recurrence_count = (issue.recurrence_count || 0) + 1
      touch(issue, user)
      audit(user, issue, 'Recurrence Recorded', 'recurrence_tracker', null, 'Same issue recorded')
      return rec
    },
  },

  dashboard: {
    async get(f = {}) {
      await latency()
      const list = (await demoApi.issues.list({ ...f, page_size: 1000 })).items
      const open = list.filter((i) => !['Closed', 'Resolved'].includes(i.status))
      const kpi = {
        total: list.length,
        open: open.length,
        critical: list.filter((i) => i.priority === 'Critical' && !['Closed'].includes(i.status)).length,
        high: list.filter((i) => i.priority === 'High' && !['Closed'].includes(i.status)).length,
        rcaPending: open.filter((i) => !i.root_cause).length,
        solutionPending: open.filter((i) => i.root_cause && !i.permanent_solution).length,
        testingPending: open.filter((i) => i.testing_status !== 'Passed').length,
        clientCheckPending: list.filter((i) => i.client_wide_check_required && ['Pending', 'In Progress'].includes(i.client_wide_check_status)).length,
        globalFixPending: list.filter((i) => i.global_fix_required && i.global_fix_status !== 'Completed').length,
        monitoringPending: list.filter((i) => i.monitoring_required && i.status !== 'Closed' && i.monitoring_result !== 'Successful').length,
        closed: list.filter((i) => i.status === 'Closed').length,
        recurring: list.filter((i) => i.recurrence).length,
        avgResolutionDays: avgResolution(list),
        affectedClients: new Set(state.checks.filter((c) => c.same_issue_found).map((c) => c.client_id)).size,
        resolved: list.filter((i) => ['Resolved', 'Closed'].includes(i.status)).length,
        issuesWithMatches: new Set(state.similarityResults.map((r) => r.issue_id)).size,
        issuesWithoutMatches: Math.max(0, list.length - new Set(state.similarityResults.map((r) => r.issue_id)).size),
        aiMatchRate: list.length ? Math.round(1000 * new Set(state.similarityResults.map((r) => r.issue_id)).size / list.length) / 10 : 0,
        topRecurring: list.filter((i) => i.recurrence_count > 0).sort((a, b) => b.recurrence_count - a.recurrence_count).slice(0, 6).map((i) => ({ label: i.issue_id, value: i.recurrence_count })),
        mostCommonRCA: countBy(list.filter((i) => i.root_cause), (i) => (i.root_cause || '').slice(0, 42)).sort((a, b) => b.value - a.value).slice(0, 6),
        mostCommonSystems: countBy(list, (i) => i.system_name || (i.process_id ? processName(i.process_id) : null) || 'Uncategorized').sort((a, b) => b.value - a.value).slice(0, 6),
      }
      return {
        kpi,
        byClient: countBy(list, (i) => clientName(i.client_id)),
        byCategory: countBy(list, (i) => categoryName(i.category_id)),
        byPriority: countBy(list, (i) => i.priority, ['Critical', 'High', 'Medium', 'Low']),
        byStatus: countBy(list, (i) => i.status),
        byMonth: monthsSeries(list),
        topClients: countBy(list, (i) => clientName(i.client_id)).sort((a, b) => b.value - a.value),
        recurringByClient: countBy(list.filter((i) => i.recurrence), (i) => clientName(i.client_id)),
        aging: agingSeries(list),
        sla: {
          overdue: list.filter((i) => !['Closed', 'Resolved'].includes(i.status) && slaOf(i).status === 'Overdue').length,
          atRisk: list.filter((i) => !['Closed', 'Resolved'].includes(i.status) && slaOf(i).status === 'At Risk').length,
          onTrack: list.filter((i) => !['Closed', 'Resolved'].includes(i.status) && slaOf(i).status === 'On Track').length,
        },
      }
    },
  },

  reports: {
    async get(type, f = {}) {
      await latency()
      const list = (await demoApi.issues.list({ page_size: 1000 })).items
      const closed = list.filter((i) => i.status === 'Closed' && i.closure_date)
      const avgRes = avgResolution(list)
      const mk = (label, value) => ({ label, value })
      switch (type) {
        case 'monthly': {
          const rows = [
            mk('Total Issues', list.length), mk('Closed', closed.length), mk('Open', list.length - closed.length),
            mk('Recurring', list.filter((i) => i.recurrence).length), mk('Critical / High', list.filter((i) => ['Critical', 'High'].includes(i.priority)).length),
            mk('Average Resolution (days)', Math.round(avgRes * 10) / 10),
          ]
          return { title: 'Monthly Tech Issue Report', columns: [{ key: 'label', label: 'Metric' }, { key: 'value', label: 'Value' }], rows }
        }
        case 'client': {
          const rows = state.clients.map((c) => {
            const ci = list.filter((i) => i.client_id === c.id)
            const res = avgResolution(ci)
            return { client: c.client_name, code: c.client_code, issues: ci.length, recurring: ci.filter((i) => i.recurrence).length, open: ci.filter((i) => !['Closed', 'Resolved'].includes(i.status)).length, avg_resolution_days: res ? Math.round(res * 10) / 10 : '—' }
          })
          return { title: 'Client-wise Report', columns: [{ key: 'client', label: 'Client' }, { key: 'code', label: 'Code' }, { key: 'issues', label: 'Issues' }, { key: 'recurring', label: 'Recurring' }, { key: 'open', label: 'Open' }, { key: 'avg_resolution_days', label: 'Avg Resolution (days)' }], rows }
        }
        case 'category': {
          const rows = state.categories.map((c) => {
            const ci = list.filter((i) => i.category_id === c.id)
            return { category: c.category_name, issues: ci.length, open: ci.filter((i) => !['Closed', 'Resolved'].includes(i.status)).length, recurring: ci.filter((i) => i.recurrence).length, critical_high: ci.filter((i) => ['Critical', 'High'].includes(i.priority)).length }
          })
          return { title: 'Category-wise Report', columns: [{ key: 'category', label: 'Category' }, { key: 'issues', label: 'Issues' }, { key: 'open', label: 'Open' }, { key: 'recurring', label: 'Recurring' }, { key: 'critical_high', label: 'Critical / High' }], rows }
        }
        case 'rca': {
          const rows = state.rcaLogs.map((r) => ({ issue: byIssue(r.issue_id)?.issue_id, rca_date: r.rca_date, status: r.status, owner: r.owner, root_cause: (r.root_cause || '').slice(0, 80), preventive_action: r.preventive_action || '' }))
          return { title: 'RCA Effectiveness Report', columns: [{ key: 'issue', label: 'Issue' }, { key: 'rca_date', label: 'Date' }, { key: 'status', label: 'Status' }, { key: 'owner', label: 'Owner' }, { key: 'root_cause', label: 'Root Cause' }, { key: 'preventive_action', label: 'Preventive Action' }], rows }
        }
        case 'solution': {
          const rows = state.solutions.map((s) => ({ issue: byIssue(s.issue_id)?.issue_id, type: s.solution_type, implemented_date: s.implemented_date || '', testing: s.testing_status, effective: s.solution_effective, description: (s.solution_description || '').slice(0, 80) }))
          return { title: 'Solution Effectiveness Report', columns: [{ key: 'issue', label: 'Issue' }, { key: 'type', label: 'Type' }, { key: 'implemented_date', label: 'Implemented' }, { key: 'testing', label: 'Testing' }, { key: 'effective', label: 'Effectiveness' }, { key: 'description', label: 'Description' }], rows }
        }
        case 'recurrence': {
          const rows = state.recurrences.map((r) => ({ issue: byIssue(r.original_issue_id)?.issue_id, client: clientName(r.client_id), date: r.recurrence_date, status: r.status, description: r.recurrence_description || '', owner: r.owner || '' }))
          return { title: 'Recurrence Report', columns: [{ key: 'issue', label: 'Issue' }, { key: 'client', label: 'Client' }, { key: 'date', label: 'Date' }, { key: 'status', label: 'Status' }, { key: 'description', label: 'Description' }, { key: 'owner', label: 'Owner' }], rows }
        }
        default: return { title: 'Report', columns: [], rows: [] }
      }
    },
  },

  audit: {
    async list(f = {}) {
      await latency()
      let rows = [...state.auditLogs]
      if (f.issue_id) rows = rows.filter((r) => r.issue_id_text === f.issue_id)
      if (f.action) rows = rows.filter((r) => r.action === f.action)
      if (f.user) rows = rows.filter((r) => r.user_name.toLowerCase().includes(f.user.toLowerCase()))
      return { items: rows, total: rows.length }
    },
  },

  clients: {
    async list() { await latency(); return state.clients.map((c) => ({ ...c, issue_count: state.issues.filter((i) => i.client_id === c.id).length })) },
    async save(c, user) {
      await latency()
      if (c.id) { const cur = state.clients.find((x) => x.id === c.id); Object.assign(cur, c); return cur }
      const rec = { id: uid(), ...c }
      state.clients.push(rec)
      audit(user, null, 'Client Added', 'clients', null, rec.client_name)
      return rec
    },
    async remove(id) { await latency(); state.clients = state.clients.filter((c) => c.id !== id) },
  },

  processes: {
    async list() { await latency(); return state.processes },
    async save(p, user) {
      await latency()
      if (p.id) { Object.assign(state.processes.find((x) => x.id === p.id), p); return p }
      const rec = { id: uid(), ...p }; state.processes.push(rec); return rec
    },
    async remove(id) { await latency(); state.processes = state.processes.filter((p) => p.id !== id) },
  },

  categories: {
    async list() { await latency(); return state.categories },
    async save(c, user) {
      await latency()
      if (c.id) { Object.assign(state.categories.find((x) => x.id === c.id), c); return c }
      const rec = { id: uid(), ...c }; state.categories.push(rec); return rec
    },
    async remove(id) { await latency(); state.categories = state.categories.filter((p) => p.id !== id) },
  },

  users: {
    async list() { await latency(); return state.users },
    async save(u, user) {
      await latency()
      const cur = state.users.find((x) => x.id === u.id)
      if (cur) { Object.assign(cur, u); audit(user, null, 'User Updated', 'users', null, `${u.name} → ${u.role}`) }
      return cur
    },
  },

  settings: {
    async get() { await latency(); return { sla: state.settings.sla, monitoring_periods: state.settings.monitoringPeriods, recipients: state.settings.recipients, similarity: state.settings.similarity } },
    async saveSla(sla, user) { await latency(); state.settings.sla = sla; audit(user, null, 'SLA Updated', 'sla_config', null, JSON.stringify(sla)); return sla },
    async saveSimilarity(s, user) { await latency(); state.settings.similarity = { high: s.high_threshold, medium: s.medium_threshold }; audit(user, null, 'Similarity Settings Updated', 'app_settings', null, JSON.stringify(state.settings.similarity)); return state.settings.similarity },
    async savePeriods(periods, user) { await latency(); state.settings.monitoringPeriods = periods; audit(user, null, 'Monitoring Periods Updated', 'app_settings', null, periods.join(',')); return periods },
    async listRecipients() { await latency(); return state.settings.recipients },
    async saveRecipient(r) {
      await latency()
      if (r.id) { Object.assign(state.settings.recipients.find((x) => x.id === r.id), r); return r }
      const rec = { id: uid(), ...r }; state.settings.recipients.push(rec); return rec
    },
    async removeRecipient(id) { await latency(); state.settings.recipients = state.settings.recipients.filter((r) => r.id !== id) },
  },

  notifications: {
    async list() { await latency(); return { items: state.notifications, unread: state.notifications.filter((n) => !n.read).length } },
    async markRead(id) { await latency(); const n = state.notifications.find((x) => x.id === id); if (n) n.read = true },
  },

  attachments: {
    async list(issueId) { await latency(); return state.attachments.filter((a) => a.issue_id === issueId || byIssue(issueId)?.id === a.issue_id) },
    async add(issueId, file, user) {
      await latency()
      const issue = byIssue(issueId)
      const rec = { id: uid(), issue_id: issue.id, file_name: file.file_name, file_type: file.file_type || 'file', uploaded_by: user?.name || '', created_at: new Date().toISOString() }
      state.attachments.push(rec)
      audit(user, issue, 'Attachment Added', 'attachments', null, file.file_name)
      return rec
    },
  },

  // ---------------- AI SIMILARITY ENGINE (mirrors backend/services/similarity.py) ----------------
  similarity: {
    async find(issueId, body, user) {
      await latency()
      const issue = byIssue(issueId)
      if (!issue) throw new Error('Issue not found')
      const override = body?.search_text || null
      const top = computeMatchesFor(issue, true, override)
      audit(user, issue, 'Similarity Search', 'similar_issues', null, `${top.length} previous similar issue(s) found`)
      return { issue_id: issue.issue_id, matches: matchesFor(issue) }
    },
    async list(issueId) {
      await latency()
      const issue = byIssue(issueId)
      if (!issue) return []
      return matchesFor(issue)
    },
  },

  relationships: {
    async list(issueId) {
      await latency()
      const issue = byIssue(issueId)
      if (!issue) return []
      return relsFor(issue)
    },
    async create(issueId, data, user) {
      await latency()
      const issue = byIssue(issueId)
      const rel = byIssue(data.related_issue_id)
      if (!issue || !rel) throw new Error('Issue not found')
      if (issue.id === rel.id) throw new Error('Cannot link an issue to itself')
      const types = ['same_issue', 'related_issue', 'duplicate', 'recurrence', 'not_related']
      const type = types.includes(data.relationship_type) ? data.relationship_type : 'same_issue'
      const existing = state.relationships.find((r) => r.issue_id === issue.id && r.related_issue_id === rel.id && r.relationship_type === type)
      if (existing) {
        Object.assign(existing, { confirmed: true, similarity_score: data.similarity_score ?? existing.similarity_score, confirmed_by: user?.id || null, confirmed_at: new Date().toISOString() })
        recomputeRecurrence(issue)
        return existing
      }
      const rec = { id: uid(), issue_id: issue.id, related_issue_id: rel.id, relationship_type: type, similarity_score: data.similarity_score ?? null, note: data.note || '', confirmed: true, confirmed_by: user?.id || null, confirmed_at: new Date().toISOString(), created_at: new Date().toISOString() }
      state.relationships.push(rec)
      if (['same_issue', 'recurrence'].includes(type)) recomputeRecurrence(issue)
      audit(user, issue, 'Similar Issue Linked', 'issue_relationships', null, `${rel.issue_id} linked as ${type}`)
      return rec
    },
    async confirm(issueId, data, user) {
      await latency()
      return demoApi.relationships.create(issueId, {
        related_issue_id: data.related_issue_id,
        relationship_type: data.relationship_type === 'not_related' ? 'not_related' : 'same_issue',
        note: data.note || '',
      }, user)
    },
  },

  knowledge: {
    async search(f = {}) {
      await latency()
      let items = state.issues.filter((i) => i.root_cause && i.root_cause.trim())
      if (f.client_id) items = items.filter((i) => i.client_id === f.client_id)
      if (f.process_id) items = items.filter((i) => i.process_id === f.process_id)
      if (f.category_id) items = items.filter((i) => i.category_id === f.category_id)
      if (f.date_from) items = items.filter((i) => i.reported_date >= f.date_from)
      if (f.date_to) items = items.filter((i) => i.reported_date <= f.date_to)
      const q = (f.q || '').trim()
      let out
      if (q) {
        const qvec = embedText(q)
        out = items.map((i) => ({ ...i, similarity: Math.round(cosine(qvec, embedFor(i)) * 1000) / 1000 })).sort((a, b) => b.similarity - a.similarity)
      } else {
        out = [...items].sort((a, b) => (b.closure_date || '').localeCompare(a.closure_date || ''))
      }
      const limited = out.slice(0, f.limit || 20)
      return { items: limited.map((i) => ({ ...i, client_name: clientName(i.client_id), process_name: processName(i.process_id), category_name: categoryName(i.category_id) })) }
    },
  },
}

// ---------------- demo auth ----------------
export const demoAuth = {
  isDemo: true,
  async signIn(email, password) {
    await latency(300)
    const u = users.find((x) => x.email.toLowerCase() === email.toLowerCase())
    if (!u || password !== DEMO_PASSWORD) throw new Error('Invalid email or password.')
    if (!u.active) throw new Error('Your account is inactive. Contact an administrator.')
    localStorage.setItem('tims.demo.session', JSON.stringify({ userId: u.id }))
    return { user: u, token: 'demo-token' }
  },
  async signOut() { localStorage.removeItem('tims.demo.session') },
  async getSession() {
    try {
      const s = JSON.parse(localStorage.getItem('tims.demo.session') || 'null')
      if (!s) return null
      const user = users.find((u) => u.id === s.userId)
      return user ? { user, token: 'demo-token' } : null
    } catch { return null }
  },
  demoUsers: users,
  demoPassword: DEMO_PASSWORD,
}

// ---------------- internal helpers ----------------
function categoryName(id) { return state.categories.find((c) => c.id === id)?.category_name || 'Uncategorized' }
function processName(id) { return state.processes.find((p) => p.id === id)?.process_name || '—' }
function slaOf(issue) {
  const days = state.settings.sla[issue.priority] ?? 5
  const daysOpen = Math.floor((Date.now() - new Date(issue.reported_date || issue.created_at)) / DAY)
  const isDone = ['Closed', 'Resolved'].includes(issue.status)
  let status = 'On Track'
  if (isDone) status = 'Closed'
  else if (daysOpen > days) status = 'Overdue'
  else if (daysOpen >= days - 1) status = 'At Risk'
  return { status, days, daysOpen }
}
function avgResolution(list) {
  const closed = list.filter((i) => i.status === 'Closed' && i.closure_date)
  if (!closed.length) return 0
  return closed.reduce((acc, i) => acc + (new Date(i.closure_date) - new Date(i.reported_date)) / DAY, 0) / closed.length
}
function countBy(list, fn, order) {
  const map = new Map()
  list.forEach((i) => { const k = fn(i) || '—'; map.set(k, (map.get(k) || 0) + 1) })
  let entries = [...map.entries()].map(([label, value]) => ({ label, value }))
  if (order) entries = entries.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label))
  return entries
}
function monthsSeries(list) {
  const months = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    const value = list.filter((x) => new Date(x.reported_date).getMonth() === d.getMonth() && new Date(x.reported_date).getFullYear() === d.getFullYear()).length
    months.push({ label: key, value })
  }
  return months
}
function agingSeries(list) {
  const buckets = { '0-2 days': 0, '3-7 days': 0, '8-14 days': 0, '15-30 days': 0, '30+ days': 0 }
  list.filter((i) => !['Closed', 'Resolved'].includes(i.status)).forEach((i) => {
    const days = Math.floor((Date.now() - new Date(i.reported_date)) / DAY)
    const k = days <= 2 ? '0-2 days' : days <= 7 ? '3-7 days' : days <= 14 ? '8-14 days' : days <= 30 ? '15-30 days' : '30+ days'
    buckets[k]++
  })
  return Object.entries(buckets).map(([label, value]) => ({ label, value }))
}

// ============================================================
// AI SIMILARITY ENGINE (in-browser)
// Mirrors backend/app/services/similarity.py: search text -> embedding
// (words + character trigrams, L2-normalized) -> cosine similarity.
// In production this runs in FastAPI + pgvector on the server — never here.
// ============================================================
function simTokenize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
}
function simHash(s, seed) {
  let h = seed >>> 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}
function embedText(text, dim = 256) {
  const vec = new Array(dim).fill(0)
  for (const w of simTokenize(text)) vec[simHash(w, 0) % dim] += 1
  const chars = String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  for (let i = 0; i < chars.length - 2; i++) vec[simHash(chars.slice(i, i + 3), 7) % dim] += 0.5
  const norm = Math.sqrt(vec.reduce((a, v) => a + v * v, 0)) || 1
  return vec.map((v) => v / norm)
}
function cosine(a, b) {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return Math.max(0, s)
}
function simSearchText(i) {
  return [i.issue_title, i.issue_description, i.error_message, i.system_name,
    processName(i.process_id), categoryName(i.category_id), clientName(i.client_id)]
    .filter(Boolean).join(' | ')
}
function embedFor(i) {
  if (!i._embedding) i._embedding = embedText(simSearchText(i))
  return i._embedding
}
function latestRcaFor(issueId) {
  return state.rcaLogs
    .filter((r) => r.issue_id === issueId && r.status === 'Completed')
    .sort((a, b) => (b.rca_date || '').localeCompare(a.rca_date || ''))[0]
}
function computeMatchesFor(issue, store = true, overrideText = null) {
  const vec = overrideText ? embedText(overrideText) : embedFor(issue)
  const scored = state.issues
    .filter((i) => i.id !== issue.id)
    .map((o) => ({ similar_issue_id: o.id, similarity: Math.round(cosine(vec, embedFor(o)) * 1000) / 1000 }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5)
  if (store) {
    state.similarityResults = state.similarityResults.filter((r) => r.issue_id !== issue.id)
    scored.forEach((s) => state.similarityResults.push({
      id: uid(), issue_id: issue.id, similar_issue_id: s.similar_issue_id,
      similarity: s.similarity, created_at: new Date().toISOString(),
    }))
  }
  return scored
}
function matchesFor(issue) {
  return state.similarityResults
    .filter((r) => r.issue_id === issue.id)
    .sort((a, b) => b.similarity - a.similarity)
    .map((r) => {
      const s = byIssue(r.similar_issue_id)
      const rca = latestRcaFor(s?.id)
      return {
        id: s?.id, issue_id: s?.issue_id, issue_title: s?.issue_title, status: s?.status,
        priority: s?.priority, recurrence_count: s?.recurrence_count,
        root_cause: s?.root_cause, permanent_solution: s?.permanent_solution,
        temporary_solution: s?.temporary_solution,
        client_name: clientName(s?.client_id), process_name: processName(s?.process_id),
        similarity: r.similarity,
        technical_cause: rca?.technical_cause, contributing_factors: rca?.contributing_factors,
        preventive_action: rca?.preventive_action,
      }
    })
}
function relsFor(issue) {
  return state.relationships
    .filter((r) => r.issue_id === issue.id)
    .map((r) => {
      const rel = byIssue(r.related_issue_id)
      return { ...r, related_issue_id_text: rel?.issue_id, related_title: rel?.issue_title, related_status: rel?.status }
    })
}
function recomputeRecurrence(issue) {
  const links = state.relationships.filter((r) => r.issue_id === issue.id && r.confirmed !== false && ['same_issue', 'recurrence'].includes(r.relationship_type))
  issue.recurrence = links.length > 0
  issue.recurrence_count = links.length
  touch(issue)
}
