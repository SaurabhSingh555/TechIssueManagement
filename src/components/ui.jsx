import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { X, CheckCircle2, AlertTriangle, Info, AlertOctagon, Search, Inbox, ChevronLeft, ChevronRight } from 'lucide-react'
import { cx } from '../utils/format'
import { STATUS_COLORS, PRIORITY_COLORS } from '../utils/constants'

// ================= TOASTS =================
function fireToast(message, type = 'success') {
  window.dispatchEvent(new CustomEvent('tims-toast', { detail: { message, type, id: Date.now() + Math.random() } }))
}
export const toast = {
  success: (m) => fireToast(m, 'success'),
  error: (m) => fireToast(m, 'error'),
  info: (m) => fireToast(m, 'info'),
  warn: (m) => fireToast(m, 'warn'),
}
const TOAST_ICONS = { success: CheckCircle2, error: AlertOctagon, info: Info, warn: AlertTriangle }
const TOAST_STYLES = {
  success: 'border-emerald-200 bg-white text-emerald-800',
  error: 'border-rose-200 bg-white text-rose-800',
  info: 'border-sky-200 bg-white text-sky-800',
  warn: 'border-amber-200 bg-white text-amber-800',
}
export function Toaster() {
  const [items, setItems] = useState([])
  useEffect(() => {
    const handler = (e) => {
      const t = e.detail
      setItems((prev) => [...prev, t])
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), 4500)
    }
    window.addEventListener('tims-toast', handler)
    return () => window.removeEventListener('tims-toast', handler)
  }, [])
  return (
    <div className="fixed top-4 right-4 z-[100] flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {items.map((t) => {
        const Icon = TOAST_ICONS[t.type]
        return (
          <div key={t.id} className={cx('animate-toast flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg', TOAST_STYLES[t.type])}>
            <Icon className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="whitespace-pre-line text-sm font-medium leading-snug">{t.message}</p>
          </div>
        )
      })}
    </div>
  )
}

// ================= BADGES =================
export function Badge({ className, children }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', className)}>{children}</span>
}
export function StatusBadge({ status }) {
  return <Badge className={STATUS_COLORS[status] || 'bg-slate-100 text-slate-600 ring-slate-200'}>{status}</Badge>
}
export function PriorityBadge({ priority }) {
  return <Badge className={PRIORITY_COLORS[priority] || 'bg-slate-100 text-slate-600 ring-slate-200'}>{priority}</Badge>
}

// ================= CARD =================
export function Card({ title, subtitle, actions, children, className, padding = true }) {
  return (
    <div className={cx('rounded-xl border border-slate-200 bg-white shadow-sm', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={padding ? 'p-5' : ''}>{children}</div>
    </div>
  )
}

// ================= BUTTONS =================
export function Button({ variant = 'primary', size = 'md', className, children, ...props }) {
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-indigo-500',
    secondary: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50',
    danger: 'bg-rose-600 text-white hover:bg-rose-700',
    ghost: 'text-slate-600 hover:bg-slate-100',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700',
    warn: 'bg-amber-500 text-white hover:bg-amber-600',
  }
  const sizes = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3.5 py-2 text-sm', lg: 'px-5 py-2.5 text-sm' }
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant], sizes[size], className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

// ================= MODAL =================
export function Modal({ open, onClose, title, subtitle, children, footer, wide }) {
  useEffect(() => {
    if (!open) return
    const h = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={cx('animate-fade-up mt-8 w-full rounded-xl bg-white shadow-2xl', wide ? 'max-w-4xl' : 'max-w-xl')}>
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">{footer}</div>}
      </div>
    </div>
  )
}

// ================= CONFIRM DIALOG =================
const ConfirmCtx = createContext(null)
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null)
  const resolver = useRef(null)
  const confirm = useCallback((opts) => {
    setState({ title: 'Confirm', message: '', confirmText: 'Confirm', danger: false, ...opts })
    return new Promise((resolve) => { resolver.current = resolve })
  }, [])
  const close = (result) => { resolver.current?.(result); resolver.current = null; setState(null) }
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="animate-fade-up w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              {state.danger
                ? <div className="rounded-full bg-rose-100 p-2.5"><AlertOctagon className="h-6 w-6 text-rose-600" /></div>
                : <div className="rounded-full bg-indigo-100 p-2.5"><Info className="h-6 w-6 text-indigo-600" /></div>}
              <div>
                <h3 className="text-base font-semibold text-slate-900">{state.title}</h3>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{state.message}</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => close(false)}>Cancel</Button>
              <Button variant={state.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{state.confirmText}</Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  )
}
export const useConfirm = () => useContext(ConfirmCtx)

