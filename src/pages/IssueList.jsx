import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Filter, Plus } from 'lucide-react'
import { api } from '../services/backend'
import { Card, Button, Select, SearchInput, Pagination } from '../components/ui'
import IssueTable from '../components/IssueTable'
import { useAuth } from '../services/session'

export default function IssueList({ mode = 'all' }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [params] = useSearchParams()
  const [filters, setFilters] = useState({
    search: params.get('search') || '', date_from: '', date_to: '', client_id: '', process_id: '',
    category_id: '', priority: '', status: '', owner_id: mode === 'my' ? user?.id : '', recurrence: '',
  })
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], total: 0, loading: true })

  useEffect(() => {
    if (params.get('search')) setFilters((f) => ({ ...f, search: params.get('search') || '' }))
  }, [params])

  useEffect(() => {
    let active = true
    setData((d) => ({ ...d, loading: true }))
    api.issues.list({ ...filters, page, page_size: 10 })
      .then((r) => active && setData({ items: r.items, total: r.total, loading: false }))
      .catch(() => active && setData({ items: [], total: 0, loading: false }))
    return () => { active = false }
  }, [filters, page])

  const { data: clients } = useLoaded(() => api.clients.list())
  const { data: processes } = useLoaded(() => api.processes.list())
  const { data: categories } = useLoaded(() => api.categories.list())
  const { data: users } = useLoaded(() => api.users.list())

  const set = (k) => (e) => { setPage(1); setFilters((f) => ({ ...f, [k]: e.target.value })) }
  const activeFilterCount = Object.values(filters).filter((v) => v && v !== '').length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{mode === 'my' ? 'My Issues' : 'All Issues'}</h1>
          <p className="text-xs text-slate-500">
            {mode === 'my' ? 'Issues assigned to you across all clients.' : 'Centralized register of every technology issue.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowFilters((v) => !v)}>
            <Filter className="h-3.5 w-3.5" /> Filters {activeFilterCount > 0 && <span className="rounded-full bg-indigo-600 px-1.5 text-[10px] font-bold text-white">{activeFilterCount}</span>}
          </Button>
          <Button size="sm" onClick={() => navigate('/issues/new')}><Plus className="h-3.5 w-3.5" /> New Issue</Button>
        </div>
      </div>

      <Card padding={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <SearchInput value={filters.search} onChange={set('search')} placeholder="Search ID, title, client, description, category, owner…" className="w-full max-w-sm" />
          {showFilters && (
            <div className="grid w-full grid-cols-2 gap-3 md:grid-cols-5">
              <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Date From</span><input type="date" value={filters.date_from} onChange={set('date_from')} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs" /></label>
              <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Date To</span><input type="date" value={filters.date_to} onChange={set('date_to')} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs" /></label>
              <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Client</span><Select value={filters.client_id} onChange={set('client_id')} placeholder="All" options={(clients || []).map((c) => ({ value: c.id, label: c.client_name }))} className="py-1.5 text-xs" /></label>
              <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Process</span><Select value={filters.process_id} onChange={set('process_id')} placeholder="All" options={(processes || []).map((p) => ({ value: p.id, label: p.process_name }))} className="py-1.5 text-xs" /></label>
              <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Category</span><Select value={filters.category_id} onChange={set('category_id')} placeholder="All" options={(categories || []).map((c) => ({ value: c.id, label: c.category_name }))} className="py-1.5 text-xs" /></label>
              <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Priority</span><Select value={filters.priority} onChange={set('priority')} placeholder="All" options={['Critical', 'High', 'Medium', 'Low'].map((v) => ({ value: v, label: v }))} className="py-1.5 text-xs" /></label>
              <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Status</span><Select value={filters.status} onChange={set('status')} placeholder="All" options={['New', 'Under Investigation', 'RCA In Progress', 'Solution Proposed', 'Testing', 'Global Fix', 'Resolved', 'Closed', 'Reopened'].map((v) => ({ value: v, label: v }))} className="py-1.5 text-xs" /></label>
              {mode !== 'my' && <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Owner</span><Select value={filters.owner_id} onChange={set('owner_id')} placeholder="All" options={(users || []).map((u) => ({ value: u.id, label: u.name }))} className="py-1.5 text-xs" /></label>}
              <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Recurrence</span><Select value={filters.recurrence} onChange={set('recurrence')} placeholder="All" options={[{ value: 'true', label: 'Recurring only' }, { value: 'false', label: 'Non-recurring' }]} className="py-1.5 text-xs" /></label>
            </div>
          )}
        </div>
        <IssueTable
          rows={data.items}
          loading={data.loading}
          total={data.total}
          page={page}
          pageSize={10}
          onPageChange={setPage}
          footer={<Pagination page={page} pageSize={10} total={data.total} onChange={setPage} />}
        />
      </Card>
    </div>
  )
}

// small helper hook to load reference data once
export function useLoaded(fn) {
  const [state, setState] = useState({ data: null, loading: true })
  useEffect(() => {
    let active = true
    fn().then((d) => active && setState({ data: d, loading: false })).catch(() => active && setState({ data: [], loading: false }))
    return () => { active = false }
  }, [])
  return state
}
