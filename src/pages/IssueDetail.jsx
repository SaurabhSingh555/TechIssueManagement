import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, ClipboardList, FlaskConical, Network, Activity, Repeat2, Paperclip, ScrollText, History,
  Lock, LockOpen, Play, Plus, CheckCircle2, AlertTriangle, XCircle, Clock, Sparkles,
} from 'lucide-react'
import SimilarIssues from '../components/SimilarIssues'
import { api } from '../services/backend'
import { useAuth } from '../services/session'
import { useAsync } from '../hooks/useAsync'
import { Card, Badge, Button, Modal, Field, Input, Select, Textarea, Tabs, EmptyState, StatusBadge, PriorityBadge, toast, useConfirm, DataTable, Skeleton } from '../components/ui'
import { STATUSES, TIMELINE_STEPS, can, EFFECTIVENESS_OPTIONS, SOLUTION_TYPES, RCA_STATUSES } from '../utils/constants'
import { fmtDate, fmtDateTime, slaInfo, agingBucket, relTime, AGING_COLORS, SLA_COLORS, cx } from '../utils/format'

export default function IssueDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { user } = useAuth()
  const confirm = useConfirm()
  const { data, loading, error, reload } = useAsync(() => api.issues.get(id), [id])
  const [tab, setTab] = useState('overview')

  // After creating a ticket, we land here with ?view=similar to show AI matches
  useEffect(() => {
    if (params.get('view') === 'similar') setTab('similar')
  }, [params])
  const [closeModal, setCloseModal] = useState(false)
  const [reopenModal, setReopenModal] = useState(false)
  const [canCloseResult, setCanCloseResult] = useState(null)
  const [closeRemarks, setCloseRemarks] = useState('')
  const [reopenDesc, setReopenDesc] = useState('')

  if (loading) return <DetailSkeleton />
  if (error || !data) return <EmptyState title="Issue not found" subtitle={error?.message} action={<Button onClick={() => navigate('/issues')}>Back to issues</Button>} />

  const issue = data.issue
  const sla = slaInfo(issue)
  const isClosed = issue.status === 'Closed'

  const requestClose = async () => {
    try {
      const result = await api.issues.canClose(issue.issue_id)
      setCanCloseResult(result)
      setCloseModal(true)
    } catch (err) { toast.error(err.message) }
  }

  const doClose = async () => {
    try {
      await api.issues.close(issue.issue_id, closeRemarks)
      toast.success(`${issue.issue_id} closed successfully`)
      setCloseModal(false); reload()
    } catch (err) {
      toast.error('Closure blocked by the backend:\n' + (err.blocking_reasons || []).map((r) => `• ${r}`).join('\n'))
      setCloseModal(false)
    }
  }

  const doReopen = async () => {
    try {
      await api.issues.reopen(issue.issue_id, { description: reopenDesc })
      toast.warn(`${issue.issue_id} reopened — new RCA and corrective cycle started`)
      setReopenModal(false); reload()
    } catch (err) { toast.error(err.message) }
  }

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'similar', label: 'Similar Issues', count: (data.similar || []).length },
    { key: 'rca', label: 'RCA', count: data.rca.length },
    { key: 'solutions', label: 'Solutions', count: data.solutions.length },
    { key: 'recurrence', label: 'Recurrence', count: data.recurrences.length },
    { key: 'attachments', label: 'Attachments', count: data.attachments.length },
    { key: 'audit', label: 'Audit History' },
    { key: 'timeline', label: 'Timeline' },
  ]

  return (
    <div className="space-y-5">
      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" className="mt-1" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900">{issue.issue_id}</h1>
              <StatusBadge status={issue.status} />
              <PriorityBadge priority={issue.priority} />
              {issue.recurrence && <Badge className="bg-rose-100 text-rose-700 ring-rose-200"><Repeat2 className="h-3 w-3" /> Recurred ×{issue.recurrence_count}</Badge>}
            </div>
            <p className="mt-1 text-sm font-medium text-slate-700">{issue.issue_title}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {issue.client_name} · {issue.process_name || 'No process'} · {issue.category_name || 'Uncategorized'} · Reported {fmtDate(issue.reported_date)} by {issue.reported_by}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge className={AGING_COLORS[agingBucket(sla.daysOpen)]}>Aging: {agingBucket(sla.daysOpen)} ({sla.daysOpen}d)</Badge>
              <Badge className={SLA_COLORS[sla.status]}>SLA: {sla.status} · Due {fmtDate(sla.due)}</Badge>
              <Badge className="bg-slate-100 text-slate-600 ring-slate-200">Assigned: {issue.assigned_name || 'Unassigned'}</Badge>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <QuickStatus issue={issue} onDone={reload} />
          <QuickAssign issue={issue} onDone={reload} />
          {!isClosed && can(user?.role, 'close_issue') && (
            <Button variant="success" onClick={requestClose}><Lock className="h-4 w-4" /> Close Issue</Button>
          )}
          {isClosed && can(user?.role, 'reopen_issue') && (
            <Button variant="danger" onClick={() => setReopenModal(true)}><LockOpen className="h-4 w-4" /> Reopen (Recurrence)</Button>
          )}
        </div>
      </div>

      {issue.recurrence && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <Repeat2 className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
          <div>
            <p className="text-sm font-bold text-rose-800">🚨 Recurring Issue</p>
            <p className="mt-0.5 text-xs text-rose-700">
              This issue has occurred <b>{issue.recurrence_count || 1} time(s)</b> based on confirmed same-issue links.
              {issue.closure_remarks ? <> Previous successful resolution: <b>{issue.closure_remarks}</b></> : <> Check the Similar Issues tab for the previous successful resolution.</>}
            </p>
            <p className="mt-1 text-xs font-medium text-rose-600">
              Warning: the previous solution may not be a permanent fix. A new RCA and corrective action cycle is required.
            </p>
          </div>
        </div>
      )}

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'overview' && <Overview issue={issue} />}
      {tab === 'similar' && (
        <SimilarIssues
          issue={issue}
          matches={data.similar || []}
          relationships={data.relationships || []}
          onDone={reload}
        />
      )}
      {tab === 'rca' && <RcaTab issue={issue} logs={data.rca} onDone={reload} />}
      {tab === 'solutions' && <SolutionsTab issue={issue} solutions={data.solutions} onDone={reload} />}
      {tab === 'recurrence' && <RecurrenceTab issue={issue} records={data.recurrences} onDone={reload} />}
      {tab === 'attachments' && <AttachmentsTab issue={issue} files={data.attachments} onDone={reload} />}
      {tab === 'audit' && <AuditTab issueId={issue.issue_id} />}
      {tab === 'timeline' && <TimelineTab issue={issue} />}

      {/* CLOSE MODAL */}
      <Modal open={closeModal} onClose={() => setCloseModal(false)} title={`Close ${issue.issue_id}`} subtitle="Closure is validated by the backend closure engine">
        {canCloseResult && !canCloseResult.allowed && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-rose-700"><XCircle className="h-4 w-4" /> Closure BLOCKED — {canCloseResult.blocking_reasons.length} reason(s)</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-rose-700">
              {canCloseResult.blocking_reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
            <p className="mt-3 text-xs text-rose-600">Complete the pending checks before attempting closure. This attempt has been recorded in the audit log.</p>
          </div>
        )}
        {canCloseResult?.allowed && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> All closure prerequisites satisfied</p>
            <p className="mt-1 text-xs text-emerald-600">RCA ✓ · Permanent Solution ✓ · Testing ✓ · Client-Wide Check ✓ · Global Fix ✓ · Monitoring ✓</p>
          </div>
        )}
        <Field label="Closure Remarks">
          <Textarea value={closeRemarks} onChange={(e) => setCloseRemarks(e.target.value)} placeholder="Final summary of resolution and monitoring outcome…" />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setCloseModal(false)}>Cancel</Button>
          <Button variant="success" disabled={!canCloseResult?.allowed} onClick={doClose}><Lock className="h-4 w-4" /> Confirm Close</Button>
        </div>
      </Modal>

      {/* REOPEN MODAL */}
      <Modal open={reopenModal} onClose={() => setReopenModal(false)} title={`Reopen ${issue.issue_id} as Recurrence`} subtitle="A full new RCA + corrective cycle will be started">
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs text-amber-700">
            Reopening will automatically: mark <b>recurrence = Yes</b>, increment <b>recurrence_count</b>, create a <b>recurrence_tracker</b> record,
            and require a new RCA, solution, testing, client-wide check and monitoring. The original closure history is never deleted.
          </p>
        </div>
        <Field label="Recurrence Description" required>
          <Textarea rows={3} value={reopenDesc} onChange={(e) => setReopenDesc(e.target.value)} placeholder="Describe how the issue reappeared…" />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setReopenModal(false)}>Cancel</Button>
          <Button variant="danger" disabled={!reopenDesc.trim()} onClick={doReopen}><Repeat2 className="h-4 w-4" /> Reopen Issue</Button>
        </div>
      </Modal>
    </div>
  )
}

