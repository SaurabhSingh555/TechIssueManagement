import { useState } from 'react'
import { Download, BarChart3 } from 'lucide-react'
import { api } from '../services/backend'
import { useAsync } from '../hooks/useAsync'
import { Card, Tabs, DataTable, Button, Select, toast } from '../components/ui'
import { downloadCSV } from '../utils/csv'

const REPORT_TYPES = [
  { key: 'monthly', label: 'Monthly Tech Issue Report' },
  { key: 'client', label: 'Client-wise Report' },
  { key: 'category', label: 'Category-wise Report' },
  { key: 'rca', label: 'RCA Effectiveness' },
  { key: 'solution', label: 'Solution Effectiveness' },
  { key: 'recurrence', label: 'Recurrence Report' },
]

export default function Reports() {
  const [type, setType] = useState('monthly')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const { data, loading, reload } = useAsync(() => api.reports.get(type, { date_from: dateFrom, date_to: dateTo }), [type, dateFrom, dateTo])

  const exportCsv = async () => {
    try {
      // Server-side export is available in production at /api/reports/{type}/export.
      // Client-side export uses the same data so it works identically in demo mode.
      const report = data || await api.reports.get(type, { date_from: dateFrom, date_to: dateTo })
      downloadCSV(`tims-${type}-report-${new Date().toISOString().slice(0, 10)}.csv`, report.columns, report.rows)
      toast.success('CSV exported')
    } catch (err) { toast.error(err.message) }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-600 p-2.5"><BarChart3 className="h-5 w-5 text-white" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Reports</h1>
            <p className="text-xs text-slate-500">Management reports with CSV export.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Date From</span><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" /></label>
          <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Date To</span><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" /></label>
          <Button variant="success" onClick={exportCsv} disabled={!data || !data.rows?.length}><Download className="h-4 w-4" /> Export CSV</Button>
        </div>
      </div>

      <Tabs tabs={REPORT_TYPES} active={type} onChange={setType} />

      <Card title={data?.title || 'Report'} subtitle={type === 'monthly' ? 'Monthly key metrics for the selected period' : 'Report data reflects the selected filters'} padding={false}>
        <DataTable
          loading={loading}
          rowKey={(type === 'monthly' || type === 'client' || type === 'category') ? 'label' : 'issue'}
          columns={(data?.columns || []).map((c) => ({ key: c.key, label: c.label }))}
          rows={data?.rows || []}
        />
      </Card>
      <p className="text-center text-[11px] text-slate-400">
        Production tip: the FastAPI backend also exposes server-side CSV endpoints — GET /api/reports/&#123;type&#125;/export
      </p>
    </div>
  )
}
