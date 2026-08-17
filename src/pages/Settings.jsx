import { useEffect, useState } from 'react'
import { Settings as SettingsIcon, Plus, Pencil, Trash2, ShieldAlert } from 'lucide-react'
import { api } from '../services/backend'
import { useAuth } from '../services/session'
import { useAsync } from '../hooks/useAsync'
import { Card, Tabs, Badge, Button, Modal, Field, Input, Select, toast, useConfirm, DataTable } from '../components/ui'
import { can, ROLES, ROLE_LABELS } from '../utils/constants'

export default function Settings() {
  const { user } = useAuth()
  const [tab, setTab] = useState('sla')
  const isAdmin = user?.role === 'admin'

  const tabs = [
    { key: 'sla', label: 'SLA' },
    { key: 'clients', label: 'Clients' },
    { key: 'processes', label: 'Processes' },
    { key: 'categories', label: 'Categories' },
    { key: 'users', label: 'Users & Roles' },
    { key: 'recipients', label: 'Notification Recipients' },
    { key: 'periods', label: 'Monitoring Periods' },
    { key: 'similarity', label: 'AI Similarity' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-600 p-2.5"><SettingsIcon className="h-5 w-5 text-white" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Settings</h1>
            <p className="text-xs text-slate-500">All configuration is stored in the database — nothing is hardcoded.</p>
          </div>
        </div>
        {!isAdmin && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <ShieldAlert className="h-4 w-4" /> Read-only — only Admins can change settings.
          </div>
        )}
      </div>
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'sla' && <SlaTab isAdmin={isAdmin} />}
      {tab === 'clients' && <ClientsTab isAdmin={isAdmin} />}
      {tab === 'processes' && <ProcessesTab isAdmin={isAdmin} />}
      {tab === 'categories' && <CategoriesTab isAdmin={isAdmin} />}
      {tab === 'users' && <UsersTab isAdmin={isAdmin} />}
      {tab === 'recipients' && <RecipientsTab isAdmin={isAdmin} />}
      {tab === 'periods' && <PeriodsTab isAdmin={isAdmin} />}
      {tab === 'similarity' && <SimilarityTab isAdmin={isAdmin} />}
    </div>
  )
}

