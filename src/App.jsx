import { HashRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './services/session'
import { ConfirmProvider, Toaster } from './components/ui'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import IssueList from './pages/IssueList'
import CreateIssue from './pages/CreateIssue'
import IssueDetail from './pages/IssueDetail'
import Reports from './pages/Reports'
import AuditLog from './pages/AuditLog'
import Clients from './pages/Clients'
import Settings from './pages/Settings'
import Knowledge from './pages/Knowledge'

function Splash() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-100">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
        <p className="mt-4 text-sm font-medium text-slate-500">Loading Tech Issue Manager…</p>
      </div>
    </div>
  )
}

function RequireAuth({ children }) {
  const { loading } = useAuth()
  if (loading) return <Splash />
  return children
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-6xl font-bold text-slate-200">404</p>
      <p className="mt-3 text-sm font-semibold text-slate-600">Page not found</p>
      <p className="mt-1 text-xs text-slate-400">The page you are looking for does not exist.</p>
      <a href="#/" className="mt-5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Back to Dashboard</a>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ConfirmProvider>
        <HashRouter>
          <Toaster />
          <Routes>
            <Route element={<RequireAuth><Layout /></RequireAuth>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/issues" element={<IssueList mode="all" />} />
              <Route path="/issues/new" element={<CreateIssue />} />
              <Route path="/issues/:id" element={<IssueDetail />} />
              <Route path="/knowledge" element={<Knowledge />} />
              <Route path="/clients" element={<Clients />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/audit-log" element={<AuditLog />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </HashRouter>
      </ConfirmProvider>
    </AuthProvider>
  )
}
