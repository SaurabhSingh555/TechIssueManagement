// Shared domain constants — mirrored by database enums in database/schema.sql

export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low']

export const STATUSES = [
  'New',
  'Under Investigation',
  'RCA In Progress',
  'Solution Proposed',
  'Testing',
  'Global Fix',
  'Resolved',
  'Closed',
  'Reopened',
]

export const PRIORITY_COLORS = {
  Critical: 'bg-rose-100 text-rose-700 ring-rose-200',
  High: 'bg-orange-100 text-orange-700 ring-orange-200',
  Medium: 'bg-amber-100 text-amber-700 ring-amber-200',
  Low: 'bg-slate-100 text-slate-600 ring-slate-200',
}

export const STATUS_COLORS = {
  New: 'bg-sky-100 text-sky-700 ring-sky-200',
  'Under Investigation': 'bg-amber-100 text-amber-700 ring-amber-200',
  'RCA In Progress': 'bg-violet-100 text-violet-700 ring-violet-200',
  'Solution Proposed': 'bg-cyan-100 text-cyan-700 ring-cyan-200',
  Testing: 'bg-teal-100 text-teal-700 ring-teal-200',
  'Client-Wide Check': 'bg-orange-100 text-orange-700 ring-orange-200',
  'Global Fix': 'bg-fuchsia-100 text-fuchsia-700 ring-fuchsia-200',
  Monitoring: 'bg-indigo-100 text-indigo-700 ring-indigo-200',
  Resolved: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  Closed: 'bg-green-700 text-white ring-green-700',
  Reopened: 'bg-rose-100 text-rose-700 ring-rose-200',
}

export const ROLES = ['admin', 'manager', 'tech_owner', 'viewer']
export const ROLE_LABELS = {
  admin: 'Admin',
  manager: 'Manager',
  tech_owner: 'Tech Owner',
  viewer: 'Viewer',
}

export const EFFECTIVENESS_OPTIONS = ['Pending', 'Effective', 'Partially Effective', 'Not Effective']
export const SOLUTION_TYPES = ['Temporary', 'Permanent']
export const RCA_STATUSES = ['Draft', 'In Progress', 'Completed', 'Superseded']

export const DEFAULT_MONITORING_PERIODS = [3, 7, 14, 30]

export const AGING_BUCKETS = [
  { key: '0-2 days', min: 0, max: 2 },
  { key: '3-7 days', min: 3, max: 7 },
  { key: '8-14 days', min: 8, max: 14 },
  { key: '15-30 days', min: 15, max: 30 },
  { key: '30+ days', min: 31, max: Infinity },
]

export const TIMELINE_STEPS = [
  { key: 'reported', label: 'Reported', status: 'New' },
  { key: 'assigned', label: 'Assigned', status: 'Under Investigation' },
  { key: 'rca', label: 'RCA', status: 'RCA In Progress' },
  { key: 'solution', label: 'Solution', status: 'Solution Proposed' },
  { key: 'testing', label: 'Testing', status: 'Testing' },
  { key: 'global_fix', label: 'Global Fix', status: 'Global Fix' },
  { key: 'resolved', label: 'Resolved', status: 'Resolved' },
  { key: 'closed', label: 'Closed', status: 'Closed' },
]

// Frontend permission map (UI gating only — the FastAPI backend enforces the
// same rules server-side. Never rely on this for security.)
const PERMS = {
  admin: [
    'view_all', 'create_issue', 'update_issue', 'delete_issue', 'assign_issue',
    'manage_rca', 'manage_solutions', 'manage_checks', 'manage_monitoring',
    'manage_recurrence', 'close_issue', 'reopen_issue', 'view_audit',
    'manage_settings', 'manage_users', 'export_reports', 'view_reports',
  ],
  manager: [
    'view_all', 'create_issue', 'update_issue', 'assign_issue',
    'manage_rca', 'manage_solutions', 'manage_checks', 'manage_monitoring',
    'manage_recurrence', 'close_issue', 'reopen_issue', 'view_audit',
    'export_reports', 'view_reports',
  ],
  tech_owner: [
    'view_assigned', 'update_issue', 'manage_rca', 'manage_solutions',
    'manage_checks', 'manage_monitoring', 'close_issue',
  ],
  viewer: ['view_all', 'view_reports'],
}

export function can(role, action) {
  if (!role) return false
  return (PERMS[role] || []).includes(action)
}