// ---------------- OVERVIEW ----------------
function Overview({ issue }) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card title="Issue Information">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Info label="Issue ID" value={issue.issue_id} />
          <Info label="Status" value={<StatusBadge status={issue.status} />} />
          <Info label="Priority" value={<PriorityBadge priority={issue.priority} />} />
          <Info label="Client" value={issue.client_name} />
          <Info label="Process" value={issue.process_name} />
          <Info label="Category" value={issue.category_name} />
          <Info label="Reported By" value={issue.reported_by} />
          <Info label="Reported Date" value={fmtDate(issue.reported_date)} />
          <Info label="Assigned To" value={issue.assigned_name || '—'} />
          <Info label="Created" value={fmtDateTime(issue.created_at)} />
          <Info label="Last Updated" value={fmtDateTime(issue.updated_at)} />
          <Info label="Closure Date" value={issue.closure_date ? fmtDateTime(issue.closure_date) : '—'} />
        </dl>
        <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-400">Issue Description</p>
        <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-700">{issue.issue_description}</p>
      </Card>
      <div className="space-y-5">
        <Card title="Business Impact">
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{issue.business_impact || 'Not specified.'}</p>
        </Card>
        <Card title="Workflow Checkpoints">
          <div className="grid grid-cols-2 gap-3">
            <Checkpoint icon={ClipboardList} label="RCA" value={issue.root_cause ? 'Documented' : 'Pending'} ok={!!issue.root_cause} />
            <Checkpoint icon={FlaskConical} label="Permanent Solution" value={issue.permanent_solution ? 'Defined' : 'Pending'} ok={!!issue.permanent_solution} />
            <Checkpoint icon={Activity} label="Testing" value={issue.testing_status === 'Passed' ? 'Passed' : issue.testing_status || 'Pending'} ok={issue.testing_status === 'Passed'} />
            <Checkpoint icon={AlertTriangle} label="Global Fix" value={issue.global_fix_required ? issue.global_fix_status : 'Not Required'} ok={!issue.global_fix_required || issue.global_fix_status === 'Completed'} />
          </div>
        </Card>
        <Card title="Root Cause (Latest)">
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{issue.root_cause || 'Not yet documented. Add an RCA record.'}</p>
        </Card>
        <Card title="Solutions">
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-amber-600">Temporary</p>
              <p className="mt-0.5 text-slate-700">{issue.temporary_solution || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-600">Permanent</p>
              <p className="mt-0.5 text-slate-700">{issue.permanent_solution || '—'}</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

function Info({ label, value }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-800">{value}</dd>
    </div>
  )
}

