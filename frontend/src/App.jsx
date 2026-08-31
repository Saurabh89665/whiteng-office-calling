import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import SirDashboard from './pages/SirDashboard'
import EmployeeDashboard from './pages/EmployeeDashboard'

function RequireSir({ children }) {
  const ok = sessionStorage.getItem('token') && sessionStorage.getItem('role') === 'sir'
  return ok ? children : <Navigate to="/" replace />
}

function RequireEmployee({ children }) {
  const ok = sessionStorage.getItem('token') && sessionStorage.getItem('role') === 'employee'
  return ok ? children : <Navigate to="/" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/sir" element={<RequireSir><SirDashboard /></RequireSir>} />
        <Route path="/employee" element={<RequireEmployee><EmployeeDashboard /></RequireEmployee>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
