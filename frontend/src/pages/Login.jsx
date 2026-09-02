import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import socket from '../socket'

export default function Login() {
  const [step, setStep]         = useState('role')
  const [password, setPassword] = useState('')
  const [empPassword, setEmpPassword] = useState('')
  const [selectedEmp, setSelectedEmp] = useState(null)
  const [employees, setEmployees]     = useState([])
  const [msg, setMsg]           = useState({ text: '', type: '' })
  const [loading, setLoading]   = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    socket.disconnect()
    sessionStorage.clear()
    // Do NOT clear localStorage here — it holds the saved auto-login credentials

    const handleBeforeInstall = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
  }, [])

  const installApp = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          setDeferredPrompt(null)
        }
      })
    } else {
      alert('To install: Click the 3 dots in top-right of your browser → Save and share → Install Whiteng Calling (or click the computer/download icon in your URL bar).')
    }
  }

  function selectRole(r) {
    setStep(r); setMsg({ text: '', type: '' })
    setSelectedEmp(null); setEmpPassword('')
    if (r === 'employee') fetchEmployees()
  }

  async function fetchEmployees() {
    try {
      const res  = await fetch('/api/employees')
      const data = await res.json()
      setEmployees(data)
    } catch {
      setMsg({ text: 'Cannot connect to server.', type: 'error' })
    }
  }

  function connectSocket(cb) {
    if (socket.connected) { cb(); return }
    socket.connect()
    socket.once('connect', cb)
    socket.once('connect_error', () => {
      setMsg({ text: '❌ Cannot reach server. Is backend running?', type: 'error' })
      setLoading(false)
    })
  }

  function sirLogin() {
    if (!password.trim()) { setMsg({ text: 'Enter your password.', type: 'error' }); return }
    setLoading(true); setMsg({ text: 'Authenticating...', type: 'info' })
    connectSocket(() => {
      socket.emit('sir_login', { password }, (res) => {
        if (res.success) {
          sessionStorage.setItem('token', res.token)
          sessionStorage.setItem('role', 'sir')
          navigate('/sir')
        } else {
          setMsg({ text: res.error || 'Login failed.', type: 'error' })
          setLoading(false)
        }
      })
    })
  }

  function empLogin() {
    if (!selectedEmp) { setMsg({ text: 'Select your name first.', type: 'error' }); return }
    if (!empPassword.trim()) { setMsg({ text: 'Enter your password.', type: 'error' }); return }
    setLoading(true); setMsg({ text: `Logging in as ${selectedEmp.name}...`, type: 'info' })
    connectSocket(() => {
      socket.emit('employee_login', {
        employeeId: selectedEmp.id,
        employeeName: selectedEmp.name,
        password: empPassword
      }, (res) => {
        if (res.success) {
          // Save to sessionStorage (current tab)
          sessionStorage.setItem('token',   res.token)
          sessionStorage.setItem('role',    'employee')
          sessionStorage.setItem('empName', selectedEmp.name)
          sessionStorage.setItem('empId',   selectedEmp.id)
          // Save to localStorage (persistent — auto-login next time)
          localStorage.setItem('token',   res.token)
          localStorage.setItem('role',    'employee')
          localStorage.setItem('empName', selectedEmp.name)
          localStorage.setItem('empId',   selectedEmp.id)
          navigate('/employee')
        } else {
          setMsg({ text: res.error || 'Login failed.', type: 'error' })
          setLoading(false)
        }
      })
    })
  }

  return (
    <div className="login-bg">
      <div className="login-card">

        {/* Brand Header */}
        <div className="brand-header">
          <span className="brand-logo">🏢</span>
          <div className="brand-company">Whiteng Software</div>
          <div className="brand-subtitle">Office Calling System</div>
        </div>
        <div className="brand-divider" />

        {/* Step 1: Role */}
        {step === 'role' && (
          <>
            <p className="role-hint">Who are you?</p>
            <div className="role-cards">
              <div className="role-card sir-card" onClick={() => selectRole('sir')}>
                <div className="role-icon">👔</div>
                <div className="role-title">Sir</div>
                <div className="role-desc">Office Manager</div>
                <span className="admin-badge">SUPER ADMIN</span>
              </div>
              <div className="role-card" onClick={() => selectRole('employee')}>
                <div className="role-icon">👤</div>
                <div className="role-title">Employee</div>
                <div className="role-desc">Staff Member</div>
              </div>
            </div>

            {/* Direct Install App Button inside Login Card */}
            <div style={{ marginTop: '24px', textAlign: 'center' }}>
              <button
                onClick={installApp}
                style={{
                  width: '100%',
                  padding: '11px',
                  background: 'var(--bg2)',
                  color: 'var(--primary)',
                  border: '1.5px solid var(--border)',
                  borderRadius: '12px',
                  fontSize: '.88rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all .2s'
                }}
              >
                💻 <span>Install App on Desktop</span>
              </button>
            </div>
          </>
        )}

        {/* Step 2a: Sir Password */}
        {step === 'sir' && (
          <div className="form-section">
            <h2>👔 Admin Login</h2>
            <div className="form-group">
              <label>Admin Password</label>
              <input type="password" placeholder="Enter password" value={password} autoFocus
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !loading && sirLogin()} />
            </div>
            <button className="btn-primary" onClick={sirLogin} disabled={loading}>
              {loading ? 'Authenticating…' : '🔐 Login as Admin'}
            </button>
            <button className="btn-back" onClick={() => setStep('role')}>← Back</button>
          </div>
        )}

        {/* Step 2b: Employee Select + Password */}
        {step === 'employee' && (
          <div className="form-section">
            <h2>👤 Employee Login</h2>

            <div className="form-group">
              <label>Your Name</label>
              {employees.length === 0 ? (
                <p style={{ color: 'var(--text3)', fontSize: '.88rem', padding: '12px 0' }}>
                  No employees added yet. Ask your admin.
                </p>
              ) : (
                <div className="emp-name-grid">
                  {employees.map(emp => (
                    <button key={emp.id}
                      className={`emp-name-btn ${selectedEmp?.id === emp.id ? 'selected' : ''}`}
                      onClick={() => setSelectedEmp(emp)} disabled={loading}>
                      {emp.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedEmp && (
              <div className="form-group">
                <label>Password</label>
                <input type="password" placeholder={`Password for ${selectedEmp.name}`}
                  value={empPassword} autoFocus
                  onChange={e => setEmpPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !loading && empLogin()} />
              </div>
            )}

            <button className="btn-primary" onClick={empLogin}
              disabled={loading || !selectedEmp || !empPassword}>
              {loading ? 'Logging in…' : '→ Login'}
            </button>
            <button className="btn-back" onClick={() => setStep('role')}>← Back</button>
          </div>
        )}

        {msg.text && <div className={`msg msg-${msg.type}`}>{msg.text}</div>}
      </div>
    </div>
  )
}