function Checkpoint({ icon: Icon, label, value, ok }) {
  return (
    <div className={cx('flex items-center gap-3 rounded-lg border p-3', ok ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60')}>
      <div className={cx('rounded-lg p-1.5', ok ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600')}><Icon className="h-4 w-4" /></div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
        <p className={cx('text-sm font-semibold', ok ? 'text-emerald-700' : 'text-amber-700')}>{value}</p>
      </div>
    </div>
  )
}

// ---------------- RCA ----------------
function RcaTab({ issue, logs, onDone }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [verifyRec, setVerifyRec] = useState(null)
  const [verifyNotes, setVerifyNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ root_cause: '', technical_cause: '', process_cause: '', contributing_factors: '', temporary_fix: '', permanent_fix: '', preventive_action: '', investigation: '', verification_notes: '', owner: user?.name || '', status: 'In Progress', remarks: '' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const canManage = can(user?.role, 'manage_rca')

  const doVerify = async () => {
    setBusy(true)
    try {
      await api.rca.update(verifyRec.id, { verified: true, verification_notes: verifyNotes })
      toast.success('RCA verified — recorded in history')
      setVerifyRec(null); setVerifyNotes(''); onDone()
    } catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }

  const submit = async () => {
    if (!form.root_cause.trim()) { toast.error('Root cause is required'); return }
    setBusy(true)
    try {
      await api.rca.create(issue.issue_id, form)
      toast.success('RCA record added — previous RCA history is preserved')
      setOpen(false); onDone()
    } catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }

  return (
    <Card
      title="Root Cause Analysis (RCA)" subtitle="Multiple RCA records per issue are supported — history is never overwritten"
      actions={canManage && <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> New RCA</Button>}
      padding={false}
    >
      {logs.length === 0
        ? <EmptyState title="No RCA records yet" subtitle="Document the root cause analysis to move the issue forward." />
        : (
          <div className="space-y-4 p-5">
            {logs.map((r) => (
              <div key={r.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-800">{fmtDate(r.rca_date)}</span>
                    <Badge className={r.status === 'Completed' ? 'bg-emerald-100 text-emerald-700 ring-emerald-200' : r.status === 'Superseded' ? 'bg-slate-100 text-slate-500 ring-slate-200' : 'bg-violet-100 text-violet-700 ring-violet-200'}>{r.status}</Badge>
                    {r.verified && (
                      <Badge className="bg-emerald-100 text-emerald-700 ring-emerald-200">
                        <CheckCircle2 className="h-3 w-3" /> Verified{r.verified_at ? ` ${fmtDate(r.verified_at)}` : ''}{r.verified_by ? ` · ${r.verified_by}` : ''}
                      </Badge>
                    )}
                    <span className="text-xs text-slate-400">Owner: {r.owner}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {canManage && !r.verified && (
                      <Button size="sm" variant="success" onClick={() => { setVerifyRec(r); setVerifyNotes(r.verification_notes || '') }}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Verify
                      </Button>
                    )}
                    <span className="text-xs text-slate-400">by {r.created_by}</span>
                  </div>
                </div>
                <RcaBlock label="Investigation" value={r.investigation} />
                <RcaBlock label="Root Cause" value={r.root_cause} tone="text-rose-700" />
                <RcaBlock label="Technical Cause" value={r.technical_cause} />
                <RcaBlock label="Process Cause" value={r.process_cause} />
                <RcaBlock label="Contributing Factors" value={r.contributing_factors} />
                <RcaBlock label="Temporary Fix" value={r.temporary_fix} tone="text-amber-700" />
                <RcaBlock label="Permanent Fix" value={r.permanent_fix} tone="text-emerald-700" />
                <RcaBlock label="Preventive Action" value={r.preventive_action} tone="text-indigo-700" />
                <RcaBlock label="Remarks" value={r.remarks} />
              </div>
            ))}
          </div>
        )}
      <Modal open={open} onClose={() => setOpen(false)} title={`New RCA — ${issue.issue_id}`} wide>
        <div className="grid grid-cols-1 gap-4">
          <Field label="Investigation" hint="Steps performed by the technical team to diagnose the issue">
            <Textarea value={form.investigation} onChange={set('investigation')} placeholder="What was checked, tested, observed…" />
          </Field>
          <Field label="Root Cause" required><Textarea value={form.root_cause} onChange={set('root_cause')} placeholder="The fundamental reason this issue occurred…" /></Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Technical Cause"><Textarea value={form.technical_cause} onChange={set('technical_cause')} placeholder="Technical / engineering cause" /></Field>
            <Field label="Process Cause"><Textarea value={form.process_cause} onChange={set('process_cause')} placeholder="Process / governance gap" /></Field>
          </div>
          <Field label="Contributing Factors"><Textarea value={form.contributing_factors} onChange={set('contributing_factors')} placeholder="Conditions that amplified the issue" /></Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Temporary Fix"><Textarea value={form.temporary_fix} onChange={set('temporary_fix')} placeholder="Immediate containment / workaround" /></Field>
            <Field label="Permanent Fix"><Textarea value={form.permanent_fix} onChange={set('permanent_fix')} placeholder="Long-term corrective fix" /></Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Preventive Action"><Input value={form.preventive_action} onChange={set('preventive_action')} placeholder="How to prevent recurrence" /></Field>
            <Field label="Owner"><Input value={form.owner} onChange={set('owner')} /></Field>
            <Field label="Status"><Select value={form.status} onChange={set('status')} options={RCA_STATUSES.map((v) => ({ value: v, label: v }))} /></Field>
          </div>
          <Field label="Remarks"><Input value={form.remarks} onChange={set('remarks')} /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Save RCA'}</Button>
        </div>
      </Modal>

      <Modal open={!!verifyRec} onClose={() => setVerifyRec(null)} title="Verify RCA" subtitle={issue.issue_id}>
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
          Verification confirms the technical team has reviewed this RCA and the investigation findings are correct. This is recorded in the audit trail.
        </div>
        <Field label="Verification Notes" hint="How the RCA was verified and by what evidence">
          <Textarea rows={3} value={verifyNotes} onChange={(e) => setVerifyNotes(e.target.value)} placeholder="e.g. Reproduced the failure, confirmed logs match the root cause…" />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setVerifyRec(null)}>Cancel</Button>
          <Button variant="success" disabled={busy} onClick={doVerify}><CheckCircle2 className="h-4 w-4" /> {busy ? 'Saving…' : 'Confirm Verification'}</Button>
        </div>
      </Modal>
    </Card>
  )
}

function RcaBlock({ label, value, tone }) {
  if (!value) return null
  return (
    <div className="mt-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={cx('mt-0.5 whitespace-pre-line text-sm text-slate-700', tone)}>{value}</p>
    </div>
  )
}

// ---------------- SOLUTIONS ----------------
function SolutionsTab({ issue, solutions, onDone }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [testInputs, setTestInputs] = useState({})
  const [form, setForm] = useState({ solution_description: '', solution_type: 'Permanent', implemented_by: user?.name || '', testing_required: true, solution_effective: 'Pending', evidence_url: '' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const canManage = can(user?.role, 'manage_solutions')

  const markTested = async (sol) => {
    try {
      await api.solutions.update(sol.id, {
        testing_status: 'Passed',
        testing_result: testInputs[sol.id]?.trim() || 'Testing passed',
        solution_effective: sol.solution_effective === 'Pending' ? 'Effective' : sol.solution_effective,
      })
      toast.success('Testing marked as Passed — issue ready for closure')
      onDone()
    } catch (err) { toast.error(err.message) }
  }

  const submit = async () => {
    if (!form.solution_description.trim()) { toast.error('Solution description is required'); return }
    setBusy(true)
    try {
      await api.solutions.create(issue.issue_id, form)
      toast.success('Solution added')
      setOpen(false); onDone()
    } catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }

  const setEffective = async (sol, value) => {
    try {
      await api.solutions.update(sol.id, { solution_effective: value, testing_status: value === 'Effective' ? sol.testing_status : sol.testing_status, testing_result: sol.testing_result })
      if (value === 'Not Effective') toast.warn('Solution marked Not Effective — issue returned to investigation')
      onDone()
    } catch (err) { toast.error(err.message) }
  }

  return (
    <Card
      title="Solutions" subtitle="Temporary and permanent fixes with testing evidence and effectiveness tracking"
      actions={canManage && <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> Add Solution</Button>}
      padding={false}
    >
      {solutions.length === 0
        ? <EmptyState title="No solutions yet" />
        : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['Type', 'Description', 'Proposed', 'Implemented', 'By', 'Testing', 'Effectiveness', 'Evidence'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {solutions.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3"><Badge className={s.solution_type === 'Permanent' ? 'bg-emerald-100 text-emerald-700 ring-emerald-200' : 'bg-amber-100 text-amber-700 ring-amber-200'}>{s.solution_type}</Badge></td>
                    <td className="max-w-64 px-4 py-3 text-slate-700">{s.solution_description}</td>
                    <td className="px-4 py-3 text-xs">{fmtDate(s.proposed_date)}</td>
                    <td className="px-4 py-3 text-xs">{s.implemented_date ? fmtDate(s.implemented_date) : '—'}</td>
                    <td className="px-4 py-3 text-xs">{s.implemented_by || '—'}</td>
                    <td className="px-4 py-3">
                      {s.testing_status === 'Passed' ? (
                        <>
                          <Badge className="bg-emerald-100 text-emerald-700 ring-emerald-200">Passed</Badge>
                          {s.testing_result && <p className="mt-1 max-w-44 truncate text-[10px] text-slate-400" title={s.testing_result}>{s.testing_result}</p>}
                        </>
                      ) : canManage ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            value={testInputs[s.id] || ''}
                            onChange={(e) => setTestInputs({ ...testInputs, [s.id]: e.target.value })}
                            placeholder="Test result…"
                            className="w-32 rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
                          />
                          <Button size="sm" variant="success" onClick={() => markTested(s)}>Pass</Button>
                        </div>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-500 ring-slate-200">{s.testing_status}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {canManage ? (
                        <Select value={s.solution_effective} onChange={(e) => setEffective(s, e.target.value)} options={EFFECTIVENESS_OPTIONS.map((v) => ({ value: v, label: v }))} className="py-1 text-xs" />
                      ) : (
                        <Badge className={s.solution_effective === 'Effective' ? 'bg-emerald-100 text-emerald-700 ring-emerald-200' : s.solution_effective === 'Not Effective' ? 'bg-rose-100 text-rose-700 ring-rose-200' : 'bg-slate-100 text-slate-500 ring-slate-200'}>{s.solution_effective}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">{s.evidence_url ? <a className="text-indigo-600 hover:underline" href={s.evidence_url} target="_blank" rel="noreferrer">View</a> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      <Modal open={open} onClose={() => setOpen(false)} title={`Add Solution — ${issue.issue_id}`} wide>
        <div className="grid grid-cols-1 gap-4">
          <Field label="Solution Description" required><Textarea rows={3} value={form.solution_description} onChange={set('solution_description')} placeholder="Describe the fix and how it addresses the root cause…" /></Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Solution Type"><Select value={form.solution_type} onChange={set('solution_type')} options={SOLUTION_TYPES.map((v) => ({ value: v, label: v }))} /></Field>
            <Field label="Implemented By"><Input value={form.implemented_by} onChange={set('implemented_by')} /></Field>
            <Field label="Evidence URL"><Input value={form.evidence_url} onChange={set('evidence_url')} placeholder="https://…" /></Field>
          </div>
          <Field label="Initial Effectiveness Assessment">
            <Select value={form.solution_effective} onChange={set('solution_effective')} options={EFFECTIVENESS_OPTIONS.map((v) => ({ value: v, label: v }))} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.testing_required} onChange={set('testing_required')} className="h-4 w-4 rounded border-slate-300 text-indigo-600" /> Testing required before deployment
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Add Solution'}</Button>
        </div>
      </Modal>
    </Card>
  )
}

// ---------------- CLIENT-WIDE CHECK ----------------
function ChecksTab({ issue, checks, onDone }) {
  const { user } = useAuth()
  const [summary, setSummary] = useState(null)
  const [editRec, setEditRec] = useState(null)
  const [busy, setBusy] = useState(false)
  const canManage = can(user?.role, 'manage_checks')

  const refresh = async () => {
    try { setSummary(await api.checks.summary(issue.issue_id)) } catch { /* ignore */ }
  }
  useEffect(() => { refresh() /* eslint-disable-line */ }, [issue.issue_id])

  const startCheck = async () => {
    setBusy(true)
    try {
      const r = await api.checks.start(issue.issue_id)
      toast.success(`Client-wide check started — ${r.total} relevant clients included`)
      onDone(); refresh()
    } catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }

  const saveRecord = async () => {
    try {
      await api.checks.update(editRec.id, editRec)
      toast.success('Client check record updated')
      setEditRec(null); onDone(); refresh()
    } catch (err) { toast.error(err.message) }
  }

  return (
    <div className="space-y-5">
      <Card
        title="Client-Wide Check"
        subtitle="Every active client flagged for client-wide checks must be verified before closure"
        actions={canManage && <Button size="sm" variant="warn" disabled={busy} onClick={startCheck}><Play className="h-3.5 w-3.5" /> {busy ? 'Starting…' : 'Start / Refresh Client-Wide Check'}</Button>}
      >
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <MiniStat label="Relevant Clients" value={summary?.total_relevant ?? '—'} tone="text-slate-800" />
          <MiniStat label="Checked" value={summary?.checked ?? '—'} tone="text-emerald-600" />
          <MiniStat label="Pending" value={summary?.pending ?? '—'} tone={summary?.pending ? 'text-rose-600' : 'text-slate-800'} />
          <MiniStat label="Affected Clients" value={summary?.affected ?? '—'} tone={summary?.affected ? 'text-rose-600' : 'text-slate-800'} />
          <MiniStat label="Global Fix" value={summary?.global_fix_required ? summary.global_fix_status : 'Not Required'} tone={summary?.global_fix_required ? 'text-fuchsia-600' : 'text-slate-400'} />
        </div>
        {summary?.affected_clients?.length > 1 && (
          <div className="mb-4 rounded-lg border border-fuchsia-200 bg-fuchsia-50 px-4 py-3 text-xs text-fuchsia-800">
            <b>Global fix required:</b> the same issue was found in multiple clients ({summary.affected_clients.join(', ')}). A global solution must be implemented and validated before closure.
          </div>
        )}
      </Card>

      <Card title="Client Check Records" padding={false}>
        {checks.length === 0
          ? <EmptyState title="No check records" subtitle="Click Start Client-Wide Check to generate records for all relevant clients." />
          : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {['Client', 'Same Issue?', 'Severity', 'Impact', 'Fix Required?', 'Fix Implemented?', 'Monitoring', 'Checked By / Date', 'Remarks', ''].map((h) => (
                      <th key={h} className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {checks.map((c) => (
                    <tr key={c.id} className={cx(c.same_issue_found && 'bg-rose-50/40')}>
                      <td className="px-3 py-3 font-medium text-slate-800">{c.client_name}</td>
                      <td className="px-3 py-3">
                        {c.check_date
                          ? <Badge className={c.same_issue_found ? 'bg-rose-100 text-rose-700 ring-rose-200' : 'bg-emerald-100 text-emerald-700 ring-emerald-200'}>{c.same_issue_found ? 'Yes' : 'No'}</Badge>
                          : <Badge className="bg-amber-100 text-amber-700 ring-amber-200">Pending</Badge>}
                      </td>
                      <td className="px-3 py-3 text-xs">{c.severity || '—'}</td>
                      <td className="max-w-40 truncate px-3 py-3 text-xs" title={c.impact}>{c.impact || '—'}</td>
                      <td className="px-3 py-3 text-xs">{c.check_date ? (c.fix_required ? 'Yes' : 'No') : '—'}</td>
                      <td className="px-3 py-3">{c.fix_required ? <Badge className={c.fix_implemented ? 'bg-emerald-100 text-emerald-700 ring-emerald-200' : 'bg-amber-100 text-amber-700 ring-amber-200'}>{c.fix_implemented ? 'Completed' : 'Pending'}</Badge> : <span className="text-xs text-slate-400">N/A</span>}</td>
                      <td className="px-3 py-3 text-xs">{c.monitoring_required ? c.monitoring_status : 'N/A'}</td>
                      <td className="px-3 py-3 text-xs text-slate-500">{c.check_date ? `${c.checked_by || '—'} · ${fmtDate(c.check_date)}` : '—'}</td>
                      <td className="max-w-40 truncate px-3 py-3 text-xs" title={c.remarks}>{c.remarks || '—'}</td>
                      <td className="px-3 py-3">{canManage && <Button variant="ghost" size="sm" onClick={() => setEditRec({ ...c })}>Edit</Button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>

      <Modal open={!!editRec} onClose={() => setEditRec(null)} title={`Client Check — ${editRec?.client_name}`} subtitle={issue.issue_id}>
        {editRec && (
          <div className="grid grid-cols-1 gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Same Issue Found?">
                <Select value={String(editRec.same_issue_found)} onChange={(e) => setEditRec({ ...editRec, same_issue_found: e.target.value === 'true' })} options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]} />
              </Field>
              <Field label="Severity">
                <Select value={editRec.severity} onChange={(e) => setEditRec({ ...editRec, severity: e.target.value })} placeholder="—" options={['Critical', 'High', 'Medium', 'Low'].map((v) => ({ value: v, label: v }))} />
              </Field>
            </div>
            <Field label="Impact"><Textarea rows={2} value={editRec.impact} onChange={(e) => setEditRec({ ...editRec, impact: e.target.value })} placeholder="Impact on this client…" /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Fix Required?"><Select value={String(editRec.fix_required)} onChange={(e) => setEditRec({ ...editRec, fix_required: e.target.value === 'true' })} options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]} /></Field>
              <Field label="Fix Implemented?"><Select value={String(editRec.fix_implemented)} onChange={(e) => setEditRec({ ...editRec, fix_implemented: e.target.value === 'true' })} options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]} /></Field>
            </div>
            <Field label="Monitoring Required?"><Select value={String(editRec.monitoring_required)} onChange={(e) => setEditRec({ ...editRec, monitoring_required: e.target.value === 'true' })} options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]} /></Field>
            <Field label="Remarks"><Textarea rows={2} value={editRec.remarks} onChange={(e) => setEditRec({ ...editRec, remarks: e.target.value })} /></Field>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEditRec(null)}>Cancel</Button>
          <Button onClick={saveRecord}>Save Check</Button>
        </div>
      </Modal>
    </div>
  )
}

function MiniStat({ label, value, tone }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={cx('mt-0.5 text-lg font-bold', tone)}>{value}</p>
    </div>
  )
}

// ---------------- MONITORING ----------------
function MonitoringTab({ issue, logs, onDone }) {
  const { user } = useAuth()
  const [startOpen, setStartOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [period, setPeriod] = useState(7)
  const [busy, setBusy] = useState(false)
  const [logForm, setLogForm] = useState({ issue_recurred: false, system_stable: true, result: 'In Progress', remarks: '' })
  const canManage = can(user?.role, 'manage_monitoring')

  const start = async () => {
    setBusy(true)
    try {
      await api.monitoring.start(issue.issue_id, period)
      toast.success(`${period}-day monitoring period started`)
      setStartOpen(false); onDone()
    } catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }

  const addLog = async () => {
    setBusy(true)
    try {
      await api.monitoring.addLog(issue.issue_id, logForm)
      toast.success('Monitoring check recorded')
      setLogOpen(false); onDone()
    } catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }

  const active = issue.monitoring_start_date && issue.monitoring_end_date && issue.monitoring_result === 'In Progress'

  return (
    <Card
      title="Monitoring" subtitle="The issue cannot close until monitoring completes successfully"
      actions={canManage && (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setStartOpen(true)}><Play className="h-3.5 w-3.5" /> Start Monitoring</Button>
          <Button size="sm" onClick={() => setLogOpen(true)} disabled={!issue.monitoring_start_date}><Plus className="h-3.5 w-3.5" /> Record Check</Button>
        </div>
      )}
      padding={false}
    >
      <div className="grid grid-cols-2 gap-3 border-b border-slate-100 p-5 lg:grid-cols-5">
        <MiniStat label="Status" value={issue.monitoring_result || 'Pending'} tone={issue.monitoring_result === 'Successful' ? 'text-emerald-600' : 'text-amber-600'} />
        <MiniStat label="Period" value={issue.monitoring_period ? `${issue.monitoring_period} days` : '—'} tone="text-slate-800" />
        <MiniStat label="Start" value={issue.monitoring_start_date ? fmtDate(issue.monitoring_start_date) : '—'} tone="text-slate-800" />
        <MiniStat label="End" value={issue.monitoring_end_date ? fmtDate(issue.monitoring_end_date) : '—'} tone="text-slate-800" />
        <MiniStat label="Checks" value={logs.length} tone="text-slate-800" />
      </div>
      {active && (
        <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-5 py-3 text-xs text-amber-700">
          <Clock className="h-4 w-4" /> Monitoring in progress — {Math.max(0, Math.ceil((new Date(issue.monitoring_end_date) - Date.now()) / 86400000))} day(s) remaining before closure is possible.
        </div>
      )}
      {logs.length === 0
        ? <EmptyState title="No monitoring logs" subtitle="Start a monitoring period to record stability checks." />
        : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['Check Date', 'System Stable?', 'Issue Recurred?', 'Result', 'Checked By', 'Remarks'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-3 text-xs">{fmtDate(m.check_date)}</td>
                    <td className="px-4 py-3"><Badge className={m.system_stable ? 'bg-emerald-100 text-emerald-700 ring-emerald-200' : 'bg-rose-100 text-rose-700 ring-rose-200'}>{m.system_stable ? 'Yes' : 'No'}</Badge></td>
                    <td className="px-4 py-3"><Badge className={m.issue_recurred ? 'bg-rose-100 text-rose-700 ring-rose-200' : 'bg-slate-100 text-slate-500 ring-slate-200'}>{m.issue_recurred ? 'YES — recurred' : 'No'}</Badge></td>
                    <td className="px-4 py-3"><Badge className={m.result === 'Successful' ? 'bg-emerald-100 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-500 ring-slate-200'}>{m.result}</Badge></td>
                    <td className="px-4 py-3 text-xs">{m.checked_by || '—'}</td>
                    <td className="max-w-56 truncate px-4 py-3 text-xs" title={m.remarks}>{m.remarks || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      <Modal open={startOpen} onClose={() => setStartOpen(false)} title="Start Monitoring" subtitle={issue.issue_id}>
        <Field label="Monitoring Period" hint="The issue cannot close until the period elapses with a successful result">
          <Select value={period} onChange={(e) => setPeriod(Number(e.target.value))} options={[3, 7, 14, 30].map((d) => ({ value: d, label: `${d} days` }))} />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setStartOpen(false)}>Cancel</Button>
          <Button disabled={busy} onClick={start}>{busy ? 'Starting…' : 'Start Monitoring'}</Button>
        </div>
      </Modal>

      <Modal open={logOpen} onClose={() => setLogOpen(false)} title="Record Monitoring Check" subtitle={issue.issue_id}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="System Stable?"><Select value={String(logForm.system_stable)} onChange={(e) => setLogForm({ ...logForm, system_stable: e.target.value === 'true' })} options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]} /></Field>
          <Field label="Issue Recurred?"><Select value={String(logForm.issue_recurred)} onChange={(e) => setLogForm({ ...logForm, issue_recurred: e.target.value === 'true' })} options={[{ value: 'false', label: 'No' }, { value: 'true', label: 'Yes' }]} /></Field>
        </div>
        <Field label="Remarks" className="mt-4"><Textarea rows={2} value={logForm.remarks} onChange={(e) => setLogForm({ ...logForm, remarks: e.target.value })} placeholder="Observations from this check…" /></Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setLogOpen(false)}>Cancel</Button>
          <Button disabled={busy} onClick={addLog}>{busy ? 'Saving…' : 'Record Check'}</Button>
        </div>
      </Modal>
    </Card>
  )
}

// ---------------- RECURRENCE ----------------
function RecurrenceTab({ issue, records, onDone }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ same_issue: true, recurrence_description: '', new_rca: '', new_solution: '', preventive_action: '', owner: user?.name || '', status: 'Open' })
  const canManage = can(user?.role, 'manage_recurrence')

  const submit = async () => {
    try {
      await api.recurrence.create(issue.issue_id, form)
      toast.warn('Recurrence recorded — new corrective cycle required')
      setOpen(false); onDone()
    } catch (err) { toast.error(err.message) }
  }

  return (
    <Card
      title="Recurrence Tracker" subtitle="Every recurrence starts a new RCA → solution → testing → check → monitoring cycle"
      actions={canManage && <Button size="sm" variant="danger" onClick={() => setOpen(true)}><Repeat2 className="h-3.5 w-3.5" /> Record Recurrence</Button>}
      padding={false}
    >
      {records.length === 0
        ? <EmptyState title="No recurrences" subtitle="This issue has never recurred after closure." />
        : (
          <div className="space-y-4 p-5">
            {records.map((r) => (
              <div key={r.id} className="rounded-xl border border-rose-200 bg-rose-50/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-rose-700">Recurrence — {fmtDate(r.recurrence_date)}</span>
                    <Badge className="bg-rose-100 text-rose-700 ring-rose-200">{r.status}</Badge>
                  </div>
                  <span className="text-xs text-slate-500">Client: {r.client_name} · Owner: {r.owner}</span>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div><p className="text-[10px] font-bold uppercase text-slate-400">Description</p><p className="mt-0.5 text-slate-700">{r.recurrence_description || '—'}</p></div>
                  <div><p className="text-[10px] font-bold uppercase text-slate-400">New RCA Required</p><p className="mt-0.5 font-semibold text-rose-600">{r.new_rca_required ? 'YES — new RCA mandatory' : 'No'}</p></div>
                  <div><p className="text-[10px] font-bold uppercase text-slate-400">New RCA</p><p className="mt-0.5 text-slate-700">{r.new_rca || 'In progress'}</p></div>
                  <div><p className="text-[10px] font-bold uppercase text-slate-400">New Solution</p><p className="mt-0.5 text-slate-700">{r.new_solution || 'Pending'}</p></div>
                </div>
                <p className="mt-3 text-xs italic text-slate-500">Remarks: {r.remarks || '—'}</p>
              </div>
            ))}
          </div>
        )}
      <Modal open={open} onClose={() => setOpen(false)} title={`Record Recurrence — ${issue.issue_id}`} subtitle="The issue will be flagged as recurring; new RCA + solution + checks required">
        <div className="grid grid-cols-1 gap-4">
          <Field label="Recurrence Description" required><Textarea rows={3} value={form.recurrence_description} onChange={(e) => setForm({ ...form, recurrence_description: e.target.value })} placeholder="How and where did the issue recur?" /></Field>
          <Field label="New RCA (initial findings)"><Textarea rows={2} value={form.new_rca} onChange={(e) => setForm({ ...form, new_rca: e.target.value })} /></Field>
          <Field label="New Solution (if identified)"><Input value={form.new_solution} onChange={(e) => setForm({ ...form, new_solution: e.target.value })} /></Field>
          <Field label="Preventive Action"><Input value={form.preventive_action} onChange={(e) => setForm({ ...form, preventive_action: e.target.value })} /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="danger" disabled={!form.recurrence_description.trim()} onClick={submit}>Record Recurrence</Button>
        </div>
      </Modal>
    </Card>
  )
}

// ---------------- ATTACHMENTS ----------------
function AttachmentsTab({ issue, files, onDone }) {
  const { user } = useAuth()
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const canManage = can(user?.role, 'manage_solutions') || can(user?.role, 'manage_rca')

  const upload = async () => {
    if (!file) { toast.error('Choose a file first'); return }
    setBusy(true)
    try {
      if (api.isDemo) await api.attachments.add(issue.issue_id, { file_name: file.name, file_type: file.type })
      else await api.attachments.upload(issue.issue_id, file)
      toast.success('Attachment uploaded')
      setFile(null); onDone()
    } catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }

  return (
    <Card title="Attachments" subtitle="Screenshots, error logs, RCA documents, evidence (stored in Supabase Storage with RLS in production)" padding={false}>
      <div className="border-b border-slate-100 p-4">
        {canManage && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 hover:border-indigo-400 hover:text-indigo-600">
              <Paperclip className="h-4 w-4" /> {file ? file.name : 'Choose file…'}
              <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
            <Button size="sm" disabled={!file || busy} onClick={upload}>{busy ? 'Uploading…' : 'Upload'}</Button>
          </div>
        )}
      </div>
      {files.length === 0
        ? <EmptyState title="No attachments" />
        : (
          <div className="divide-y divide-slate-100">
            {files.map((f) => (
              <div key={f.id} className="flex items-center gap-3 px-5 py-3">
                <div className="rounded-lg bg-indigo-50 p-2"><Paperclip className="h-4 w-4 text-indigo-500" /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{f.file_name}</p>
                  <p className="text-xs text-slate-400">{f.file_type} · {f.uploaded_by} · {fmtDateTime(f.created_at)}</p>
                </div>
                {f.file_url && <a href={f.file_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-indigo-600 hover:underline">Download</a>}
              </div>
            ))}
          </div>
        )}
    </Card>
  )
}

// ---------------- AUDIT ----------------
function AuditTab({ issueId }) {
  const { data, loading } = useAsync(() => api.audit.list({ issue_id: issueId }), [issueId])
  const rows = data?.items || []
  return (
    <Card title="Audit History" subtitle="Every important action and change on this issue" padding={false}>
      <DataTable
        loading={loading}
        columns={[
          { key: 'ts', label: 'Timestamp', render: (r) => <span className="text-xs text-slate-500">{fmtDateTime(r.timestamp)}</span> },
          { key: 'user', label: 'User', render: (r) => <span className="text-xs font-medium">{r.user_name}</span> },
          { key: 'action', label: 'Action', render: (r) => <Badge className="bg-indigo-50 text-indigo-700 ring-indigo-200">{r.action}</Badge> },
          { key: 'field', label: 'Field', render: (r) => <span className="text-xs text-slate-500">{r.field_name}</span> },
          { key: 'change', label: 'Change', render: (r) => (
            <span className="text-xs">
              <span className="text-slate-400 line-through">{r.old_value || '—'}</span>
              <span className="mx-1 text-slate-400">→</span>
              <span className="font-semibold text-slate-700">{r.new_value || '—'}</span>
            </span>
          ) },
        ]}
        rows={rows}
        rowKey="id"
      />
    </Card>
  )
}

// ---------------- TIMELINE ----------------
function TimelineTab({ issue }) {
  const statusIdx = Math.max(0, STATUSES.indexOf(issue.status))
  const currentIdx = Math.max(0, TIMELINE_STEPS.findIndex((s) => s.status === issue.status))
  const shownSteps = TIMELINE_STEPS.filter((s) => STATUSES.indexOf(s.status) <= Math.max(statusIdx, STATUSES.indexOf(TIMELINE_STEPS[currentIdx]?.status)))
  return (
    <Card title="Issue Lifecycle Timeline" subtitle="Reported → Assigned → RCA → Solution → Testing → Client-Wide Check → Global Fix → Monitoring → Resolved → Closed">
      <ol className="relative ml-4 space-y-6 border-l-2 border-slate-200 pb-2">
        {shownSteps.map((s, i) => {
          const sIdx = STATUSES.indexOf(s.status)
          const done = statusIdx >= sIdx && !(issue.status === 'Reopened')
          const current = issue.status === s.status
          const skipped = ['Global Fix'].includes(s.label) && !issue.global_fix_required
          return (
            <li key={s.key} className="relative pl-8">
              <span className={cx(
                'absolute -left-[13px] top-0 flex h-6 w-6 items-center justify-center rounded-full border-2 bg-white',
                done ? 'border-emerald-500 bg-emerald-500 text-white' : current ? 'border-indigo-500 bg-indigo-500 text-white' : skipped ? 'border-slate-300 text-slate-300' : 'border-slate-300 text-slate-400'
              )}>
                {done ? <CheckCircle2 className="h-4 w-4" /> : <span className="h-2 w-2 rounded-full bg-current" />}
              </span>
              <div className={cx(skipped ? 'opacity-50' : '')}>
                <p className={cx('text-sm font-semibold', done ? 'text-emerald-700' : current ? 'text-indigo-700' : 'text-slate-500')}>
                  {s.label} {skipped && <span className="text-xs font-normal text-slate-400">(not required)</span>}
                  {current && <Badge className="ml-2 bg-indigo-100 text-indigo-700 ring-indigo-200">Current</Badge>}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {s.key === 'reported' && `Reported on ${fmtDate(issue.reported_date)} by ${issue.reported_by}`}
                  {s.key === 'assigned' && (issue.assigned_name ? `Assigned to ${issue.assigned_name}` : 'Awaiting assignment')}
                  {s.key === 'rca' && (issue.root_cause ? 'Root cause documented' : 'Pending RCA')}
                  {s.key === 'solution' && (issue.permanent_solution ? 'Permanent solution defined' : 'Pending solution')}
                  {s.key === 'testing' && (issue.testing_status === 'Passed' ? issue.testing_result || 'Testing passed' : 'Testing pending')}
                  {s.key === 'client_check' && (issue.client_wide_check_status === 'Completed' ? 'All relevant clients checked' : 'Check pending / in progress')}
                  {s.key === 'global_fix' && (issue.global_fix_required ? `Global fix ${issue.global_fix_status}` : 'Not required')}
                  {s.key === 'monitoring' && (issue.monitoring_result === 'Successful' ? `Monitoring successful (${issue.monitoring_period} days)` : issue.monitoring_start_date ? `Monitoring ${issue.monitoring_result || 'In Progress'}` : 'Monitoring pending')}
                  {s.key === 'resolved' && (issue.status === 'Closed' ? 'Resolution verified' : 'Pending')}
                  {s.key === 'closed' && (issue.closure_date ? `Closed on ${fmtDate(issue.closure_date)} — ${issue.closure_remarks || 'No remarks'}` : 'Pending closure')}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
      {issue.recurrence && (
        <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <p className="font-semibold">↺ Recurrence cycle {issue.recurrence_count}</p>
          <p className="mt-1 text-xs">Issue recurred after closure. The timeline restarts from RCA for the new corrective cycle — see the Recurrence tab.</p>
        </div>
      )}
    </Card>
  )
}

// ---------------- QUICK ACTIONS ----------------
function QuickStatus({ issue, onDone }) {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  if (!can(user?.role, 'update_issue')) return null
  const change = async (e) => {
    setBusy(true)
    try { await api.issues.update(issue.issue_id, { status: e.target.value }); toast.success('Status updated'); onDone() }
    catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }
  return <Select value={issue.status} disabled={busy} onChange={change} options={STATUSES.map((v) => ({ value: v, label: v }))} className="w-44 py-1.5 text-xs" />
}

function QuickAssign({ issue, onDone }) {
  const { user } = useAuth()
  const { data: users } = useAsync(() => api.users.list(), [])
  const [busy, setBusy] = useState(false)
  if (!can(user?.role, 'assign_issue')) return null
  const change = async (e) => {
    setBusy(true)
    try { await api.issues.update(issue.issue_id, { assigned_to: e.target.value || null }); toast.success('Assignee updated'); onDone() }
    catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }
  return (
    <Select value={issue.assigned_to || ''} disabled={busy} onChange={change} placeholder="Assign…"
      options={(users || []).filter((u) => u.role !== 'viewer').map((u) => ({ value: u.id, label: u.name }))} className="w-40 py-1.5 text-xs" />
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-5">
      <div><Skeleton className="h-7 w-64" /><Skeleton className="mt-2 h-4 w-96" /><Skeleton className="mt-3 h-6 w-72" /></div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Skeleton className="h-96 w-full" /><Skeleton className="h-96 w-full" />
      </div>
    </div>
  )
}
