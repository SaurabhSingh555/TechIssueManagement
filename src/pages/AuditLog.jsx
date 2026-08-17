import { useState } from 'react'
import { ScrollText } from 'lucide-react'
import { api } from '../services/backend'
import { useAsync } from '../hooks/useAsync'
import { Card, Badge, SearchInput, Pagination } from '../components/ui'
import { fmtDateTime } from '../utils/format'

export default function AuditLog() {
  const [filters, setFilters] = useState({ issue_id: '', action: '', user: '' })
  const [page, setPage] = useState(1)
  const { data, loading } = useAsync(() => api.audit.list({ ...filters, page, page_size: 25 }), [JSON.stringify(filters), page])
  const rows = data?.items || []
  const actions = ['Issue Created', 'Status Change', 'Priority Change', 'Assignment', 'RCA Added', 'Solution Added', 'Solution Not Effective', 'Client-Wide Check', 'Client-Wide Check Started', 'Global Fix', 'Monitoring Started', 'Monitoring Result', 'Monitoring Check', 'Closure', 'Closure Blocked', 'Issue Reopened', 'Recurrence Recorded', 'Attachment Added', 'SLA Updated']

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-indigo-600 p-2.5"><ScrollText className="h-5 w-5 text-white" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Audit Log</h1>
          <p className="text-xs text-slate-500">Every important action and change, recorded with user, timestamp and before/after values.</p>
        </div>
      </div>

      <Card padding={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <SearchInput value={filters.issue_id} onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, issue_id: e.target.value })) }} placeholder="Filter by Issue ID…" className="w-48" />
          <select value={filters.action} onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, action: e.target.value })) }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none">
            <option value="">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <SearchInput value={filters.user} onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, user: e.target.value })) }} placeholder="Filter by user…" className="w-48" />
        </div>

        {loading ? (
          <div className="space-y-3 p-5">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-9 w-full rounded-lg" />)}</div>
        ) : rows.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-slate-400">No audit entries match the filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['Timestamp', 'User', 'Action', 'Issue', 'Field', 'Change'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{fmtDateTime(r.timestamp)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-slate-700">{r.user_name}</td>
                    <td className="px-4 py-3"><Badge className={r.action.includes('Blocked') || r.action.includes('Reopened') ? 'bg-rose-100 text-rose-700 ring-rose-200' : 'bg-indigo-50 text-indigo-700 ring-indigo-200'}>{r.action}</Badge></td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-indigo-700">{r.issue_id_text || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{r.field_name}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className="text-slate-400 line-through">{r.old_value || '—'}</span>
                      <span className="mx-1 text-slate-400">→</span>
                      <span className="font-semibold text-slate-800">{r.new_value || '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={25} total={data?.total || rows.length} onChange={setPage} />
      </Card>
    </div>
  )
}
