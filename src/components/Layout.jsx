import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Ticket, Building2, BookOpen,
  BarChart3, ScrollText, Settings, Bell, Menu, X, Search, ShieldAlert,
  Database, UserCheck,
} from 'lucide-react'
import { useAuth } from '../services/session'
import { api, auth, isDemoMode } from '../services/backend'
import { ROLE_LABELS } from '../utils/constants'
import { relTime, cx } from '../utils/format'

// Simplified, role-aware navigation.
// roles: null → visible to everyone; array → only those roles see the item.
const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, roles: null },
  { to: '/issues', label: 'All Issues', icon: Ticket, roles: null },
  { to: '/knowledge', label: 'Knowledge', icon: BookOpen, roles: null },
  { to: '/clients', label: 'Clients', icon: Building2, roles: null },
  { to: '/reports', label: 'Reports', icon: BarChart3, roles: null },
]

const MGMT_NAV = [
  { to: '/audit-log', label: 'Audit Log', icon: ScrollText, roles: ['admin', 'manager'] },
  { to: '/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
]

function Sidebar({ open, onClose }) {
  const { user } = useAuth()
  const visible = (item) => !item.roles || item.roles.includes(user?.role)
  const mainItems = NAV.filter(visible)
  const mgmtItems = MGMT_NAV.filter(visible)
  const renderLink = (item) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      onClick={onClose}
      className={({ isActive }) => cx(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        isActive ? 'bg-indigo-600 text-white shadow' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
      )}
    >
      <item.icon className="h-5 w-5" />
      {item.label}
    </NavLink>
  )
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden" onClick={onClose} />}
      <aside className={cx(
        'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-900 transition-transform lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-800 px-5">
          <div className="rounded-lg bg-indigo-600 p-2"><ShieldAlert className="h-5 w-5 text-white" /></div>
          <div>
            <p className="text-sm font-bold leading-tight text-white">Tech Issue Manager</p>
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Corporate Portal</p>
          </div>
          <button onClick={onClose} className="ml-auto rounded-lg p-1 text-slate-400 hover:text-white lg:hidden"><X className="h-5 w-5" /></button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Main</p>
          {mainItems.map(renderLink)}
          {mgmtItems.length > 0 && (
            <>
              <p className="px-3 pb-1.5 pt-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Management</p>
              {mgmtItems.map(renderLink)}
            </>
          )}
        </nav>
        <div className="border-t border-slate-800 p-4">
          {isDemoMode ? (
            <p className="flex items-start gap-2 text-[11px] leading-snug text-amber-400">
              <Database className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Demo mode — clean in-browser database (no dummy data). Configure Supabase + FastAPI env vars for production.
            </p>
          ) : (
            <p className="flex items-center gap-2 text-[11px] text-emerald-400"><Database className="h-3.5 w-3.5" /> Connected to FastAPI + Supabase</p>
          )}
        </div>
      </aside>
    </>
  )
}

function TopBar({ onMenu }) {
  const { user, switchUser } = useAuth()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [notifs, setNotifs] = useState([])
  const [unread, setUnread] = useState(0)
  const [openNotifs, setOpenNotifs] = useState(false)
  const [openUser, setOpenUser] = useState(false)
  const boxRef = useRef(null)

  const loadNotifs = () => {
    api.notifications.list().then((r) => { setNotifs(r.items.slice(0, 8)); setUnread(r.unread) }).catch(() => {})
  }
  useEffect(() => { loadNotifs() }, [])
  useEffect(() => {
    const h = (e) => { if (!boxRef.current?.contains(e.target)) { setOpenNotifs(false); setOpenUser(false) } }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const onSearch = (e) => {
    e.preventDefault()
    if (search.trim()) { navigate(`/issues?search=${encodeURIComponent(search.trim())}`); setSearch('') }
  }

  const initials = (user?.name || 'U').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:px-6">
      <button onClick={onMenu} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"><Menu className="h-5 w-5" /></button>
      <form onSubmit={onSearch} className="relative hidden max-w-md flex-1 sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search issue ID, title, client, category, owner…"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />
      </form>
      <div className="ml-auto flex items-center gap-1.5" ref={boxRef}>
        <div className="relative">
          <button onClick={() => { setOpenNotifs((v) => !v); setOpenUser(false); loadNotifs() }} className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <Bell className="h-5 w-5" />
            {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">{unread}</span>}
          </button>
          {openNotifs && (
            <div className="animate-fade-up absolute right-0 mt-2 w-96 max-w-[90vw] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
              <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">Notifications</div>
              <div className="max-h-96 overflow-y-auto">
                {notifs.length === 0 && <p className="px-4 py-8 text-center text-xs text-slate-400">No notifications</p>}
                {notifs.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => { api.notifications.markRead(n.id).then(loadNotifs).catch(() => {}); setOpenNotifs(false); if (n.issue_id_text) navigate(`/issues/${n.issue_id_text}`) }}
                    className={cx('flex w-full items-start gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50', !n.read && 'bg-indigo-50/40')}
                  >
                    <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-slate-200' : 'bg-indigo-500')} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-slate-800">{n.subject}</span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">{n.message}</span>
                      <span className="mt-1 block text-[10px] text-slate-400">{relTime(n.sent_at)} · {n.type}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="relative">
          <button onClick={() => { setOpenUser((v) => !v); setOpenNotifs(false) }} className="flex items-center gap-2.5 rounded-lg p-1.5 pl-2 hover:bg-slate-100">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">{initials}</span>
            <span className="hidden text-left md:block">
              <span className="block text-xs font-semibold text-slate-800">{user?.name}</span>
              <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-400">{ROLE_LABELS[user?.role]}</span>
            </span>
          </button>
          {openUser && (
            <div className="animate-fade-up absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
              <div className="border-b border-slate-100 px-4 py-3">
                <p className="text-sm font-semibold text-slate-800">{user?.name}</p>
                <p className="truncate text-xs text-slate-500">{user?.email}</p>
              </div>
              {isDemoMode && auth.demoUsers && (
                <div className="border-b border-slate-100 py-2">
                  <p className="flex items-center gap-1.5 px-4 pb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    <UserCheck className="h-3 w-3" /> Switch demo role
                  </p>
                  {auth.demoUsers.map((u) => (
                    <button
                      key={u.id}
                      onClick={async () => { await switchUser(u.email); setOpenUser(false) }}
                      className={cx(
                        'flex w-full items-center justify-between px-4 py-2 text-left text-xs hover:bg-indigo-50',
                        u.id === user?.id && 'bg-indigo-50/60'
                      )}
                    >
                      <span className="font-medium text-slate-700">{u.name}</span>
                      <span className="text-[10px] font-bold uppercase text-indigo-500">{ROLE_LABELS[u.role]}</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="px-4 py-2.5 text-[11px] text-slate-400">
                Signed in automatically — no login required.
              </p>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  return (
    <div className="min-h-screen">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:pl-64">
        <TopBar onMenu={() => setSidebarOpen(true)} />
        <main className="mx-auto max-w-[1400px] p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
