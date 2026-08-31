/**
 * Login Page — Office Sir Calling System
 * Handles role selection, Sir login, and Employee login.
 */

'use strict';

// ── State ──────────────────────────────────────
let serverUrl = '';
let selectedRole = null;

// ── DOM refs ───────────────────────────────────
const roleSection = document.getElementById('roleSection');
const sirSection  = document.getElementById('sirSection');
const empSection  = document.getElementById('empSection');
const empGrid     = document.getElementById('empGrid');
const statusMsg   = document.getElementById('statusMsg');
const sirLoginBtn = document.getElementById('sirLoginBtn');

// ── Init ───────────────────────────────────────
async function init() {
  try {
    const cfg = await window.electronAPI.getConfig();
    serverUrl = cfg.serverUrl || 'http://localhost:3000';
  } catch (e) {
    serverUrl = 'http://localhost:3000';
  }
}

init();

// ── Role Selection ─────────────────────────────
function selectRole(role) {
  selectedRole = role;
  roleSection.classList.add('hidden');
  clearStatus();

  if (role === 'sir') {
    sirSection.classList.remove('hidden');
    document.getElementById('sirPassword').focus();
  } else {
    empSection.classList.remove('hidden');
    loadEmployees();
  }
}

function goBack() {
  sirSection.classList.add('hidden');
  empSection.classList.add('hidden');
  roleSection.classList.remove('hidden');
  clearStatus();
  selectedRole = null;
}

// ── Sir Login ──────────────────────────────────
async function loginAsSir() {
  const password = document.getElementById('sirPassword').value.trim();
  if (!password) {
    showStatus('Please enter your password.', 'error');
    return;
  }

  setLoading(sirLoginBtn, true, 'Connecting...');
  clearStatus();
  showStatus('Connecting to server...', 'info');

  try {
    const result = await window.electronAPI.sirLogin(password);

    if (result.success) {
      showStatus('Login successful! Opening dashboard...', 'success');
      setTimeout(() => window.electronAPI.navigate('sir-dashboard'), 800);
    } else {
      showStatus(result.error || 'Login failed. Please try again.', 'error');
      setLoading(sirLoginBtn, false, 'Login →');
    }
  } catch (err) {
    showStatus('Unexpected error. Please try again.', 'error');
    setLoading(sirLoginBtn, false, 'Login →');
  }
}

// Allow Enter key for Sir login
document.getElementById('sirPassword').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loginAsSir();
});

// ── Employee Login ─────────────────────────────
async function loadEmployees() {
  empGrid.innerHTML = '<div style="grid-column:1/-1;color:var(--text-3);padding:12px;text-align:center;">Loading...</div>';

  try {
    const result = await window.electronAPI.fetchEmployees();

    if (!result.success || !result.employees || result.employees.length === 0) {
      empGrid.innerHTML = `
        <div style="grid-column:1/-1;color:var(--red);padding:12px;text-align:center;">
          ${result.error || 'Could not load employee list.'}<br/>
          <button onclick="loadEmployees()" style="margin-top:10px;padding:8px 16px;background:var(--primary);color:#fff;border:none;border-radius:8px;cursor:pointer;">
            Retry
          </button>
        </div>`;
      return;
    }

    empGrid.innerHTML = '';
    result.employees.forEach(emp => {
      const btn = document.createElement('button');
      btn.className = 'emp-btn';
      btn.innerHTML = `<span class="emp-btn-icon">👤</span>${emp.name}`;
      btn.onclick = () => loginAsEmployee(emp.id, emp.name);
      empGrid.appendChild(btn);
    });

  } catch (err) {
    empGrid.innerHTML = `<div style="grid-column:1/-1;color:var(--red);padding:12px;text-align:center;">Error loading employees.</div>`;
  }
}

async function loginAsEmployee(employeeId, employeeName) {
  // Visually mark the selected button
  document.querySelectorAll('.emp-btn').forEach(b => b.style.opacity = '0.5');
  clearStatus();
  showStatus(`Connecting as ${employeeName}...`, 'info');

  try {
    const result = await window.electronAPI.employeeLogin(employeeId, employeeName);

    if (result.success) {
      // Store employee name for dashboard
      sessionStorage.setItem('employeeName', employeeName);
      sessionStorage.setItem('employeeId', employeeId);
      showStatus('Login successful! Opening dashboard...', 'success');
      setTimeout(() => window.electronAPI.navigate('employee-dashboard'), 800);
    } else {
      showStatus(result.error || 'Login failed. Please try again.', 'error');
      document.querySelectorAll('.emp-btn').forEach(b => b.style.opacity = '1');
    }
  } catch (err) {
    showStatus('Unexpected error. Please try again.', 'error');
    document.querySelectorAll('.emp-btn').forEach(b => b.style.opacity = '1');
  }
}

// ── UI Helpers ─────────────────────────────────
function showStatus(msg, type = 'info') {
  statusMsg.textContent = msg;
  statusMsg.className = `status-msg ${type}`;
  statusMsg.classList.remove('hidden');
}

function clearStatus() {
  statusMsg.classList.add('hidden');
  statusMsg.textContent = '';
}

function setLoading(btn, loading, label) {
  btn.disabled = loading;
  btn.textContent = label;
}
