/**
 * Sir Dashboard — Office Sir Calling System
 * Shows all employees with online/offline status.
 * Sir clicks an employee card to call them.
 */

'use strict';

// ── State ──────────────────────────────────────
let employeeStatus = [];   // [{ id, name, online }]
let activeCalls = {};      // callId -> { employeeId, employeeName, logItem }
let callHistory = [];      // [{time, text, acked, callId}]

// ── DOM refs ───────────────────────────────────
const empCardsGrid  = document.getElementById('empCardsGrid');
const callLog       = document.getElementById('callLog');
const callLogEmpty  = document.getElementById('callLogEmpty');
const onlineCount   = document.getElementById('onlineCount');
const connDot       = document.getElementById('connDot');
const connText      = document.getElementById('connText');
const toast         = document.getElementById('toast');
const serverUrlLabel = document.getElementById('serverUrlLabel');

// ── Init ───────────────────────────────────────
async function init() {
  // Show server URL
  try {
    const cfg = await window.electronAPI.getConfig();
    serverUrlLabel.textContent = cfg.serverUrl || '';
  } catch (_) {}

  // Register server push listeners
  window.electronAPI.onEmployeesStatus(handleEmployeesStatus);
  window.electronAPI.onCallAcknowledged(handleCallAcknowledged);
  window.electronAPI.onServerDisconnected(handleDisconnected);
  window.electronAPI.onServerReconnected(handleReconnected);

  // Show initial empty grid while waiting for first status push
  empCardsGrid.innerHTML = `<div style="color:var(--text-3);font-size:0.9rem;grid-column:1/-1;padding:20px 0;">
    Waiting for employee status...
  </div>`;
}

// ── Employee Status Handler ────────────────────
function handleEmployeesStatus(data) {
  employeeStatus = data;
  renderEmployeeCards();
}

function renderEmployeeCards() {
  empCardsGrid.innerHTML = '';

  const online  = employeeStatus.filter(e => e.online).length;
  onlineCount.textContent = `● ${online} online`;
  onlineCount.style.color = online > 0 ? 'var(--green)' : 'var(--text-3)';

  if (employeeStatus.length === 0) {
    empCardsGrid.innerHTML = `<div style="color:var(--text-3);grid-column:1/-1;padding:20px 0;">
      No employees configured.
    </div>`;
    return;
  }

  employeeStatus.forEach(emp => {
    const card = document.createElement('div');
    card.className = `emp-card ${emp.online ? 'online' : 'offline'}`;
    card.id = `card-${emp.id}`;

    card.innerHTML = `
      <div class="emp-card-avatar">${emp.name.charAt(0)}</div>
      <div class="emp-card-name">${emp.name}</div>
      <div class="emp-card-status">
        ${emp.online ? '🟢 Online' : '🔴 Offline'}
      </div>
      ${emp.online ? `<button class="emp-card-btn" onclick="callEmployee('${emp.id}','${emp.name}',event)">📞 Call</button>` : ''}
    `;

    if (emp.online) {
      card.title = `Click to call ${emp.name}`;
      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('emp-card-btn')) return; // handled by button
        callEmployee(emp.id, emp.name, e);
      });
    }

    empCardsGrid.appendChild(card);
  });
}

// ── Call Employee ──────────────────────────────
async function callEmployee(employeeId, employeeName, event) {
  if (event) event.stopPropagation();

  // Guard: already calling this employee?
  const card = document.getElementById(`card-${employeeId}`);
  if (card && card.classList.contains('calling')) return;

  // Mark card as calling
  if (card) card.classList.add('calling');

  showToast(`📞 Calling ${employeeName}...`, 'info', 3000);

  try {
    const result = await window.electronAPI.callEmployee(employeeId, employeeName);

    if (result.success) {
      const callId = result.callId;
      const logItem = addCallLogItem(employeeName, callId);
      activeCalls[callId] = { employeeId, employeeName, logItem };

      showToast(`✅ Call sent to ${employeeName}`, 'success', 3000);
    } else {
      showToast(`❌ ${result.error || 'Could not call ' + employeeName}`, 'error', 4000);
    }
  } catch (err) {
    showToast(`❌ Error: ${err.message}`, 'error', 4000);
  } finally {
    // Remove calling state after 3 seconds
    setTimeout(() => {
      if (card) card.classList.remove('calling');
    }, 3000);
  }
}

// ── Call Acknowledged ──────────────────────────
function handleCallAcknowledged(data) {
  // { callId, employeeName, timestamp, message }
  showToast(`✅ ${data.employeeName} received the notification!`, 'success', 5000);

  // Update call log entry
  const entry = activeCalls[data.callId];
  if (entry && entry.logItem) {
    const ackEl = entry.logItem.querySelector('.log-ack');
    if (ackEl) {
      ackEl.textContent = '✅ Notification received';
      entry.logItem.classList.add('acked');
    }
    delete activeCalls[data.callId];
  }
}

// ── Call Log ───────────────────────────────────
function addCallLogItem(employeeName, callId) {
  callLogEmpty.classList.add('hidden');

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  const item = document.createElement('div');
  item.className = 'call-log-item anim-fade-in';
  item.dataset.callId = callId;
  item.innerHTML = `
    <div class="log-time">${timeStr}</div>
    <div class="log-text">📞 Called <strong>${employeeName}</strong></div>
    <div class="log-ack" style="color:var(--text-3);">⏳ Awaiting response...</div>
  `;

  // Insert at top
  callLog.insertBefore(item, callLog.firstChild);

  // Keep max 50 entries
  const items = callLog.querySelectorAll('.call-log-item');
  if (items.length > 50) {
    items[items.length - 1].remove();
  }

  return item;
}

// ── Connection Handlers ────────────────────────
function handleDisconnected(reason) {
  connDot.className = 'conn-dot disconnected';
  connText.textContent = 'Disconnected — Reconnecting...';
  connDot.classList.add('reconnecting');
  showToast('⚠️ Server connection lost. Reconnecting...', 'error', 0); // 0 = persistent
}

function handleReconnected() {
  connDot.className = 'conn-dot connected';
  connText.textContent = 'Connected to server';
  hideToast();
  showToast('🟢 Reconnected to server', 'success', 3000);
}

// ── Toast ──────────────────────────────────────
let toastTimer = null;

function showToast(msg, type = 'info', duration = 3000) {
  clearTimeout(toastTimer);
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  toast.classList.remove('hidden');

  if (duration > 0) {
    toastTimer = setTimeout(() => hideToast(), duration);
  }
}

function hideToast() {
  toast.classList.add('hidden');
}

// ── Start ──────────────────────────────────────
init();
