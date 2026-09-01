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
        const MAX_SIZE = 200
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

        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.65)
        setAvatar(compressedDataUrl)
        sessionStorage.setItem('empAvatar', compressedDataUrl)

        socket.emit('update_avatar', {
          token,
          employeeId: empId,
          employeeName: empName,
          avatar: compressedDataUrl
        }, (res) => {
          if (res && res.success) console.log('Avatar updated successfully on server!')
        })
      }
      img.src = evt.target.result
    }
    reader.readAsDataURL(file)
  }

  function handleCall(data) {
    setIncomingCall(data)
    if (data.isBroadcast) {
      // For Everyone call: ONLY play buzzer (no voice speech)
      playBuzzer()
    } else {
      // For Individual employee call: play chime tone + speak voice announcement
      playChime()
      const speechText = `${data.employeeName}... Please report to the cabin.`
      setTimeout(() => speak(speechText), 700)
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

  function playBuzzer() {
    try {
      if (!audioCtx.current) audioCtx.current = new AudioContext()
      const ctx = audioCtx.current
      if (ctx.state === 'suspended') ctx.resume()

      // High-priority urgent 3-beep alarm buzzer (Square wave tone)
      ;[0, 0.25, 0.50].forEach((delay) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sawtooth' // Loud alert buzzer sound
        osc.frequency.setValueAtTime(880, ctx.currentTime + delay) // A5 frequency
        
        const startTime = ctx.currentTime + delay
        gain.gain.setValueAtTime(0, startTime)
        gain.gain.linearRampToValueAtTime(0.9, startTime + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18)
        
        osc.connect(gain)
        gain.connect(ctx.destination)
        
        osc.start(startTime)
        osc.stop(startTime + 0.20)
      })
    } catch (e) { console.error('Buzzer sound error', e) }
  }

  function playChime() {
    try {
      if (!audioCtx.current) audioCtx.current = new AudioContext()
      const ctx = audioCtx.current
      if (ctx.state === 'suspended') ctx.resume()
      
      // Warm, professional office chime (C5 -> G5 -> C6)
      const notes = [
        { freq: 523.25, time: 0, duration: 0.22 },     // C5
        { freq: 659.25, time: 0.14, duration: 0.22 },   // E5
        { freq: 783.99, time: 0.28, duration: 0.30 },   // G5
        { freq: 1046.50, time: 0.45, duration: 0.55 }   // C6
      ]

      notes.forEach(({ freq, time, duration }) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(freq, ctx.currentTime + time)
        
        const startTime = ctx.currentTime + time
        gain.gain.setValueAtTime(0, startTime)
        gain.gain.linearRampToValueAtTime(0.7, startTime + 0.03)
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
      u.rate = 0.82    // Slow, clear, professional speaking speed
      u.pitch = 1.0    // Natural professional pitch
      u.volume = 1.0

      // Select highest quality natural English voice available
      const voices = window.speechSynthesis.getVoices()
      const preferredVoice = voices.find(v => 
        (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Online') || v.name.includes('Microsoft') || v.name.includes('Jenny') || v.name.includes('Guy') || v.name.includes('Aria') || v.name.includes('Zira')) &&
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
