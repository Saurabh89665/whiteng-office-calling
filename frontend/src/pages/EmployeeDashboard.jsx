import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import socket from '../socket'

export default function EmployeeDashboard() {
  const [connected, setConnected]       = useState(true)
  const [incomingCall, setIncomingCall] = useState(null)
  const [avatar, setAvatar]             = useState(sessionStorage.getItem('empAvatar') || '')
  const token   = sessionStorage.getItem('token')
  const empName = sessionStorage.getItem('empName') || 'Employee'
  const empId   = sessionStorage.getItem('empId')
  const audioCtx = useRef(null)
  const fileInputRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    document.title = `${empName} — Whiteng Software`
    const doReconnect = () => {
      socket.emit('employee_reconnect', { token, employeeId: empId, employeeName: empName }, (res) => {
        if (res && !res.success) navigate('/')
        else if (res && res.avatar) {
          setAvatar(res.avatar)
          sessionStorage.setItem('empAvatar', res.avatar)
        }
      })
    }
    if (!socket.connected) { socket.connect(); socket.once('connect', doReconnect) }
    else doReconnect()

    socket.on('incoming_call', handleCall)
    socket.on('kicked', () => { alert('Your account was removed by admin.'); navigate('/') })
    socket.on('connect',    () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('reconnect',  () => { setConnected(true); doReconnect() })

    return () => {
      socket.off('incoming_call', handleCall)
      socket.off('kicked')
      socket.off('connect')
      socket.off('disconnect')
      socket.off('reconnect')
    }
  }, [])

  function handlePhotoUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      alert('Photo must be less than 2MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = (evt) => {
      const dataUrl = evt.target.result
      setAvatar(dataUrl)
      sessionStorage.setItem('empAvatar', dataUrl)
      socket.emit('update_avatar', { avatar: dataUrl })
    }
    reader.readAsDataURL(file)
  }

  function handleCall(data) {
    setIncomingCall(data)
    playChime()
    const speechText = data.isBroadcast
      ? `Attention everyone! Sir is calling all employees to the cabin immediately!`
      : `${data.employeeName}, Sir is calling you. Please report to Sir's cabin.`
    speak(speechText)
  }

  function acknowledge() {
    if (!incomingCall) return
    socket.emit('acknowledge_call', { callId: incomingCall.callId, employeeName: incomingCall.employeeName })
    setIncomingCall(null)
  }

  function logout() {
    sessionStorage.clear()
    socket.disconnect()
    navigate('/')
  }

  function playChime() {
    try {
      if (!audioCtx.current) audioCtx.current = new AudioContext()
      const ctx = audioCtx.current
      if (ctx.state === 'suspended') ctx.resume()
      ;[[523.25, 0], [659.25, 0.18], [783.99, 0.36], [1046.50, 0.54]].forEach(([freq, delay]) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = 'sine'; osc.frequency.value = freq
        const t = ctx.currentTime + delay
        gain.gain.setValueAtTime(0, t)
        gain.gain.linearRampToValueAtTime(0.7, t + 0.04)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
        osc.start(t); osc.stop(t + 0.55)
      })
    } catch (e) { console.error('Audio error', e) }
  }

  function speak(text) {
    try {
      window.speechSynthesis?.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.rate = 0.9; u.volume = 1
      window.speechSynthesis?.speak(u)
    } catch (e) {}
  }

  return (
    <div className="page">
      <div className="conn-bar">
        <div className={`dot ${connected ? 'dot-green' : 'dot-red'}`} />
        <span>{connected ? 'Connected' : 'Disconnected — reconnecting…'}</span>
        <span className="conn-right">Whiteng Software</span>
      </div>

      <header className="emp-header">
        <div>
          <div className="company">🏢 Whiteng Software</div>
          <div className="tagline">Office Calling System</div>
        </div>
        <button className="btn-logout" onClick={logout}>
          🚪 Logout
        </button>
      </header>

      <div className="emp-body">
        <div className="status-card">
          <div
            className="welcome-icon emp-avatar"
            style={{ margin: '0 auto 16px', cursor: 'pointer', position: 'relative' }}
            onClick={() => fileInputRef.current?.click()}
            title="Click to change profile photo"
          >
            {avatar ? (
              <img src={avatar} alt={empName} />
            ) : (
              empName.charAt(0)
            )}
          </div>
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handlePhotoUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '.75rem',
              color: 'var(--primary)',
              cursor: 'pointer',
              marginBottom: '16px',
              fontWeight: '600'
            }}
          >
            📷 Upload Profile Photo
          </button>
          <div className="welcome-name">Welcome, {empName}!</div>
          <div className="welcome-sub">You are logged in and ready to receive calls from Sir</div>
          <div className="status-display">
            <div className="big-dot" style={!connected ? { background:'var(--red)', boxShadow:'none', animation:'none' } : {}} />
            <div className="status-txt" style={{ color: connected ? 'var(--green)' : 'var(--red)' }}>
              {connected ? '🟢 Online' : '🔴 Offline'}
            </div>
            <div className="status-sub">
              {connected ? "Listening for Sir's call…" : 'Reconnecting to server…'}
            </div>
          </div>
        </div>
      </div>

      {incomingCall && (
        <div className="modal-overlay">
          <div className="call-modal" style={incomingCall.isBroadcast ? { borderColor: 'var(--red)', boxShadow: '0 0 50px rgba(220,38,38,.25)' } : {}}>
            <span className="call-bell">{incomingCall.isBroadcast ? '📢' : '🔔'}</span>
            <div className="call-title" style={incomingCall.isBroadcast ? { color: 'var(--red)' } : {}}>
              {incomingCall.isBroadcast ? 'EVERYONE TO CABIN!' : 'Sir is calling you!'}
            </div>
            <div className="call-body">
              {incomingCall.isBroadcast ? (
                <>
                  <b style={{ color: 'var(--text1)', fontSize: '1.1rem' }}>📢 ALL EMPLOYEES ALERT</b><br />
                  Sir is requesting <span className="call-name">EVERYONE</span> to come to the cabin immediately.
                </>
              ) : (
                <>
                  <span className="call-name">{incomingCall.employeeName}</span>, Sir is calling you.<br />
                  <span style={{ fontSize: '.82rem', color: 'var(--text3)' }}>
                    Please report to Sir's cabin — Whiteng Software
                  </span>
                </>
              )}
            </div>
            <button
              className="ok-btn"
              style={incomingCall.isBroadcast ? { background: 'var(--red)' } : {}}
              onClick={acknowledge}
            >
              ✅ OK — I'm On My Way!
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
