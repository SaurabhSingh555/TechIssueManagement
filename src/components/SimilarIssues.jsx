import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Brain, Link2, RefreshCw, History, AlertTriangle, Sparkles, Repeat2 } from 'lucide-react'
import { api } from '../services/backend'
import { useAuth } from '../services/session'
import { useAsync } from '../hooks/useAsync'
import { Card, Badge, Button, StatusBadge, EmptyState, toast, useConfirm } from './ui'
import { can } from '../utils/constants'
import { cx } from '../utils/format'

const REL_LABELS = {
  same_issue: 'Same Issue',
  related_issue: 'Related Issue',
  duplicate: 'Duplicate',
  recurrence: 'Recurrence',
  not_related: 'Not Related',
}

function tierOf(score, thresholds) {
  const high = thresholds?.high ?? 0.9
  const medium = thresholds?.medium ?? 0.75
  if (score >= high) return { label: 'Very Similar Issue', cls: 'bg-rose-100 text-rose-700 ring-rose-200' }
  if (score >= medium) return { label: 'Potentially Similar Issue', cls: 'bg-amber-100 text-amber-700 ring-amber-200' }
  return { label: 'Low Similarity', cls: 'bg-slate-100 text-slate-500 ring-slate-200' }
}

function buildRecommendation(m) {
  const checks = []
  if (m.technical_cause) checks.push('Investigate: ' + m.technical_cause)
  if (m.contributing_factors) checks.push('Check contributing factors: ' + m.contributing_factors)
  if (m.preventive_action) checks.push('Apply preventive action: ' + m.preventive_action)
  if (!checks.length) checks.push(
    'Verify the system configuration',
    'Check logs for the same root cause',
    'Apply the previous fix in a controlled test first'
  )
  return {
    headline: `This issue appears highly similar to ${m.issue_id} (${Math.round(m.similarity * 100)}% match).`,
    rca: m.root_cause || 'No RCA recorded.',
    solution: m.permanent_solution || m.temporary_solution || 'No solution recorded.',
    checks,
  }
}

