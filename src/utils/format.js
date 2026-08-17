// Date / SLA / aging formatting helpers

export function fmtDate(d) {
  if (!d) return '—'
  const dt = typeof d === 'string' ? new Date(d) : d
  if (isNaN(dt)) return '—'
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function fmtDateTime(d) {
  if (!d) return '—'
  const dt = typeof d === 'string' ? new Date(d) : d
  if (isNaN(dt)) return '—'
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

export function toISODate(d) {
  const dt = d instanceof Date ? d : new Date(d)
  return dt.toISOString().slice(0, 10)
}

export function daysBetween(a, b) {
  const da = new Date(a), db = b ? new Date(b) : new Date()
  return Math.max(0, Math.floor((db - da) / 86400000))
}

export function agingBucket(days) {
  if (days <= 2) return '0-2 days'
  if (days <= 7) return '3-7 days'
  if (days <= 14) return '8-14 days'
  if (days <= 30) return '15-30 days'
  return '30+ days'
}

export const AGING_COLORS = {
  '0-2 days': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  '3-7 days': 'bg-sky-50 text-sky-700 ring-sky-200',
  '8-14 days': 'bg-amber-50 text-amber-700 ring-amber-200',
  '15-30 days': 'bg-orange-50 text-orange-700 ring-orange-200',
  '30+ days': 'bg-rose-50 text-rose-700 ring-rose-200',
}

// Computes SLA info for an issue using DB-driven SLA config (days per priority)
export function slaInfo(issue, slaConfig) {
  const days = slaConfig ? (slaConfig[issue.priority] ?? 5) : { Critical: 1, High: 2, Medium: 5, Low: 10 }[issue.priority]
  const daysOpen = daysBetween(issue.reported_date || issue.created_at)
  const due = new Date(new Date(issue.reported_date || issue.created_at).getTime() + days * 86400000)
  const isDone = ['Closed', 'Resolved'].includes(issue.status)
  let status = 'On Track'
  if (isDone) status = 'Closed'
  else if (daysOpen > days) status = 'Overdue'
  else if (daysOpen >= days - 1) status = 'At Risk'
  return { due, daysOpen, status, slaDays: days }
}

export const SLA_COLORS = {
  Overdue: 'bg-rose-100 text-rose-700 ring-rose-200',
  'At Risk': 'bg-amber-100 text-amber-700 ring-amber-200',
  'On Track': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Closed: 'bg-slate-100 text-slate-500 ring-slate-200',
}

export function relTime(d) {
  if (!d) return '—'
  const ms = Date.now() - new Date(d).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return fmtDate(d)
}

export function cx(...args) {
  return args.filter(Boolean).join(' ')
}
