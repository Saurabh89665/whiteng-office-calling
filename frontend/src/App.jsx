import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import SirDashboard from './pages/SirDashboard'
import EmployeeDashboard from './pages/EmployeeDashboard'

// Helper: load from localStorage into sessionStorage if session is empty (auto-login on restart)
function restoreSession() {
  if (!sessionStorage.getItem('token')) {
    const token   = localStorage.getItem('token')
    const role    = localStorage.getItem('role')
    const empName = localStorage.getItem('empName')
    const empId   = localStorage.getItem('empId')
    const empAvatar = localStorage.getItem('empAvatar')
    if (token && role) {
      sessionStorage.setItem('token', token)
      sessionStorage.setItem('role', role)
      if (empName)   sessionStorage.setItem('empName', empName)
      if (empId)     sessionStorage.setItem('empId', empId)
      if (empAvatar) sessionStorage.setItem('empAvatar', empAvatar)
    }
  }
}
restoreSession()

function RequireSir({ children }) {
  restoreSession()
  const ok = (sessionStorage.getItem('token') || localStorage.getItem('token')) &&
             (sessionStorage.getItem('role') === 'sir' || localStorage.getItem('role') === 'sir')
  return ok ? children : <Navigate to="/" replace />
}

function RequireEmployee({ children }) {
  restoreSession()
  const ok = (sessionStorage.getItem('token') || localStorage.getItem('token')) &&
             (sessionStorage.getItem('role') === 'employee' || localStorage.getItem('role') === 'employee')
  return ok ? children : <Navigate to="/" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AutoRedirect />} />
        <Route path="/sir" element={<RequireSir><SirDashboard /></RequireSir>} />
        <Route path="/employee" element={<RequireEmployee><EmployeeDashboard /></RequireEmployee>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

// Auto-redirect to dashboard if already logged in permanently
function AutoRedirect() {
  restoreSession()
  const role = sessionStorage.getItem('role') || localStorage.getItem('role')
  if (role === 'employee') return <Navigate to="/employee" replace />
  if (role === 'sir')      return <Navigate to="/sir" replace />
  return <Login />
}