// ---------------------------------------------------------------------------
// Similar previous issues panel — shown on the ticket page ("Similar" tab).
// The AI only recommends; linking/actions are always human-confirmed.
// ---------------------------------------------------------------------------
export default function SimilarIssues({ issue, matches = [], relationships = [], onDone }) {
  const { user } = useAuth()
  const confirm = useConfirm()
  const { data: settings } = useAsync(() => api.settings.get(), [])
  const [busy, setBusy] = useState(false)
  const thresholds = settings?.similarity
  const canLink = can(user?.role, 'manage_rca') || can(user?.role, 'manage_checks')

  const sorted = [...matches].sort((a, b) => b.similarity - a.similarity).slice(0, 5)
  const top = sorted[0]
  const strong = top && top.similarity >= (thresholds?.high ?? 0.9)
  const rec = strong ? buildRecommendation(top) : null
  const linkedFor = (match) => relationships.find((r) => r.related_issue_id === match.id)

  const refresh = async () => {
    setBusy(true)
    try {
      await api.similar.find(issue.issue_id)
      toast.success('Similarity search completed')
      onDone?.()
    } catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }

  const link = async (m, type) => {
    try {
      await api.relationships.create(issue.issue_id, {
        related_issue_id: m.id, relationship_type: type, similarity_score: m.similarity,
      })
      if (type === 'same_issue') toast.warn(`Linked as Same Issue — recurrence tracked (×${issue.recurrence_count + 1})`)
      else toast.success(`Linked as ${REL_LABELS[type] || type}`)
      onDone?.()
    } catch (err) { toast.error(err.message) }
  }

  const markNotRelated = async (m) => {
    const ok = await confirm({
      title: 'Mark as not related?',
      message: `Confirm ${m.issue_id} is NOT related to this issue. This decision will be recorded in the audit trail.`,
      confirmText: 'Not Related',
      danger: true,
    })
    if (ok) link(m, 'not_related')
  }

  return (
    <div className="space-y-5">
      {/* AI RECOMMENDATION — advisory only, never modifies anything */}
      {rec && (
        <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50 p-5 shadow-sm">
          <p className="flex items-center gap-2 text-sm font-bold text-indigo-800">
            <Brain className="h-5 w-5" /> AI Recommendation
          </p>
          <p className="mt-2 text-sm font-medium text-indigo-900">{rec.headline}</p>
          <div className="mt-3 grid gap-2 text-xs text-indigo-800 sm:grid-cols-2">
            <div className="rounded-lg bg-white/70 p-3">
              <p className="font-bold uppercase tracking-wide text-indigo-400">Most likely previous RCA</p>
              <p className="mt-1 font-medium leading-relaxed">{rec.rca}</p>
            </div>
            <div className="rounded-lg bg-white/70 p-3">
              <p className="font-bold uppercase tracking-wide text-indigo-400">Previously successful solution</p>
              <p className="mt-1 font-medium leading-relaxed">{rec.solution}</p>
            </div>
          </div>
          <div className="mt-3 rounded-lg bg-white/70 p-3 text-xs text-indigo-800">
            <p className="font-bold uppercase tracking-wide text-indigo-400">Recommended checks</p>
            <ol className="mt-1 list-inside list-decimal space-y-0.5 font-medium">
              {rec.checks.map((c, i) => <li key={i}>{c}</li>)}
            </ol>
          </div>
          <p className="mt-3 flex items-start gap-2 text-[11px] text-indigo-500">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            AI provides recommendations only — no automatic changes are made. A human technical user must review and approve any action.
          </p>
        </div>
      )}

      <Card
        title="🔍 Previous Similar Issues"
        subtitle="Top 5 most relevant previous tickets, ranked by similarity (computed server-side — never in the browser)"
        actions={
          <Button size="sm" variant="secondary" disabled={busy} onClick={refresh}>
            <RefreshCw className={cx('h-3.5 w-3.5', busy && 'animate-spin')} /> {busy ? 'Searching…' : 'Refresh matches'}
          </Button>
        }
        padding={false}
      >
        {sorted.length === 0 ? (
          <EmptyState
            title="No similar previous issues found"
            subtitle="The AI similarity engine compares this ticket against every historical ticket (title, description, error, system, client). Matches appear here automatically."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {sorted.map((m) => {
              const tier = tierOf(m.similarity, thresholds)
              const linked = linkedFor(m)
              return (
                <div key={m.id || m.issue_id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/issues/${m.issue_id}`} className="text-sm font-bold text-indigo-700 hover:underline">{m.issue_id}</Link>
                    <Badge className={tier.cls}>{tier.label} · {(m.similarity * 100).toFixed(1)}%</Badge>
                    <StatusBadge status={m.status} />
                    {m.recurrence_count > 0 && (
                      <Badge className="bg-rose-100 text-rose-700 ring-rose-200"><Repeat2 className="h-3 w-3" /> Recurred ×{m.recurrence_count}</Badge>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm font-medium text-slate-800">{m.issue_title}</p>
                  <p className="text-xs text-slate-400">{m.client_name || '—'}{m.process_name ? ` · ${m.process_name}` : ''}</p>
                  <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                    <div className="rounded-lg bg-slate-50 p-2.5">
                      <p className="font-bold uppercase tracking-wide text-slate-400">RCA</p>
                      <p className="mt-0.5 line-clamp-2 text-slate-700">{m.root_cause || 'Not documented'}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2.5">
                      <p className="font-bold uppercase tracking-wide text-slate-400">Solution</p>
                      <p className="mt-0.5 line-clamp-2 text-slate-700">{m.permanent_solution || m.temporary_solution || 'Not documented'}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Link to={`/issues/${m.issue_id}`}>
                      <Button size="sm" variant="secondary"><History className="h-3.5 w-3.5" /> View Full History</Button>
                    </Link>
                    {canLink && !linked && (
                      <>
                        <Button size="sm" variant="warn" onClick={() => link(m, 'same_issue')}>
                          <Link2 className="h-3.5 w-3.5" /> Link as Same Issue
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => link(m, 'related_issue')}>
                          <Link2 className="h-3.5 w-3.5" /> Link as Related
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => markNotRelated(m)}>Not Related</Button>
                      </>
                    )}
                    {linked && (
                      <Badge className={linked.relationship_type === 'not_related'
                        ? 'bg-slate-100 text-slate-500 ring-slate-200'
                        : 'bg-emerald-100 text-emerald-700 ring-emerald-200'}>
                        <Sparkles className="h-3 w-3" /> Confirmed: {REL_LABELS[linked.relationship_type] || linked.relationship_type}
                      </Badge>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
