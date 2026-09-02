import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import socket from '../socket'

const TIME = () => new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

export default function SirDashboard() {
  const [tab, setTab]           = useState('call')     // 'call' | 'manage'
  const [connected, setConnected] = useState(true)
  const [employees, setEmployees] = useState([])       // {id, name, online}
  const [empList, setEmpList]   = useState([])         // {id, name} — for manage tab
  const [callLog, setCallLog]   = useState([])
  const [calling, setCalling]   = useState({})
  const [callingAll, setCallingAll] = useState(false)
  const [toast, setToast]       = useState(null)
  const [wifiSettings, setWifiSettings] = useState({ allowed_ips: [], your_ip: '' })
  const [customIp, setCustomIp] = useState('')

  // Add employee form
  const [newName, setNewName]   = useState('')
  const [newPass, setNewPass]   = useState('')
  const [addLoading, setAddLoading] = useState(false)

  // Change password modal
  const [pwModal, setPwModal]   = useState(null)       // {id, name} or null
  const [newPw, setNewPw]       = useState('')

  const token    = sessionStorage.getItem('token')
  const toastRef = useRef(null)
  const navigate = useNavigate()

  const appUrl = window.location.origin

  // ── Connect ────────────────────────────────────
  useEffect(() => {
    document.title = 'Sir Admin — Whiteng Software'
    const doAuth = () => {
      socket.emit('sir_reconnect', { token }, (res) => {
        if (!res?.success) navigate('/')
      })
    }
    if (!socket.connected) { socket.connect(); socket.once('connect', doAuth) }
    else doAuth()

    socket.on('employees_status', setEmployees)
    socket.on('employees_list',   setEmpList)
    socket.on('office_wifi_status', setWifiSettings)
    socket.on('call_acknowledged', handleAck)
    socket.on('connect',    () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))

    return () => {
      socket.off('employees_status', setEmployees)
      socket.off('employees_list',   setEmpList)
      socket.off('office_wifi_status', setWifiSettings)
      socket.off('call_acknowledged', handleAck)
      socket.off('connect')
      socket.off('disconnect')
    }
  }, [])

  // ── Toast ──────────────────────────────────────
  const showToast = useCallback((msg, type = 'info', ms = 4000) => {
    setToast({ msg, type })
    clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToast(null), ms)
  }, [])

  // ── Ack ────────────────────────────────────────
  const handleAck = useCallback((data) => {
    showToast(`✅ ${data.employeeName} is on the way!`, 'success', 5000)
    setCallLog(prev => prev.map(i =>
      i.callId === data.callId ? { ...i, acked: true, ackTime: TIME() } : i
    ))
  }, [showToast])

  // ── Call single employee ──────────────────────
  const callEmployee = useCallback((emp) => {
    if (calling[emp.id]) return
    setCalling(p => ({ ...p, [emp.id]: true }))
    showToast(`📞 Calling ${emp.name}…`, 'info', 3000)
    socket.emit('call_employee', { token, employeeId: emp.id, employeeName: emp.name }, (res) => {
      setTimeout(() => setCalling(p => ({ ...p, [emp.id]: false })), 3000)
      if (res.success) {
        setCallLog(p => [{ callId: res.callId, name: emp.name, time: TIME(), acked: false }, ...p.slice(0, 29)])
      } else {
        showToast(`❌ ${res.error}`, 'error', 5000)
      }
    })
  }, [calling, token, showToast])

  // ── Call ALL employees (Broadcast Call) ───────
  const callAllEmployees = useCallback(() => {
    const onlineCount = employees.filter(e => e.online).length
    if (onlineCount === 0) {
      showToast('❌ No employees are currently online to call.', 'error')
      return
    }
    setCallingAll(true)
    showToast(`📢 Calling ALL (${onlineCount}) online employees to the cabin…`, 'info', 4000)

    socket.emit('call_all_employees', { token }, (res) => {
      setTimeout(() => setCallingAll(false), 3000)
      if (res.success) {
        setCallLog(p => [{
          callId: res.callId,
          name: `📢 EVERYONE (${res.count} employees)`,
          time: TIME(),
          acked: false
        }, ...p.slice(0, 29)])
        showToast(`✅ Notification sent to all ${res.count} online employees!`, 'success', 4000)
      } else {
        showToast(`❌ ${res.error}`, 'error')
      }
    })
  }, [employees, token, showToast])

  // ── Add employee ───────────────────────────────
  function addEmployee() {
    if (!newName.trim()) { showToast('Enter employee name.', 'error'); return }
    if (newPass.length < 4) { showToast('Password must be at least 4 characters.', 'error'); return }
    setAddLoading(true)
    socket.emit('add_employee', { token, name: newName.trim(), password: newPass }, (res) => {
      setAddLoading(false)
      if (res.success) {
        showToast(`✅ ${res.employee.name} added successfully!`, 'success')
        setNewName(''); setNewPass('')
      } else {
        showToast(`❌ ${res.error}`, 'error')
      }
    })
  }

  // ── Remove employee ────────────────────────────
  function removeEmployee(emp) {
    if (!confirm(`Remove ${emp.name} from the system?`)) return
    socket.emit('remove_employee', { token, employeeId: emp.id }, (res) => {
      if (res.success) showToast(`🗑️ ${emp.name} removed.`, 'info')
      else showToast(`❌ ${res.error}`, 'error')
    })
  }

  // ── Update password ────────────────────────────
  function updatePassword() {
    if (!pwModal || newPw.length < 4) { showToast('Password must be ≥4 chars.', 'error'); return }
    socket.emit('update_employee_password', { token, employeeId: pwModal.id, password: newPw }, (res) => {
      if (res.success) { showToast(`🔑 Password updated for ${pwModal.name}.`, 'success'); setPwModal(null); setNewPw('') }
      else showToast(`❌ ${res.error}`, 'error')
    })
  }

  // ── Copy Share Link ────────────────────────────
  function copyLink() {
    navigator.clipboard.writeText(appUrl)
    showToast('🔗 Employee Link Copied!', 'success')
  }

  const onlineCount = employees.filter(e => e.online).length

  return (
    <div className="page">
      {/* Connection bar */}
      <div className="conn-bar">
        <div className={`dot ${connected ? 'dot-green' : 'dot-red'}`} />
        <span>{connected ? 'Connected' : 'Disconnected — reconnecting…'}</span>
        <span className="conn-right">Whiteng Software</span>
      </div>

      {/* Header */}
      <header className="sir-header">
        <div className="header-brand">
          <div className="company">🏢 Whiteng Software</div>
          <div className="role">Admin / Super Admin Dashboard</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="admin-badge-header">👔 Sir — Admin</div>
          <button className="btn-logout" onClick={() => { sessionStorage.clear(); socket.disconnect(); navigate('/'); }}>
            🚪 Logout
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="sir-tabs">
        <button className={`tab-btn ${tab === 'call' ? 'active' : ''}`} onClick={() => setTab('call')}>
          📞 Call Employees
          {onlineCount > 0 && <span style={{marginLeft:'6px',background:'var(--green)',color:'#fff',borderRadius:'99px',padding:'1px 7px',fontSize:'.7rem'}}>{onlineCount}</span>}
        </button>
        <button className={`tab-btn ${tab === 'manage' ? 'active' : ''}`} onClick={() => setTab('manage')}>
          👥 Manage & Share
          <span style={{marginLeft:'6px',color:'var(--text3)',fontSize:'.78rem'}}>({empList.length})</span>
        </button>
      </div>

      {/* ─ Tab: Call Employees ─ */}
      {tab === 'call' && (
        <div className="sir-body">
          <main className="sir-main">
            {/* Top Broadcast Bar: Everyone Come To Cabin */}
            <div className="broadcast-card">
              <div className="broadcast-info">
                <div className="broadcast-title">📢 Call Everyone to Cabin</div>
                <div className="broadcast-sub">Send an immediate high-priority alert to all online employees simultaneously</div>
              </div>
              <button
                className={`btn-broadcast ${callingAll ? 'calling' : ''}`}
                onClick={callAllEmployees}
                disabled={callingAll || onlineCount === 0}
              >
                {callingAll ? '🔔 CALLING ALL…' : '🚨 CALL EVERYONE NOW'}
              </button>
            </div>

            <div className="section-label">
              Individual Employees <span className="online-count">● {onlineCount} online</span>
            </div>
            {employees.length === 0 ? (
              <p style={{ color: 'var(--text3)', fontSize: '.9rem' }}>
                No employees yet. Go to <b>Manage & Share</b> to add staff.
              </p>
            ) : (
              <div className="emp-cards">
                {employees.map(emp => (
                  <div key={emp.id} className={`emp-card ${emp.online ? 'online' : 'offline'}`}
                    onClick={() => emp.online && callEmployee(emp)}>
                    {calling[emp.id] && <div className="calling-overlay">📞 Calling…</div>}
                    <div className="emp-avatar">
                      {emp.avatar ? (
                        <img src={emp.avatar} alt={emp.name} />
                      ) : (
                        emp.name.charAt(0)
                      )}
                    </div>
                    <div className="emp-card-info">
                      <div className="emp-card-name">{emp.name}</div>
                      <div className="emp-card-status">{emp.online ? '🟢 Online' : '🔴 Offline'}</div>
                      {emp.online && (
                        <button className="call-btn" onClick={e => { e.stopPropagation(); callEmployee(emp) }}>
                          📞 Call
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>
        </div>
      )}

      {/* ─ Tab: Manage Employees & Share Link ─ */}
      {tab === 'manage' && (
        <div className="manage-body">
          {/* Employee list */}
          <div className="manage-list">
            <h3>Current Employees ({empList.length})</h3>
            {empList.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">👥</span>
                <p>No employees added yet.</p>
                <p style={{fontSize:'.82rem',marginTop:'6px',color:'var(--text3)'}}>Use the form on the right to add employees.</p>
              </div>
            ) : (
              <table className="emp-list-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {empList.map(emp => {
                    const online = employees.find(e => e.id === emp.id)?.online ?? false
                    return (
                      <tr key={emp.id}>
                        <td>
                          <span className="emp-row-avatar">{emp.name.charAt(0)}</span>
                          {emp.name}
                        </td>
                        <td>
                          <span className={`emp-status-dot ${online ? 'on' : 'off'}`} />
                          {online ? 'Online' : 'Offline'}
                        </td>
                        <td>
                          <button className="btn-pw" onClick={() => { setPwModal(emp); setNewPw('') }}>🔑 Password</button>
                          <button className="btn-remove" onClick={() => removeEmployee(emp)}>🗑️ Remove</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Add employee form & Share section */}
          <div className="manage-form-panel">
            <h3>➕ Add New Employee</h3>
            <div className="form-group">
              <label>Full Name</label>
              <input type="text" placeholder="e.g. Saurabh" value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !addLoading && addEmployee()} />
            </div>
            <div className="form-group">
              <label>Set Password</label>
              <input type="password" placeholder="Min 4 characters" value={newPass}
                onChange={e => setNewPass(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !addLoading && addEmployee()} />
            </div>
            <button className="add-emp-btn" onClick={addEmployee} disabled={addLoading || !newName.trim() || newPass.length < 4}>
              {addLoading ? 'Adding…' : '✅ Add Employee'}
            </button>

            <div className="form-divider" />

            {/* Shareable Link Box */}
            <div className="share-box">
              <div className="share-title">🔗 Employee Access Link</div>
              <div className="share-desc">Send this link to your employees so they can login or download the desktop app:</div>
              <div className="share-input-wrap">
                <input className="share-input" readOnly value={appUrl} />
                <button className="share-copy-btn" onClick={copyLink}>Copy</button>
              </div>
            </div>

            {/* Office Wi-Fi Security Box */}
            <div className="share-box" style={{ borderColor: wifiSettings.allowed_ips?.length ? 'var(--green)' : 'var(--border)' }}>
              <div className="share-title">
                📶 Company Wi-Fi Protection
                <span style={{
                  fontSize: '.72rem',
                  padding: '2px 8px',
                  borderRadius: '99px',
                  background: wifiSettings.allowed_ips?.length ? 'var(--green-bg)' : '#f1f5f9',
                  color: wifiSettings.allowed_ips?.length ? 'var(--green)' : 'var(--text3)',
                  marginLeft: 'auto'
                }}>
                  {wifiSettings.allowed_ips?.length ? '🔒 Active' : '🔓 Off (Anywhere)'}
                </span>
              </div>
              <div className="share-desc">
                {wifiSettings.allowed_ips?.length
                  ? `Only employees connected to this Wi-Fi IP (${wifiSettings.allowed_ips.join(', ')}) can log in.`
                  : 'Restrict login strictly to your company Wi-Fi router. Enter your Wi-Fi IP below or click Use Current IP:'}
              </div>

              {/* IP Input & Set buttons */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input
                  className="share-input"
                  placeholder="Enter Office IP (e.g. 103.156.19.42)"
                  value={customIp}
                  onChange={e => setCustomIp(e.target.value)}
                />
                <button
                  style={{
                    padding: '8px 14px',
                    background: 'var(--primary)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '.82rem',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    const targetIp = (customIp || wifiSettings.your_ip || '').trim()
                    if (!targetIp) {
                      showToast('Please enter your Wi-Fi IP or check connection.', 'error')
                      return
                    }
                    socket.emit('update_office_wifi', { token, allowed_ips: [targetIp] }, (res) => {
                      if (res.success) {
                        showToast(`🔒 Wi-Fi locked to: ${targetIp}`, 'success')
                        setCustomIp('')
                      } else {
                        showToast(res.error || 'Failed to update Wi-Fi.', 'error')
                      }
                    })
                  }}
                >
                  Save IP
                </button>
              </div>

              {wifiSettings.your_ip && (
                <div style={{ fontSize: '.76rem', color: 'var(--text2)', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Detected IP: <b style={{ color: 'var(--text1)' }}>{wifiSettings.your_ip}</b></span>
                  <button
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '.76rem', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline' }}
                    onClick={() => setCustomIp(wifiSettings.your_ip)}
                  >
                    Insert Detected IP
                  </button>
                </div>
              )}

              {wifiSettings.allowed_ips?.length > 0 && (
                <button
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: '#ffffff',
                    color: 'var(--red)',
                    border: '1.5px solid #fca5a5',
                    borderRadius: '8px',
                    fontSize: '.78rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    marginTop: '4px'
                  }}
                  onClick={() => {
                    socket.emit('update_office_wifi', { token, allowed_ips: [] }, (res) => {
                      if (res.success) showToast('🔓 Wi-Fi restriction removed (login allowed from anywhere).', 'info')
                    })
                  }}
                >
                  🔓 Remove Restriction (Allow Anywhere)
                </button>
              )}
            </div>

            <p className="form-note">
              🔒 Employees use their name + the password you set to log in.<br/><br/>
              🗑️ Removing an employee automatically disconnects them.
            </p>
          </div>
        </div>
      )}

      {/* Password update modal */}
      {pwModal && (
        <div className="modal-overlay" onClick={() => setPwModal(null)}>
          <div className="call-modal" onClick={e => e.stopPropagation()}
            style={{ borderColor: 'var(--primary)' }}>
            <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '16px' }}>🔑</span>
            <div className="call-title" style={{ color: 'var(--primary)', fontSize: '1.2rem' }}>
              Update Password
            </div>
            <div className="call-body">Set new password for <span className="call-name">{pwModal.name}</span></div>
            <input type="password" placeholder="New password (min 4 chars)" value={newPw}
              onChange={e => setNewPw(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && updatePassword()}
              style={{ width:'100%', padding:'11px 14px', background:'var(--bg2)', border:'1.5px solid var(--border)', borderRadius:'8px', color:'var(--text1)', fontSize:'.95rem', fontFamily:'inherit', outline:'none', marginBottom:'16px' }} />
            <div style={{ display:'flex', gap:'10px' }}>
              <button className="ok-btn" style={{ background:'var(--primary)' }} onClick={updatePassword}>Update Password</button>
              <button className="ok-btn" style={{ background:'transparent', border:'1px solid var(--border)', color:'var(--text2)' }} onClick={() => setPwModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  )
}
