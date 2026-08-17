import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Search, Repeat2 } from 'lucide-react'
import { api } from '../services/backend'
import { Card, Badge, StatusBadge, EmptyState, Select, SearchInput } from '../components/ui'
import { fmtDate } from '../utils/format'
import { useLoaded } from './IssueList'

// ---------------------------------------------------------------------------
// Technical Knowledge / Previous Solutions — resolved tickets with RCA are
// automatically searchable historical knowledge. Search runs SERVER-SIDE.
// ---------------------------------------------------------------------------
export default function Knowledge() {
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ client_id: '', process_id: '', category_id: '', date_from: '', date_to: '' })
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)

  const { data: clients } = useLoaded(() => api.clients.list())
  const { data: processes } = useLoaded(() => api.processes.list())
  const { data: categories } = useLoaded(() => api.categories.list())

  useEffect(() => {
    let active = true
    setLoading(true)
    api.knowledge.search({ ...filters, q: query })
      .then((r) => active && setResults(r.items))
      .catch(() => active && setResults([]))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [query, filters])

  useEffect(() => {
    const t = setTimeout(() => setQuery(q), 400)
    return () => clearTimeout(t)
  }, [q])

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-indigo-600 p-2.5"><BookOpen className="h-5 w-5 text-white" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Technical Knowledge Base</h1>
          <p className="text-xs text-slate-500">
            Resolved tickets with documented RCA become searchable historical knowledge. Search by issue, error, client, system, module, RCA or solution.
          </p>
        </div>
      </div>

      <Card padding={false}>
        <div className="border-b border-slate-100 p-4">
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder='Search previous solutions… e.g. "OB API not landing", token expiry, webhook configuration'
            className="w-full max-w-xl"
          />
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
            <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Client</span><Select value={filters.client_id} onChange={set('client_id')} placeholder="All" options={(clients || []).map((c) => ({ value: c.id, label: c.client_name }))} className="py-1.5 text-xs" /></label>
            <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase text-slate-400">System / Module</span><Select value={filters.process_id} onChange={set('process_id')} placeholder="All" options={(processes || []).map((p) => ({ value: p.id, label: p.process_name }))} className="py-1.5 text-xs" /></label>
            <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Category</span><Select value={filters.category_id} onChange={set('category_id')} placeholder="All" options={(categories || []).map((c) => ({ value: c.id, label: c.category_name }))} className="py-1.5 text-xs" /></label>
            <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase text-slate-400">From</span><input type="date" value={filters.date_from} onChange={set('date_from')} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs" /></label>
            <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase text-slate-400">To</span><input type="date" value={filters.date_to} onChange={set('date_to')} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs" /></label>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-20 w-full rounded-lg" />)}</div>
        ) : !results || results.length === 0 ? (
          <EmptyState
            title={query ? 'No knowledge entries match your search' : 'No historical knowledge yet'}
            subtitle="Once tickets are resolved with a documented RCA and solution, they automatically appear here."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {results.map((r) => (
              <div key={r.id} className="flex flex-wrap items-start gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/issues/${r.issue_id}`} className="text-sm font-bold text-indigo-700 hover:underline">{r.issue_id}</Link>
                    {r.similarity != null && (
                      <Badge className={r.similarity >= 0.75 ? 'bg-rose-100 text-rose-700 ring-rose-200' : 'bg-amber-100 text-amber-700 ring-amber-200'}>
                        {(r.similarity * 100).toFixed(1)}% similar
                      </Badge>
                    )}
                    <StatusBadge status={r.status} />
                    {r.recurrence_count > 0 && <Badge className="bg-rose-100 text-rose-700 ring-rose-200"><Repeat2 className="h-3 w-3" /> ×{r.recurrence_count}</Badge>}
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-800">{r.issue_title}</p>
                  <p className="text-xs text-slate-400">
                    {r.client_name || '—'}{r.system_name ? ` · ${r.system_name}` : ''}{r.process_name ? ` · ${r.process_name}` : ''} · Reported {fmtDate(r.reported_date)}{r.closure_date ? ` · Resolved ${fmtDate(r.closure_date)}` : ''}
                  </p>
                  <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                    <div className="rounded-lg bg-rose-50/60 p-2.5">
                      <p className="font-bold uppercase tracking-wide text-rose-400">RCA</p>
                      <p className="mt-0.5 line-clamp-2 text-slate-700">{r.root_cause}</p>
                    </div>
                    <div className="rounded-lg bg-emerald-50/60 p-2.5">
                      <p className="font-bold uppercase tracking-wide text-emerald-500">Solution</p>
                      <p className="mt-0.5 line-clamp-2 text-slate-700">{r.permanent_solution || r.temporary_solution || '—'}</p>
                    </div>
                  </div>
                </div>
                <Link to={`/issues/${r.issue_id}`} className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
                  View History
                </Link>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
