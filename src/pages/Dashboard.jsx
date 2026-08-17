import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Ticket, FolderOpen, AlertOctagon, TrendingUp, ClipboardList, Lightbulb, FlaskConical,
  Network, Globe2, Activity, CheckCircle2, RotateCcw, Filter, Sparkles, Brain, ListChecks,
} from 'lucide-react'
import { api } from '../services/backend'
import { useAsync } from '../hooks/useAsync'
import { Card, StatCard, Select, Button, Skeleton } from '../components/ui'
import { BarChart, ColumnChart, DonutChart, palette } from '../components/charts'
import IssueTable from '../components/IssueTable'
import { fmtDate } from '../utils/format'

const KPI_DEFS = [
  { key: 'total', label: 'Total Issues', icon: Ticket, tone: 'indigo' },
  { key: 'open', label: 'Open', icon: FolderOpen, tone: 'sky' },
  { key: 'critical', label: 'Critical', icon: AlertOctagon, tone: 'rose' },
  { key: 'high', label: 'High', icon: TrendingUp, tone: 'orange' },
  { key: 'rcaPending', label: 'RCA Pending', icon: ClipboardList, tone: 'violet' },
  { key: 'solutionPending', label: 'Solution Pending', icon: Lightbulb, tone: 'amber' },
  { key: 'testingPending', label: 'Testing Pending', icon: FlaskConical, tone: 'cyan' },
  { key: 'closed', label: 'Closed', icon: CheckCircle2, tone: 'emerald' },
  { key: 'recurring', label: 'Recurring', icon: RotateCcw, tone: 'rose' },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState({ date_from: '', date_to: '', client_id: '', process_id: '', category_id: '', priority: '', status: '', owner_id: '' })
  const [showFilters, setShowFilters] = useState(false)
  const [recent, setRecent] = useState({ items: [], total: 0, loading: true })

  const { data: dash, loading, reload } = useAsync(() => api.dashboard.get(filters), [JSON.stringify(filters)])
  const { data: clients } = useAsync(() => api.clients.list(), [])
  const { data: processes } = useAsync(() => api.processes.list(), [])
  const { data: categories } = useAsync(() => api.categories.list(), [])
  const { data: users } = useAsync(() => api.users.list(), [])

  useEffect(() => {
    setRecent((s) => ({ ...s, loading: true }))
    api.issues.list({ page: 1, page_size: 6 }).then((r) => setRecent({ items: r.items, total: r.total, loading: false })).catch(() => setRecent((s) => ({ ...s, loading: false })))
  }, [])

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }))

  const filterBar = (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      {[
        { key: 'date_from', label: 'Date From', type: 'date' },
        { key: 'date_to', label: 'Date To', type: 'date' },
        { key: 'client_id', label: 'Client', opts: (clients || []).map((c) => ({ value: c.id, label: c.client_name })) },
        { key: 'process_id', label: 'Process', opts: (processes || []).map((p) => ({ value: p.id, label: p.process_name })) },
        { key: 'category_id', label: 'Category', opts: (categories || []).map((c) => ({ value: c.id, label: c.category_name })) },
        { key: 'priority', label: 'Priority', opts: ['Critical', 'High', 'Medium', 'Low'].map((v) => ({ value: v, label: v })) },
        { key: 'status', label: 'Status', opts: ['New', 'Under Investigation', 'RCA In Progress', 'Solution Proposed', 'Testing', 'Global Fix', 'Resolved', 'Closed', 'Reopened'].map((v) => ({ value: v, label: v })) },
        { key: 'owner_id', label: 'Owner', opts: (users || []).map((u) => ({ value: u.id, label: u.name })) },
      ].map((f) => (
        <label key={f.key} className="block">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">{f.label}</span>
          {f.type === 'date'
            ? <input type="date" value={filters[f.key]} onChange={set(f.key)} className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-none" />
            : <Select value={filters[f.key]} onChange={set(f.key)} placeholder="All" options={f.opts} className="py-1.5 text-xs" />}
        </label>
      ))}
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Management Dashboard</h1>
          <p className="text-xs text-slate-500">Live overview of all technology issues, RCA, solutions and monitoring.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowFilters((v) => !v)}><Filter className="h-3.5 w-3.5" /> Filters</Button>
          <Button size="sm" onClick={() => navigate('/issues/new')}>+ New Issue</Button>
        </div>
      </div>

      {showFilters && <Card className="animate-fade-up">{filterBar}</Card>}

      {/* KPI CARDS */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {KPI_DEFS.map((k) => (
          <StatCard key={k.key} label={k.label} icon={k.icon} tone={k.tone} loading={loading} value={dash?.kpi?.[k.key] ?? 0} />
        ))}
      </div>

      {/* SLA + resolution strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-rose-50 p-2"><AlertOctagon className="h-5 w-5 text-rose-600" /></div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">SLA Overdue</p>
              <p className="text-xl font-bold text-rose-600">{loading ? '…' : dash?.sla?.overdue ?? 0}</p>
            </div>
          </div>
        </Card>
        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-50 p-2"><Activity className="h-5 w-5 text-amber-600" /></div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">SLA At Risk</p>
              <p className="text-xl font-bold text-amber-600">{loading ? '…' : dash?.sla?.atRisk ?? 0}</p>
            </div>
          </div>
        </Card>
        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-50 p-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" /></div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">SLA On Track</p>
              <p className="text-xl font-bold text-emerald-600">{loading ? '…' : dash?.sla?.onTrack ?? 0}</p>
            </div>
          </div>
        </Card>
        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-50 p-2"><Globe2 className="h-5 w-5 text-indigo-600" /></div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">Avg Resolution</p>
              <p className="text-xl font-bold text-indigo-600">{loading ? '…' : Math.round((dash?.kpi?.avgResolutionDays || 0) * 10) / 10} <span className="text-xs font-medium text-slate-400">days</span></p>
            </div>
          </div>
        </Card>
      </div>

      {/* AI INSIGHTS — previous-issue recognition metrics */}
      <div>
        <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
          <Brain className="h-4 w-4 text-violet-500" /> AI Insights — Historical Issue Recognition
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatCard label="AI Match Rate" value={`${dash?.kpi?.aiMatchRate ?? 0}%`} sub="of new issues had a previous similar issue" icon={Sparkles} tone="violet" loading={loading} />
          <StatCard label="With Previous Matches" value={dash?.kpi?.issuesWithMatches ?? 0} icon={Brain} tone="fuchsia" loading={loading} />
          <StatCard label="Without Previous Matches" value={dash?.kpi?.issuesWithoutMatches ?? 0} icon={ListChecks} tone="slate" loading={loading} />
          <StatCard label="Resolved Issues" value={dash?.kpi?.resolved ?? 0} icon={CheckCircle2} tone="emerald" loading={loading} />
          <StatCard label="Recurring Issues" value={dash?.kpi?.recurring ?? 0} icon={RotateCcw} tone="rose" loading={loading} />
          <StatCard label="Affected Clients" value={dash?.kpi?.affectedClients ?? 0} icon={Network} tone="indigo" loading={loading} />
        </div>
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Card title="Top Recurring Issues" subtitle="Confirmed same-issue occurrences">
            {loading ? <Skeleton className="h-40 w-full" /> : (dash?.kpi?.topRecurring || []).length === 0
              ? <p className="py-8 text-center text-xs text-slate-400">No recurring issues 🎉</p>
              : <BarChart data={dash.kpi.topRecurring} color="#e11d48" />}
          </Card>
          <Card title="Most Common RCA" subtitle="Most frequent root causes across tickets">
            {loading ? <Skeleton className="h-40 w-full" /> : <BarChart data={dash?.kpi?.mostCommonRCA || []} color="#7c3aed" />}
          </Card>
          <Card title="Most Common Systems" subtitle="Systems with the most issues">
            {loading ? <Skeleton className="h-40 w-full" /> : <BarChart data={dash?.kpi?.mostCommonSystems || []} color="#0ea5e9" />}
          </Card>
        </div>
      </div>

      {/* CHARTS */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Issues by Client" subtitle="Total issues reported per client">
          {loading ? <Skeleton className="h-52 w-full" /> : <BarChart data={dash.byClient} />}
        </Card>
        <Card title="Issues by Category">
          {loading ? <Skeleton className="h-52 w-full" /> : <BarChart data={dash.byCategory} />}
        </Card>
        <Card title="Issues by Priority">
          {loading ? <Skeleton className="h-52 w-full" /> : <DonutChart data={dash.byPriority} />}
        </Card>
        <Card title="Issues by Status">
          {loading ? <Skeleton className="h-52 w-full" /> : <BarChart data={dash.byStatus} />}
        </Card>
        <Card title="Issues by Month" subtitle="Reported issues — last 6 months">
          {loading ? <Skeleton className="h-52 w-full" /> : <ColumnChart data={dash.byMonth} />}
        </Card>
        <Card title="Recurring Issues by Client">
          {loading ? <Skeleton className="h-52 w-full" /> : dash.recurringByClient.length === 0
            ? <p className="py-10 text-center text-xs text-slate-400">No recurring issues 🎉</p>
            : <BarChart data={dash.recurringByClient} color="#e11d48" />}
        </Card>
        <Card title="Top Problematic Clients" subtitle="Ranked by total issue count">
          {loading ? <Skeleton className="h-52 w-full" /> : <BarChart data={dash.topClients.slice(0, 6)} color="#7c3aed" />}
        </Card>
        <Card title="Issue Aging — Open Issues" subtitle="How long open issues have been pending">
          {loading ? <Skeleton className="h-52 w-full" /> : <BarChart data={dash.aging} color="#ea580c" />}
        </Card>
      </div>

      {/* RECENT ISSUES */}
      <Card
        title="Recent Issues"
        subtitle={`${recent.total} issue(s) in the system`}
        actions={<Button variant="secondary" size="sm" onClick={() => navigate('/issues')}>View all</Button>}
        padding={false}
      >
        <IssueTable rows={recent.items} loading={recent.loading} />
      </Card>
      <p className="pb-4 text-center text-[11px] text-slate-400">
        Dashboard data refreshed as of {fmtDate(new Date())} · All KPIs computed from live issue records
      </p>
    </div>
  )
}