function SlaTab({ isAdmin }) {
  const { data, loading, reload } = useAsync(() => api.settings.get(), [])
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (data?.sla) setForm({ ...data.sla }) }, [data])
  if (loading || !data) return <Card><div className="skeleton h-40 w-full rounded-lg" /></Card>
  const sla = form || data.sla
  const save = async () => {
    setBusy(true)
    try { await api.settings.saveSla(sla); toast.success('SLA targets updated — applies to new SLA calculations immediately'); reload() }
    catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }
  return (
    <Card title="SLA Targets" subtitle="Days allowed per priority before an issue becomes overdue">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {['Critical', 'High', 'Medium', 'Low'].map((p) => (
          <Field key={p} label={p}>
            <Input type="number" min={1} disabled={!isAdmin} value={sla[p] ?? ''}
              onChange={(e) => setForm({ ...sla, [p]: Number(e.target.value) || 0 })} />
          </Field>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-400">SLA status is computed by the backend: On Track → At Risk (last day) → Overdue (past due date).</p>
      {isAdmin && <div className="mt-4"><Button disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save SLA'}</Button></div>}
    </Card>
  )
}

function ClientsTab({ isAdmin }) {
  const { data, loading, reload } = useAsync(() => api.clients.list(), [])
  const [edit, setEdit] = useState(null)
  const [form, setForm] = useState(null)
  const open = (c) => { setForm(c ? { ...c } : { client_code: '', client_name: '', owner: '', active: true, relevant_for_client_wide_check: true }); setEdit(c || {}) }
  const save = async () => {
    if (!form.client_code.trim() || !form.client_name.trim()) { toast.error('Code and name required'); return }
    await api.clients.save({ ...form, id: edit.id }); toast.success('Client saved'); setEdit(null); reload()
  }
  return (
    <Card title="Clients" subtitle="Managed in the database — controls which clients participate in client-wide checks"
      actions={isAdmin && <Button size="sm" onClick={() => open(null)}><Plus className="h-3.5 w-3.5" /> Add</Button>} padding={false}>
      <DataTable
        loading={loading} rows={data || []} rowKey="id"
        columns={[
          { key: 'code', label: 'Code', render: (r) => <span className="font-bold text-indigo-700">{r.client_code}</span> },
          { key: 'name', label: 'Client Name', render: (r) => <span className="font-medium">{r.client_name}</span> },
          { key: 'owner', label: 'Owner', render: (r) => <span className="text-xs">{r.owner || '—'}</span> },
          { key: 'active', label: 'Active', render: (r) => <Badge className={r.active ? 'bg-emerald-100 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-500 ring-slate-200'}>{r.active ? 'Yes' : 'No'}</Badge> },
          { key: 'check', label: 'Client-Wide Check', render: (r) => <Badge className={r.relevant_for_client_wide_check ? 'bg-indigo-50 text-indigo-700 ring-indigo-200' : 'bg-slate-100 text-slate-500 ring-slate-200'}>{r.relevant_for_client_wide_check ? 'Included' : 'Excluded'}</Badge> },
          { key: 'actions', label: '', render: (r) => isAdmin && <Button variant="ghost" size="sm" onClick={() => open(r)}><Pencil className="h-3.5 w-3.5" /></Button> },
        ]}
      />
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit Client' : 'Add Client'}>
        {form && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Client Code" required><Input value={form.client_code} onChange={(e) => setForm({ ...form, client_code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Client Name" required><Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} /></Field>
            <Field label="Owner" className="col-span-2"><Input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-indigo-600" /> Active</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.relevant_for_client_wide_check} onChange={(e) => setForm({ ...form, relevant_for_client_wide_check: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-indigo-600" /> Relevant for client-wide check</label>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save}>Save</Button></div>
      </Modal>
    </Card>
  )
}

function ProcessesTab({ isAdmin }) {
  return <SimpleCrud title="Processes" isAdmin={isAdmin} apiList={api.processes.list} apiSave={api.processes.save} apiRemove={api.processes.remove} fieldLabel="Process Name" />
}

function CategoriesTab({ isAdmin }) {
  return <SimpleCrud title="Categories" isAdmin={isAdmin} apiList={api.categories.list} apiSave={api.categories.save} apiRemove={api.categories.remove} fieldLabel="Category Name" />
}

function SimpleCrud({ title, isAdmin, apiList, apiSave, apiRemove, fieldLabel }) {
  const confirm = useConfirm()
  const { data, loading, reload } = useAsync(() => apiList(), [])
  const [edit, setEdit] = useState(null)
  const [name, setName] = useState('')
  const open = (r) => { setEdit(r || {}); setName(r?.process_name || r?.category_name || '') }
  const save = async () => {
    if (!name.trim()) { toast.error(`${fieldLabel} is required`); return }
    const key = edit.process_name !== undefined ? 'process_name' : 'category_name'
    await apiSave({ id: edit.id, [key]: name.trim(), active: edit.active !== false }, null)
    toast.success('Saved'); setEdit(null); reload()
  }
  const remove = async (r) => {
    if (await confirm({ title: 'Delete?', message: 'This item will be removed from the configuration.', danger: true, confirmText: 'Delete' })) {
      await apiRemove(r.id); toast.success('Deleted'); reload()
    }
  }
  const labelOf = (r) => r.process_name || r.category_name
  return (
    <Card title={title} actions={isAdmin && <Button size="sm" onClick={() => open({})}><Plus className="h-3.5 w-3.5" /> Add</Button>} padding={false}>
      <DataTable
        loading={loading} rows={data || []} rowKey="id"
        columns={[
          { key: 'name', label: fieldLabel, render: (r) => <span className="font-medium">{labelOf(r)}</span> },
          { key: 'active', label: 'Active', render: (r) => <Badge className={r.active ? 'bg-emerald-100 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-500 ring-slate-200'}>{r.active ? 'Yes' : 'No'}</Badge> },
          { key: 'actions', label: '', render: (r) => isAdmin && (
            <span className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => open(r)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="sm" onClick={() => remove(r)}><Trash2 className="h-3.5 w-3.5 text-rose-500" /></Button>
            </span>
          ) },
        ]}
      />
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `Edit ${fieldLabel}` : `Add ${fieldLabel}`}>
        <Field label={fieldLabel} required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={edit?.active !== false} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-indigo-600" /> Active</label>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save}>Save</Button></div>
      </Modal>
    </Card>
  )
}

function UsersTab({ isAdmin }) {
  const { data, loading, reload } = useAsync(() => api.users.list(), [])
  const saveRole = async (u, role) => {
    try { await api.users.save({ ...u, role }); toast.success(`${u.name} role updated to ${ROLE_LABELS[role]}`); reload() }
    catch (err) { toast.error(err.message) }
  }
  return (
    <Card title="Users & Roles" subtitle="Roles: Admin (everything) · Manager (issues, RCA, solutions, checks, monitoring, recurrence, audit) · Tech Owner (assigned issues) · Viewer (read-only)" padding={false}>
      <DataTable
        loading={loading} rows={data || []} rowKey="id"
        columns={[
          { key: 'name', label: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
          { key: 'email', label: 'Email', render: (r) => <span className="text-xs text-slate-500">{r.email}</span> },
          { key: 'role', label: 'Role', render: (r) => isAdmin
            ? <Select value={r.role} onChange={(e) => saveRole(r, e.target.value)} options={ROLES.map((v) => ({ value: v, label: ROLE_LABELS[v] }))} className="w-36 py-1.5 text-xs" />
            : <Badge className="bg-indigo-50 text-indigo-700 ring-indigo-200">{ROLE_LABELS[r.role]}</Badge> },
          { key: 'active', label: 'Active', render: (r) => <Badge className={r.active ? 'bg-emerald-100 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-500 ring-slate-200'}>{r.active ? 'Yes' : 'No'}</Badge> },
        ]}
      />
      <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
        In production, authentication is handled by Supabase Auth; this table stores each user's role and profile.
      </p>
    </Card>
  )
}

function RecipientsTab({ isAdmin }) {
  const { data, loading, reload } = useAsync(() => api.settings.listRecipients(), [])
  const [edit, setEdit] = useState(null)
  const [form, setForm] = useState(null)
  const open = (r) => { setForm(r ? { ...r } : { email: '', name: '', notify_critical: true, notify_high: true, notify_sla: true, active: true }); setEdit(r || {}) }
  const save = async () => {
    if (!form.email.includes('@')) { toast.error('Valid email required'); return }
    await api.settings.saveRecipient({ ...form, id: edit.id }); toast.success('Recipient saved'); setEdit(null); reload()
  }
  return (
    <Card title="Notification Recipients" subtitle="These emails receive system notifications (backend also sends SMTP emails when configured)"
      actions={isAdmin && <Button size="sm" onClick={() => open(null)}><Plus className="h-3.5 w-3.5" /> Add</Button>} padding={false}>
      <DataTable
        loading={loading} rows={data || []} rowKey="id"
        columns={[
          { key: 'name', label: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
          { key: 'email', label: 'Email', render: (r) => <span className="text-xs text-slate-500">{r.email}</span> },
          { key: 'critical', label: 'Critical', render: (r) => <Badge className={r.notify_critical ? 'bg-rose-100 text-rose-700 ring-rose-200' : 'bg-slate-100 text-slate-500 ring-slate-200'}>{r.notify_critical ? 'Yes' : 'No'}</Badge> },
          { key: 'high', label: 'High', render: (r) => <Badge className={r.notify_high ? 'bg-orange-100 text-orange-700 ring-orange-200' : 'bg-slate-100 text-slate-500 ring-slate-200'}>{r.notify_high ? 'Yes' : 'No'}</Badge> },
          { key: 'sla', label: 'SLA', render: (r) => <Badge className={r.notify_sla ? 'bg-amber-100 text-amber-700 ring-amber-200' : 'bg-slate-100 text-slate-500 ring-slate-200'}>{r.notify_sla ? 'Yes' : 'No'}</Badge> },
          { key: 'actions', label: '', render: (r) => isAdmin && <Button variant="ghost" size="sm" onClick={() => open(r)}><Pencil className="h-3.5 w-3.5" /></Button> },
        ]}
      />
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit Recipient' : 'Add Recipient'}>
        {form && (
          <div className="grid grid-cols-1 gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Email" required><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            </div>
            <div className="flex flex-wrap gap-5">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.notify_critical} onChange={(e) => setForm({ ...form, notify_critical: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-indigo-600" /> Critical issues</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.notify_high} onChange={(e) => setForm({ ...form, notify_high: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-indigo-600" /> High issues</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.notify_sla} onChange={(e) => setForm({ ...form, notify_sla: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-indigo-600" /> SLA alerts</label>
            </div>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save}>Save</Button></div>
      </Modal>
    </Card>
  )
}

function PeriodsTab({ isAdmin }) {
  const { data, loading, reload } = useAsync(() => api.settings.get(), [])
  const [periods, setPeriods] = useState(null)
  useEffect(() => { if (data?.monitoring_periods) setPeriods([...data.monitoring_periods]) }, [data])
  if (loading || !data) return <Card><div className="skeleton h-32 w-full rounded-lg" /></Card>
  const list = periods || data.monitoring_periods
  const toggle = (d) => {
    const next = list.includes(d) ? list.filter((x) => x !== d) : [...list, d].sort((a, b) => a - b)
    setPeriods(next)
  }
  const save = async () => {
    if (!list.length) { toast.error('At least one period required'); return }
    await api.settings.savePeriods(list); toast.success('Monitoring periods updated'); reload()
  }
  return (
    <Card title="Monitoring Periods" subtitle="Available period options when starting monitoring on an issue">
      <div className="flex flex-wrap gap-3">
        {[3, 7, 14, 30].map((d) => (
          <button key={d} onClick={() => isAdmin && toggle(d)} disabled={!isAdmin}
            className={`rounded-xl border px-6 py-4 text-center transition-colors ${list.includes(d) ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-400'}`}>
            <p className="text-2xl font-bold">{d}</p>
            <p className="text-xs font-semibold">days</p>
          </button>
        ))}
      </div>
      {isAdmin && <div className="mt-4"><Button onClick={save}>Save Periods</Button></div>}
    </Card>
  )
}

function SimilarityTab({ isAdmin }) {
  const { data, loading, reload } = useAsync(() => api.settings.get(), [])
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (data?.similarity) setForm({ high: Math.round(data.similarity.high * 100), medium: Math.round(data.similarity.medium * 100) }) }, [data])
  if (loading || !data) return <Card><div className="skeleton h-40 w-full rounded-lg" /></Card>
  const save = async () => {
    if (!form || form.medium > form.high) { toast.error('The High threshold must be greater than or equal to the Medium threshold'); return }
    setBusy(true)
    try {
      await api.settings.saveSimilarity({ high_threshold: form.high / 100, medium_threshold: form.medium / 100 })
      toast.success('Similarity thresholds updated'); reload()
    } catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }
  return (
    <Card
      title="AI Similarity Thresholds"
      subtitle="Controls how previous-issue matches are classified when a new ticket is created"
    >
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-2">
        <Field label="Very Similar Issue — minimum (%)" hint="90%+ recommended. Strong match → AI recommendation shown">
          <Input type="number" min={1} max={100} disabled={!isAdmin} value={form?.high ?? ''}
            onChange={(e) => setForm({ ...form, high: Number(e.target.value) || 0 })} />
        </Field>
        <Field label="Potentially Similar Issue — minimum (%)" hint="75% recommended. Below this, matches are shown as Low Similarity">
          <Input type="number" min={1} max={100} disabled={!isAdmin} value={form?.medium ?? ''}
            onChange={(e) => setForm({ ...form, medium: Number(e.target.value) || 0 })} />
        </Field>
      </div>
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <p><b>How it works:</b> when a ticket is created, the backend builds a search text (title, description, error, system, client, process, category), generates an embedding and runs a server-side pgvector search against all historical tickets. In demo mode a built-in local similarity engine is used. Configure <code>EMBEDDING_API_URL</code> + <code>EMBEDDING_API_KEY</code> in the backend for true semantic AI embeddings (OpenAI-compatible).</p>
        <p className="mt-2 text-slate-500">⚠️ The AI only recommends — it never modifies anything automatically. Linking and recurrence are always confirmed by a human.</p>
      </div>
      {isAdmin && <div className="mt-4"><Button disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save Thresholds'}</Button></div>}
    </Card>
  )
}