// ================= FORM FIELDS =================
export function Field({ label, required, hint, children, className }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  )
}
export const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50'
export function Input(props) { return <input {...props} className={cx(inputCls, props.className)} /> }
export function Select({ options = [], placeholder, ...props }) {
  return (
    <select {...props} className={cx(inputCls, props.className)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={typeof o === 'string' ? o : o.value} value={typeof o === 'string' ? o : o.value}>
          {typeof o === 'string' ? o : o.label}
        </option>
      ))}
    </select>
  )
}
export function Textarea(props) { return <textarea rows={props.rows || 3} {...props} className={cx(inputCls, props.className)} /> }

// ================= TABS =================
export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cx(
            '-mb-px flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors',
            active === t.key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className={cx('rounded-full px-1.5 py-0.5 text-[10px] font-bold', active === t.key ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500')}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

// ================= PAGINATION =================
export function Pagination({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
      <p className="text-xs text-slate-500">Showing <b>{from}</b>–<b>{to}</b> of <b>{total}</b></p>
      <div className="flex items-center gap-1">
        <button disabled={page <= 1} onClick={() => onChange(page - 1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
        {Array.from({ length: pages }, (_, i) => i + 1).filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1).map((p, idx, arr) => (
          <span key={p} className="flex items-center">
            {idx > 0 && arr[idx - 1] !== p - 1 && <span className="px-1 text-slate-400">…</span>}
            <button onClick={() => onChange(p)} className={cx('h-7 min-w-7 rounded-lg px-2 text-xs font-semibold', p === page ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100')}>{p}</button>
          </span>
        ))}
        <button disabled={page >= pages} onClick={() => onChange(page + 1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  )
}

// ================= EMPTY / SKELETON =================
export function EmptyState({ title = 'No records found', subtitle, icon: Icon = Inbox, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="rounded-full bg-slate-100 p-4"><Icon className="h-8 w-8 text-slate-400" /></div>
      <h3 className="mt-4 text-sm font-semibold text-slate-700">{title}</h3>
      {subtitle && <p className="mt-1 max-w-sm text-xs text-slate-500">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
export function Skeleton({ className }) {
  return <div className={cx('skeleton rounded-lg', className)} />
}
export function TableSkeleton({ rows = 5 }) {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  )
}

// ================= DATA TABLE =================
export function DataTable({ columns, rows = [], rowKey = 'id', onRowClick, loading, empty, footer }) {
  if (loading) return <TableSkeleton />
  if (!rows.length) return empty || <EmptyState />
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={cx('whitespace-nowrap px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500', c.className)}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((r) => (
            <tr key={r[rowKey]} onClick={() => onRowClick?.(r)} className={cx(onRowClick && 'cursor-pointer hover:bg-indigo-50/40')}>
              {columns.map((c) => (
                <td key={c.key} className={cx('whitespace-nowrap px-4 py-3 text-slate-700', c.className)}>{c.render ? c.render(r) : r[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {footer}
    </div>
  )
}

// ================= SEARCH INPUT =================
export function SearchInput({ value, onChange, placeholder = 'Search…', className }) {
  return (
    <div className={cx('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cx(inputCls, 'pl-9')} />
    </div>
  )
}

// ================= STAT CARD =================
export function StatCard({ label, value, sub, icon: Icon, tone = 'indigo', loading }) {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600',
    rose: 'bg-rose-50 text-rose-600',
    orange: 'bg-orange-50 text-orange-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    sky: 'bg-sky-50 text-sky-600',
    violet: 'bg-violet-50 text-violet-600',
    teal: 'bg-teal-50 text-teal-600',
    slate: 'bg-slate-100 text-slate-600',
    fuchsia: 'bg-fuchsia-50 text-fuchsia-600',
    cyan: 'bg-cyan-50 text-cyan-600',
  }
  if (loading) return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><Skeleton className="h-8 w-12" /><Skeleton className="mt-2 h-4 w-24" /></div>
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
        </div>
        {Icon && <div className={cx('rounded-lg p-2', tones[tone])}><Icon className="h-5 w-5" /></div>}
      </div>
    </div>
  )
}
