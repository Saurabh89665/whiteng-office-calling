'use strict';
/**
 * Whiteng Software — Office Calling System
 * Electron Desktop Wrapper
 * Loads the server URL from config.json — works on any network.
 */

const { app, BrowserWindow, Menu, Tray, shell, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');
const https = require('https');

// ── Load config ─────────────────────────────────
function loadConfig() {
  const locations = [
    path.join(process.resourcesPath || '', 'config.json'),
    path.join(__dirname, 'config.json'),
  ];
  for (const loc of locations) {
    try {
      if (fs.existsSync(loc)) return JSON.parse(fs.readFileSync(loc, 'utf8'));
    } catch {}
  }
  return { serverUrl: 'https://whiteng-office-calling.onrender.com' };
}

const config    = loadConfig();
const SERVER    = config.serverUrl || 'https://whiteng-office-calling.onrender.com';

let mainWindow  = null;
let tray        = null;
let isQuitting  = false;

// ── Wait for server ─────────────────────────────
function waitForServer(retries, cb) {
  const url = SERVER.replace(/\/$/, '') + '/health';
  const client = url.startsWith('https') ? https : http;
  try {
    client.get(url, (res) => {
      res.resume();
      if (res.statusCode === 200) { cb(true); return; }
      retry();
    }).on('error', (err) => {
      console.log('[Desktop] Health check error:', err.message);
      retry();
    });
  } catch (err) {
    console.log('[Desktop] Exception in health check:', err.message);
    retry();
  }

  function retry() {
    if (retries <= 0) { cb(true); return; } // Load URL anyway on timeout
    setTimeout(() => waitForServer(retries - 1, cb), 500);
  }
}

// ── Create main window ──────────────────────────
function createWindow(serverReady) {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');

  mainWindow = new BrowserWindow({
    width:  1200,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    title:  'Whiteng Software — Office Calling System',
    icon:   fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: '#f8fafc',
    autoHideMenuBar: true,
    show: false,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,   // required for Web Speech API + AudioContext
    },
  });

  Menu.setApplicationMenu(null);

  if (serverReady) {
    mainWindow.loadURL(SERVER);
  } else {
    // Show an offline error page
    mainWindow.loadURL(`data:text/html,
      <html style="background:#0a0a14;color:#f1f5f9;font-family:Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
      <div style="text-align:center">
        <div style="font-size:4rem;margin-bottom:16px">🔌</div>
        <h2 style="font-size:1.4rem;margin-bottom:8px">Cannot connect to server</h2>
        <p style="color:#64748b;margin-bottom:20px">Make sure the server is running at:<br>
           <code style="color:#818cf8">${SERVER}</code></p>
        <button onclick="location.reload()" style="padding:10px 24px;background:#6366f1;color:#fff;border:none;border-radius:8px;font-size:1rem;cursor:pointer">
          🔄 Retry Connection
        </button>
      </div></html>`);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Minimize to tray instead of closing
  mainWindow.on('close', (e) => {
    if (!isQuitting) { e.preventDefault(); mainWindow.hide(); }
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  // Open external links in real browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ── System tray ─────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  if (!fs.existsSync(iconPath)) return;
  try {
    tray = new Tray(iconPath);
    tray.setToolTip('Whiteng Software — Office Calling');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open App',     click: () => { mainWindow?.show(); mainWindow?.focus(); } },
      { label: 'Server: ' + SERVER, enabled: false },
      { type: 'separator' },
      { label: 'Quit',         click: () => { isQuitting = true; app.quit(); } },
    ]));
    tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
  } catch (e) { console.error('Tray error:', e.message); }
}

// ── App lifecycle ───────────────────────────────
app.whenReady().then(() => {
  console.log('[Desktop] Connecting to server:', SERVER);
  waitForServer(20, (ready) => {
    createWindow(ready);
    createTray();
  });
});

app.on('activate', () => { if (mainWindow) mainWindow.show(); else createWindow(true); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin' && !tray) app.quit(); });
app.on('before-quit', () => { isQuitting = true; });
