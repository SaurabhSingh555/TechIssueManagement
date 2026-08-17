import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Pencil, Network } from 'lucide-react'
import { api } from '../services/backend'
import { useAuth } from '../services/session'
import { useAsync } from '../hooks/useAsync'
import { Card, Badge, Button, Modal, Field, Input, EmptyState, toast } from '../components/ui'
import { can } from '../utils/constants'

export default function Clients() {
  const { user } = useAuth()
  const { data: clients, loading, reload } = useAsync(() => api.clients.list(), [])
  const { data: issuesData } = useAsync(() => api.issues.list({ page: 1, page_size: 1000 }), [])
  const [edit, setEdit] = useState(null)
  const [form, setForm] = useState(null)
  const canManage = can(user?.role, 'manage_settings')

  const openEdit = (c) => { setForm(c ? { ...c } : { client_code: '', client_name: '', owner: '', active: true, relevant_for_client_wide_check: true }); setEdit(c || {}) }
  const save = async () => {
    if (!form.client_code.trim() || !form.client_name.trim()) { toast.error('Client code and name are required'); return }
    try {
      await api.clients.save({ ...form, id: edit.id })
      toast.success('Client saved'); setEdit(null); reload()
    } catch (err) { toast.error(err.message) }
  }

  const stats = (clientId) => {
    const list = (issuesData?.items || []).filter((i) => i.client_id === clientId)
    return {
      total: list.length,
      open: list.filter((i) => !['Closed', 'Resolved'].includes(i.status)).length,
      recurring: list.filter((i) => i.recurrence).length,
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-600 p-2.5"><Building2 className="h-5 w-5 text-white" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Clients</h1>
            <p className="text-xs text-slate-500">Clients flagged for client-wide checks are automatically included in every check.</p>
          </div>
        </div>
        {canManage && <Button size="sm" onClick={() => openEdit(null)}>+ Add Client</Button>}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(clients || []).map((c) => {
          const s = stats(c.id)
          return (
            <Card key={c.id} className="transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-sm font-bold text-indigo-600">{c.client_code}</div>
                  <div>
                    <p className="font-semibold text-slate-800">{c.client_name}</p>
                    <p className="text-xs text-slate-400">Owner: {c.owner || '—'}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <Badge className={c.active ? 'bg-emerald-100 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-500 ring-slate-200'}>{c.active ? 'Active' : 'Inactive'}</Badge>
                  {c.relevant_for_client_wide_check && (
                    <Badge className="bg-indigo-50 text-indigo-700 ring-indigo-200"><Network className="h-3 w-3" /> In client-wide checks</Badge>
                  )}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center">
                <div><p className="text-lg font-bold text-slate-800">{s.total}</p><p className="text-[10px] font-bold uppercase text-slate-400">Issues</p></div>
                <div><p className="text-lg font-bold text-amber-600">{s.open}</p><p className="text-[10px] font-bold uppercase text-slate-400">Open</p></div>
                <div><p className="text-lg font-bold text-rose-600">{s.recurring}</p><p className="text-[10px] font-bold uppercase text-slate-400">Recurring</p></div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Link to={`/issues?client_id=${c.id}`} className="text-xs font-semibold text-indigo-600 hover:underline">View issues</Link>
                {canManage && <Button variant="ghost" size="sm" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>}
              </div>
            </Card>
          )
        })}
      </div>
      {(clients || []).length === 0 && !loading && (
        <Card className="border-dashed">
          <EmptyState
            title="No clients yet"
            subtitle="Add your first client to start logging technology issues. Clients marked 'relevant for client-wide check' are automatically included in every client-wide check."
            action={canManage && <Button size="sm" onClick={() => openEdit(null)}>+ Add Client</Button>}
          />
        </Card>
      )}
      {loading && <p className="text-center text-xs text-slate-400">Loading clients…</p>}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit Client' : 'Add Client'}>
        {form && (
          <div className="grid grid-cols-1 gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Client Code" required><Input value={form.client_code} onChange={(e) => setForm({ ...form, client_code: e.target.value.toUpperCase() })} placeholder="FAB" /></Field>
              <Field label="Client Name" required><Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} /></Field>
            </div>
            <Field label="Owner"><Input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} /></Field>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-indigo-600" /> Active
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.relevant_for_client_wide_check} onChange={(e) => setForm({ ...form, relevant_for_client_wide_check: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-indigo-600" /> Relevant for client-wide check
              </label>
            </div>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button>
          <Button onClick={save}>Save Client</Button>
        </div>
      </Modal>
    </div>
  )
}
