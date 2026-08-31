'use strict';

/**
 * Office Sir Calling System - Preload Script
 * Securely bridges the renderer (UI) and the Electron main process via IPC.
 * contextIsolation: true — no direct access to Node.js from renderer.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose a clean, typed API to the renderer under window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', {

  // ── Config ───────────────────────────────
  /** Returns { serverUrl, appName, version } */
  getConfig: () => ipcRenderer.invoke('get-config'),

  // ── Navigation ───────────────────────────
  /** Navigate to a page: 'login' | 'sir-dashboard' | 'employee-dashboard' */
  navigate: (page) => ipcRenderer.invoke('navigate', page),

  // ── Authentication ───────────────────────
  /** Login as Sir. Returns { success, token?, error? } */
  sirLogin: (password) => ipcRenderer.invoke('sir-login', { password }),

  /** Login as Employee. Returns { success, token?, error? } */
  employeeLogin: (employeeId, employeeName) =>
    ipcRenderer.invoke('employee-login', { employeeId, employeeName }),

  /** Fetch employee list from server (HTTP). Returns { success, employees?, error? } */
  fetchEmployees: () => ipcRenderer.invoke('fetch-employees'),

  // ── Sir Actions ──────────────────────────
  /** Call an employee. Returns { success, callId?, message?, error? } */
  callEmployee: (employeeId, employeeName) =>
    ipcRenderer.invoke('call-employee', { employeeId, employeeName }),

  // ── Employee Actions ─────────────────────
  /** Employee acknowledges the call. */
  acknowledgeCall: (callId, employeeName) =>
    ipcRenderer.invoke('acknowledge-call', { callId, employeeName }),

  // ── Utilities ────────────────────────────
  /** Speak text via Windows TTS (PowerShell). */
  speakText: (text) => ipcRenderer.invoke('speak-text', text),

  /** Get socket connection status. Returns { connected, serverUrl } */
  getConnectionStatus: () => ipcRenderer.invoke('get-connection-status'),

  /** Get current logged-in user. Returns { role, name, id } */
  getCurrentUser: () => ipcRenderer.invoke('get-current-user'),

  // ── Inbound Events (Server → Renderer) ───
  /**
   * Listen for the full employee status list.
   * data = [{ id, name, online }]
   */
  onEmployeesStatus: (callback) => {
    ipcRenderer.on('employees-status', (_event, data) => callback(data));
  },

  /**
   * Listen for an incoming call (Employee side).
   * data = { callId, callerName, employeeName, timestamp }
   */
  onIncomingCall: (callback) => {
    ipcRenderer.on('incoming-call', (_event, data) => callback(data));
  },

  /**
   * Listen for call acknowledgements (Sir side).
   * data = { callId, employeeName, timestamp, message }
   */
  onCallAcknowledged: (callback) => {
    ipcRenderer.on('call-acknowledged', (_event, data) => callback(data));
  },

  /** Server disconnected. */
  onServerDisconnected: (callback) => {
    ipcRenderer.on('server-disconnected', (_event, reason) => callback(reason));
  },

  /** Server reconnected. */
  onServerReconnected: (callback) => {
    ipcRenderer.on('server-reconnected', () => callback());
  },

  /** Server connection error. */
  onServerConnectError: (callback) => {
    ipcRenderer.on('server-connect-error', (_event, err) => callback(err));
  },

  // ── Cleanup ──────────────────────────────
  /** Remove all listeners for a given channel (call on page unload). */
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});
