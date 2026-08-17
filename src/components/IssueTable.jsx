import { useNavigate } from 'react-router-dom'
import { RotateCcw } from 'lucide-react'
import { DataTable, Badge, StatusBadge, PriorityBadge } from './ui'
import { agingBucket, slaInfo, fmtDate, AGING_COLORS, SLA_COLORS, cx } from '../utils/format'

// Shared issue table used by All Issues / My Issues / Dashboard lists
export default function IssueTable({ rows = [], loading, total, page, pageSize, onPageChange, footer }) {
  const navigate = useNavigate()
  const columns = [
    {
      key: 'issue_id', label: 'Issue ID',
      render: (r) => (
        <div>
          <p className="font-semibold text-indigo-700 hover:underline">{r.issue_id}</p>
          {r.recurrence && (
            <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold text-rose-600">
              <RotateCcw className="h-3 w-3" /> Recurred ×{r.recurrence_count}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'title', label: 'Issue Title',
      render: (r) => (
        <div className="max-w-72">
          <p className="truncate font-medium text-slate-800" title={r.issue_title}>{r.issue_title}</p>
          <p className="truncate text-xs text-slate-400">{r.client_name || r.client_id} · {r.process_name || '—'}</p>
        </div>
      ),
    },
    { key: 'priority', label: 'Priority', render: (r) => <PriorityBadge priority={r.priority} /> },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'aging', label: 'Aging',
      render: (r) => {
        if (['Closed'].includes(r.status)) return <span className="text-xs text-slate-400">—</span>
        const days = slaInfo(r).daysOpen
        const bucket = agingBucket(days)
        return <Badge className={AGING_COLORS[bucket]}>{bucket} <span className="opacity-70">({days}d)</span></Badge>
      },
    },
    {
      key: 'sla', label: 'SLA',
      render: (r) => {
        const s = slaInfo(r)
        return (
          <div>
            <Badge className={SLA_COLORS[s.status]}>{s.status}</Badge>
            <p className="mt-0.5 text-[10px] text-slate-400">Due {fmtDate(s.due)} · {s.slaDays}d target</p>
          </div>
        )
      },
    },
    { key: 'assigned', label: 'Assigned To', render: (r) => <span className="text-xs">{r.assigned_name || '—'}</span> },
    { key: 'reported', label: 'Reported', render: (r) => <span className="text-xs text-slate-500">{fmtDate(r.reported_date)}</span> },
  ]
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey="id"
      loading={loading}
      onRowClick={(r) => navigate(`/issues/${r.issue_id}`)}
      footer={footer}
      empty={
        <div className={cx('border-0')}>
          <p className="px-5 py-12 text-center text-sm text-slate-400">
            No issues found. Create an issue to get started.
          </p>
        </div>
      }
    />
  )
}
