/**
 * Employee Dashboard — Office Sir Calling System
 * Shows status and handles incoming call notification with sound + TTS.
 */

'use strict';

// ── State ──────────────────────────────────────
let currentCall = null;    // { callId, employeeName }
let audioCtx    = null;

// ── DOM refs ───────────────────────────────────
const empWelcomeName = document.getElementById('empWelcomeName');
const statusDot      = document.getElementById('statusDot');
const statusText     = document.getElementById('statusText');
const statusSub      = document.getElementById('statusSub');
const callModal      = document.getElementById('callModal');
const callModalName  = document.getElementById('callModalName');
const connDot        = document.getElementById('connDot');
const connText       = document.getElementById('connText');
const serverUrlLabel = document.getElementById('serverUrlLabel');

// ── Init ───────────────────────────────────────
async function init() {
  try {
    const cfg = await window.electronAPI.getConfig();
    serverUrlLabel.textContent = cfg.serverUrl || '';

    // Get current logged-in user from main process
    const user = await window.electronAPI.getCurrentUser();
    const name = user.name || 'Employee';
    empWelcomeName.textContent = `Welcome, ${name}!`;
    document.title = `${name} — Office Sir Calling System`;
  } catch (e) {
    empWelcomeName.textContent = 'Welcome!';
  }

  // Register server push listeners
  window.electronAPI.onIncomingCall(handleIncomingCall);
  window.electronAPI.onServerDisconnected(handleDisconnected);
  window.electronAPI.onServerReconnected(handleReconnected);
}

// ── Incoming Call ──────────────────────────────
function handleIncomingCall(data) {
  // data = { callId, callerName, employeeName, timestamp }
  currentCall = { callId: data.callId, employeeName: data.employeeName };

  // Update modal
  callModalName.textContent = data.employeeName;

  // Show modal
  callModal.classList.remove('hidden');

  // Play notification sound
  playNotificationSound();

  // TTS: "Saurabh, Sir is calling you."
  const message = `${data.employeeName}, Sir is calling you. Please report to Sir's cabin.`;
  window.electronAPI.speakText(message).catch(() => {});
}

// ── Acknowledge Call ───────────────────────────
async function acknowledgeCall() {
  if (!currentCall) return;

  const { callId, employeeName } = currentCall;

  // Hide modal immediately
  callModal.classList.add('hidden');
  currentCall = null;

  // Send acknowledgement to server
  await window.electronAPI.acknowledgeCall(callId, employeeName);

  // Stop flash
  // (main.js handles window.flashFrame)
}

// ── Notification Sound (Web Audio API) ────────
function playNotificationSound() {
  try {
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    // Pleasant 3-tone chime: C5, E5, G5
    const notes = [
      { freq: 523.25, start: 0.0,  dur: 0.45 },
      { freq: 659.25, start: 0.18, dur: 0.45 },
      { freq: 783.99, start: 0.36, dur: 0.6  }
    ];

    const masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.55;
    masterGain.connect(audioCtx.destination);

    notes.forEach(({ freq, start, dur }) => {
      const osc  = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.connect(gain);
      gain.connect(masterGain);

      osc.type = 'sine';
      osc.frequency.value = freq;

      const t = audioCtx.currentTime + start;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.8, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

      osc.start(t);
      osc.stop(t + dur + 0.05);
    });

    // Repeat chime 3 times
    let repeat = 0;
    const maxRepeat = 3;
    const repeatInterval = setInterval(() => {
      repeat++;
      if (repeat >= maxRepeat || !callModal.classList.contains('hidden') === false) {
        clearInterval(repeatInterval);
        return;
      }
      // Check if modal still open
      if (callModal.classList.contains('hidden')) {
        clearInterval(repeatInterval);
        return;
      }

      notes.forEach(({ freq, start, dur }) => {
        const osc  = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(masterGain);
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = audioCtx.currentTime + start;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.8, t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.start(t);
        osc.stop(t + dur + 0.05);
      });
    }, 1800);

  } catch (err) {
    console.error('[Employee] Sound error:', err.message);
  }
}

// ── Connection Handlers ────────────────────────
function handleDisconnected(reason) {
  connDot.className = 'conn-dot reconnecting';
  connText.textContent = 'Disconnected — Reconnecting...';
  statusText.textContent = '🔴 Reconnecting...';
  statusText.style.color = 'var(--warning)';
  statusDot.style.background = 'var(--warning)';
  statusDot.style.boxShadow = '0 0 12px var(--warning)';
  statusSub.textContent = 'Lost connection to server. Please wait...';
}

function handleReconnected() {
  connDot.className = 'conn-dot connected';
  connText.textContent = 'Connected to server';
  statusText.textContent = '🟢 Online';
  statusText.style.color = 'var(--green)';
  statusDot.style.background = 'var(--green)';
  statusDot.style.boxShadow = '0 0 12px var(--green), 0 0 24px rgba(34,197,94,0.3)';
  statusSub.textContent = 'Listening for Sir\'s call...';
}

// ── localStorage bridge ─────────────────────────
// employee-dashboard.html is loaded fresh (new renderer context), so we need
// the employee name. We store it in localStorage during the login step.
// But login.js runs in a DIFFERENT renderer load, so we use localStorage
// which IS shared across file:// pages in the same Electron profile.
// Note: localStorage is accessible in Electron renderer with contextIsolation.

// ── Start ──────────────────────────────────────
init();
