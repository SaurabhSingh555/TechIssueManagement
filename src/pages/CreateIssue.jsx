import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, ChevronDown, Paperclip, Send } from 'lucide-react'
import { api } from '../services/backend'
import { useAuth } from '../services/session'
import { Card, Button, Field, Input, Select, Textarea, toast } from '../components/ui'
import { useLoaded } from './IssueList'

export default function CreateIssue() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: clients, loading: clientsLoading } = useLoaded(() => api.clients.list())
  const { data: processes } = useLoaded(() => api.processes.list())
  const { data: categories } = useLoaded(() => api.categories.list())
  const { data: users } = useLoaded(() => api.users.list())
  const techUsers = (users || []).filter((u) => ['tech_owner', 'manager', 'admin'].includes(u.role))

  const [form, setForm] = useState({
    client_id: '', process_id: '', category_id: '', issue_title: '', issue_description: '',
    business_impact: '', priority: 'Medium', reported_by: user?.name || '', assigned_to: '',
    system_name: '', error_message: '',
    client_wide_check_required: false, monitoring_required: false, monitoring_period: null,
  })
  const [attachment, setAttachment] = useState(null)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const validate = () => {
    const errs = {}
    if (!form.client_id) errs.client_id = 'Client is required'
    if (!form.issue_title.trim()) errs.issue_title = 'Issue title is required'
    if (form.issue_title.trim().length < 5) errs.issue_title = 'Title must be at least 5 characters'
    if (!form.issue_description.trim()) errs.issue_description = 'Issue description is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!validate()) { toast.error('Please fix the highlighted fields.'); return }
    setBusy(true)
    try {
      const created = await api.issues.create({
        ...form,
        attachment: attachment ? { file_name: attachment.name, file_type: attachment.type } : null,
      })
      const matchCount = created.similar_matches?.length || 0
      toast.success(matchCount > 0
        ? `Issue ${created.issue_id} created — 🔍 ${matchCount} previous similar issue(s) found`
        : `Issue ${created.issue_id} created successfully`)
      navigate(`/issues/${created.issue_id}?view=similar`)
    } catch (err) {
      toast.error(err.message || 'Failed to create issue')
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /> Back</Button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Create Issue</h1>
          <p className="text-xs text-slate-500">A unique ID (TECH-YYYY-NNN) is generated automatically by the backend.</p>
        </div>
      </div>

      {(clients || []).length === 0 && !clientsLoading && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <p className="text-sm text-amber-800">
            No clients are configured yet. Add your clients first in{' '}
            <Link to="/settings" className="font-semibold underline">Settings → Clients</Link>, then create the issue.
          </p>
        </div>
      )}

      <form onSubmit={submit} className="space-y-5">
        <Card title="Issue Information" subtitle="Client, process and classification">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Client" required hint="Mandatory — every issue belongs to a client">
              <Select value={form.client_id} onChange={set('client_id')} placeholder="Select client…" options={(clients || []).map((c) => ({ value: c.id, label: `${c.client_name} (${c.client_code})` }))} className={errors.client_id ? 'border-rose-400' : ''} />
              {errors.client_id && <span className="mt-1 block text-xs text-rose-600">{errors.client_id}</span>}
            </Field>
            <Field label="Process">
              <Select value={form.process_id} onChange={set('process_id')} placeholder="Select process…" options={(processes || []).map((p) => ({ value: p.id, label: p.process_name }))} />
            </Field>
            <Field label="Application / System" hint="e.g. SmartPing, ERP, Portal — helps find similar past issues">
              <Input value={form.system_name} onChange={set('system_name')} placeholder="e.g. SmartPing, ERP, Portal" />
            </Field>
            <Field label="Error Message" hint="The exact error shown, if any — helps the AI match past issues">
              <Input value={form.error_message} onChange={set('error_message')} placeholder="e.g. 401 Unauthorized" />
            </Field>
            <Field label="Category">
              <Select value={form.category_id} onChange={set('category_id')} placeholder="Select category…" options={(categories || []).map((c) => ({ value: c.id, label: c.category_name }))} />
            </Field>
            <Field label="Priority" required>
              <Select value={form.priority} onChange={set('priority')} options={['Critical', 'High', 'Medium', 'Low'].map((v) => ({ value: v, label: v }))} />
            </Field>
            <Field label="Issue Title" required hint="A short one-line summary, e.g. “Reports are not opening”" className="sm:col-span-2">
              <Input value={form.issue_title} onChange={set('issue_title')} placeholder="Short, specific summary of the issue" className={errors.issue_title ? 'border-rose-400' : ''} />
              {errors.issue_title && <span className="mt-1 block text-xs text-rose-600">{errors.issue_title}</span>}
            </Field>
            <Field label="Issue Description" required hint="Describe in simple words: what happened, when, and what you saw on screen" className="sm:col-span-2">
              <Textarea rows={4} value={form.issue_description} onChange={set('issue_description')} placeholder="What happened, when, where, and any error details…" className={errors.issue_description ? 'border-rose-400' : ''} />
              {errors.issue_description && <span className="mt-1 block text-xs text-rose-600">{errors.issue_description}</span>}
            </Field>
            <Field label="Business Impact" hint="Optional — how is this affecting the business?" className="sm:col-span-2">
              <Textarea rows={3} value={form.business_impact} onChange={set('business_impact')} placeholder="Impact on business operations, clients, revenue…" />
            </Field>
            <Field label="Attachment (optional)" hint="A screenshot or error message helps the tech team investigate faster" className="sm:col-span-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-500 hover:border-indigo-400 hover:text-indigo-600">
                <Paperclip className="h-4 w-4" />
                <span className="truncate">{attachment ? attachment.name : 'Choose file…'}</span>
                <input type="file" className="hidden" onChange={(e) => setAttachment(e.target.files?.[0] || null)} />
              </label>
            </Field>
          </div>
        </Card>

        <Card title="Advanced Options" subtitle="You can skip this section — everything is pre-filled for you">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            <span>{showAdvanced ? 'Hide advanced options' : 'Show advanced options'}</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
          </button>
          {showAdvanced && (
            <div className="animate-fade-up mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Reported By">
                <Input value={form.reported_by} onChange={set('reported_by')} placeholder="Name of the person who reported" />
              </Field>
              <Field label="Assign To" hint="Optional — can be assigned later">
                <Select value={form.assigned_to} onChange={set('assigned_to')} placeholder="Unassigned" options={techUsers.map((u) => ({ value: u.id, label: `${u.name} (${u.role})` }))} />
              </Field>
            </div>
          )}
        </Card>

        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-xs text-slate-500">
            New issues start with status <b>New</b> · Auto-generated ID · Notifications sent for Critical/High issues
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" disabled={busy}><Send className="h-4 w-4" /> {busy ? 'Creating…' : 'Create Issue'}</Button>
          </div>
        </div>
      </form>
    </div>
  )
}
