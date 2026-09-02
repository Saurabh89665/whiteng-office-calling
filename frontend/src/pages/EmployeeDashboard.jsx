import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import socket from '../socket'

export default function EmployeeDashboard() {
  const [connected, setConnected]       = useState(true)
  const [incomingCall, setIncomingCall] = useState(null)
  const [avatar, setAvatar]             = useState(sessionStorage.getItem('empAvatar') || '')
  const [uploading, setUploading]       = useState(false)
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
    setUploading(true)
    const reader = new FileReader()
    reader.onload = (evt) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        // Crop to a perfect SQUARE from center, then resize to 300x300
        const size = Math.min(img.width, img.height)
        const sx = (img.width - size) / 2
        const sy = (img.height - size) / 2
        canvas.width  = 300
        canvas.height = 300
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, sx, sy, size, size, 0, 0, 300, 300)

        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82)
        setAvatar(compressedDataUrl)
        sessionStorage.setItem('empAvatar', compressedDataUrl)

        socket.emit('update_avatar', {
          token,
          employeeId: empId,
          employeeName: empName,
          avatar: compressedDataUrl
        }, (res) => {
          setUploading(false)
          if (res && res.success) console.log('Photo updated on Admin dashboard!')
        })
      }
      img.src = evt.target.result
    }
    reader.readAsDataURL(file)
  }

  function handleCall(data) {
    setIncomingCall(data)
    if (data.isBroadcast) {
      playBuzzer()
    } else {
      playChime()
      const speechText = `${data.employeeName}... Please report to the cabin.`
      setTimeout(() => speak(speechText), 800)
    }
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

  function getCtx() {
    if (!audioCtx.current) audioCtx.current = new AudioContext()
    const ctx = audioCtx.current
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  }

  function playBuzzer() {
    try {
      const ctx = getCtx()
      const now = ctx.currentTime

      // Professional 3-phase alarm: deep tone → rise → alert
      const beeps = [
        { freq: 660, start: 0,    dur: 0.18 },
        { freq: 880, start: 0.22, dur: 0.18 },
        { freq: 1100, start: 0.44, dur: 0.28 },
      ]

      beeps.forEach(({ freq, start, dur }) => {
        const osc  = ctx.createOscillator()
        const gain = ctx.createGain()
        const t = now + start

        osc.type = 'square'
        osc.frequency.setValueAtTime(freq, t)

        gain.gain.setValueAtTime(0, t)
        gain.gain.linearRampToValueAtTime(0.85, t + 0.02)
        gain.gain.setValueAtTime(0.85, t + dur - 0.04)
        gain.gain.linearRampToValueAtTime(0, t + dur)

        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(t)
        osc.stop(t + dur + 0.02)
      })
    } catch (e) { console.error('Buzzer error', e) }
  }

  function playChime() {
    try {
      const ctx = getCtx()
      // Warm office door chime: ascending 4 notes
      const notes = [
        { freq: 523.25, time: 0,    dur: 0.30 },  // C5
        { freq: 659.25, time: 0.18, dur: 0.30 },  // E5
        { freq: 783.99, time: 0.36, dur: 0.30 },  // G5
        { freq: 1046.5, time: 0.54, dur: 0.55 },  // C6
      ]
      notes.forEach(({ freq, time, dur }) => {
        const osc  = ctx.createOscillator()
        const gain = ctx.createGain()
        const t = ctx.currentTime + time
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(freq, t)
        gain.gain.setValueAtTime(0, t)
        gain.gain.linearRampToValueAtTime(0.65, t + 0.03)
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(t)
        osc.stop(t + dur + 0.05)
      })
    } catch (e) { console.error('Chime error', e) }
  }

  function speak(text) {
    try {
      if (!window.speechSynthesis) return
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.rate   = 0.82
      u.pitch  = 1.0
      u.volume = 1.0
      const voices = window.speechSynthesis.getVoices()
      const preferred = voices.find(v =>
        (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Microsoft') ||
         v.name.includes('Jenny') || v.name.includes('Aria') || v.name.includes('Zira')) &&
        v.lang.startsWith('en')
      ) || voices.find(v => v.lang.startsWith('en'))
      if (preferred) u.voice = preferred
      window.speechSynthesis.speak(u)
    } catch (e) { console.error('TTS error', e) }
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
        <button className="btn-logout" onClick={logout}>🚪 Logout</button>
      </header>

      <div className="emp-body">
        <div className="status-card">

          {/* Profile Photo — perfect square, center-cropped */}
          <div
            className="emp-profile-photo"
            onClick={() => fileInputRef.current?.click()}
            title="Click to change profile photo"
          >
            {avatar
              ? <img src={avatar} alt={empName} />
              : <span>{empName.charAt(0).toUpperCase()}</span>
            }
            <div className="emp-photo-overlay">
              <span>📷</span>
            </div>
            {uploading && <div className="emp-photo-uploading">Uploading…</div>}
          </div>

          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handlePhotoUpload}
          />

          <button
            className="upload-photo-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            📷 {avatar ? 'Change Photo' : 'Upload Profile Photo'}
          </button>

          <div className="welcome-name">Welcome, {empName}!</div>
          <div className="welcome-sub">You are logged in and ready to receive calls from Sir</div>

          <div className="status-display">
            <div className="big-dot" style={!connected ? { background: 'var(--red)', animation: 'none' } : {}} />
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
          <div className="call-modal" style={incomingCall.isBroadcast ? { borderColor: 'var(--red)' } : {}}>
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
