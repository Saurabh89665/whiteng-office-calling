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
    const reader = new FileReader()
    reader.onload = (evt) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const MAX_SIZE = 600
        let width = img.width
        let height = img.height

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width
            width = MAX_SIZE
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height
            height = MAX_SIZE
          }
        }

        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)

        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85)
        setAvatar(compressedDataUrl)
        sessionStorage.setItem('empAvatar', compressedDataUrl)

        socket.emit('update_avatar', {
          token,
          employeeId: empId,
          employeeName: empName,
          avatar: compressedDataUrl
        }, (res) => {
          if (res && res.success) console.log('Avatar updated successfully!')
        })
      }
      img.src = evt.target.result
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
      
      // Professional 4-tone ascending ringtone chime (C5, E5, G5, C6)
      const notes = [
        { freq: 523.25, time: 0, duration: 0.25 },     // C5
        { freq: 659.25, time: 0.15, duration: 0.25 },   // E5
        { freq: 783.99, time: 0.30, duration: 0.35 },   // G5
        { freq: 1046.50, time: 0.50, duration: 0.6 }    // C6
      ]

      notes.forEach(({ freq, time, duration }) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'triangle' // Richer tone than pure sine
        osc.frequency.setValueAtTime(freq, ctx.currentTime + time)
        
        const startTime = ctx.currentTime + time
        gain.gain.setValueAtTime(0, startTime)
        gain.gain.linearRampToValueAtTime(0.8, startTime + 0.03)
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
        
        osc.connect(gain)
        gain.connect(ctx.destination)
        
        osc.start(startTime)
        osc.stop(startTime + duration + 0.05)
      })
    } catch (e) { console.error('Audio error', e) }
  }

  function speak(text) {
    try {
      if (!window.speechSynthesis) return
      window.speechSynthesis.cancel()

      const u = new SpeechSynthesisUtterance(text)
      u.rate = 0.92   // Natural fluent speaking pace
      u.pitch = 1.05  // Clear professional tone
      u.volume = 1.0

      // Select best fluent voice (Google US/UK English or Microsoft English)
      const voices = window.speechSynthesis.getVoices()
      const preferredVoice = voices.find(v => 
        (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Microsoft') || v.name.includes('Samantha') || v.name.includes('Zira') || v.name.includes('Jenny')) &&
        v.lang.startsWith('en')
      ) || voices.find(v => v.lang.startsWith('en'))

      if (preferredVoice) u.voice = preferredVoice

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
