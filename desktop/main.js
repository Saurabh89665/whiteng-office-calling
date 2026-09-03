'use strict';
/**
 * Whiteng Software — Office Calling System
 * Electron Desktop Wrapper with Office Wi-Fi Verification
 */

const { app, BrowserWindow, Menu, Tray, shell, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');
const https = require('https');
const { execSync } = require('child_process');

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
  return {
    serverUrl: 'https://whiteng-office-calling.onrender.com',
    allowedWifi: ['whiteng', 'whiteng2']
  };
}

const config      = loadConfig();
const SERVER      = config.serverUrl || 'https://whiteng-office-calling.onrender.com';
const ALLOWED_WIFI = config.allowedWifi || ['whiteng', 'whiteng2'];

let mainWindow   = null;
let tray         = null;
let isQuitting   = false;
let wifiCheckTimer = null;

// ── Check Current Connected Wi-Fi Name (SSID) ───
function getConnectedWifiSSID() {
  try {
    if (process.platform === 'win32') {
      const output = execSync('netsh wlan show interfaces', { encoding: 'utf8', timeout: 4000 });
      const match = output.match(/^\s*SSID\s*:\s*(.+)$/m);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  } catch (err) {
    console.log('[Desktop] Wi-Fi check info:', err.message);
  }
  return null;
}

function checkWifiAccess() {
  if (!ALLOWED_WIFI || ALLOWED_WIFI.length === 0) return { allowed: true, ssid: null };
  const currentSSID = getConnectedWifiSSID();
  
  // If no Wi-Fi interface detected (e.g. Ethernet cable), allow access
  if (!currentSSID) return { allowed: true, ssid: 'LAN/Ethernet' };

  const isMatched = ALLOWED_WIFI.some(
    w => w.toLowerCase() === currentSSID.toLowerCase()
  );
  return { allowed: isMatched, ssid: currentSSID };
}

// ── Wait for server ─────────────────────────────
function waitForServer(retries, cb) {
  const url = SERVER.replace(/\/$/, '') + '/health';
  try {
    https.get(url, (res) => {
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
    if (retries <= 0) { cb(true); return; }
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
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
  });

  Menu.setApplicationMenu(null);

  loadAppContent(serverReady);

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

  // Background monitor: periodically verify Wi-Fi connection
  startWifiMonitor();
}

function loadAppContent(serverReady) {
  if (!mainWindow) return;

  const wifiStatus = checkWifiAccess();

  if (!wifiStatus.allowed) {
    // Show Office Wi-Fi restriction screen
    mainWindow.loadURL(`data:text/html,
      <html style="background:#ffffff;color:#0f172a;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
      <div style="text-align:center;max-width:480px;padding:36px;border:1.5px solid #e2e8f0;border-radius:20px;box-shadow:0 10px 30px rgba(0,0,0,0.06)">
        <div style="font-size:3.5rem;margin-bottom:12px">📶</div>
        <h2 style="font-size:1.35rem;font-weight:800;color:#0f172a;margin-bottom:8px">Please Connect to Office Wi-Fi</h2>
        <p style="color:#475569;font-size:0.95rem;line-height:1.5;margin-bottom:16px">
          Currently connected to: <b style="color:#dc2626">${wifiStatus.ssid || 'Unknown Wi-Fi'}</b><br/>
          To receive calls from Sir, please connect to company Wi-Fi:
        </p>
        <div style="display:inline-block;padding:8px 18px;background:#f1f5f9;border-radius:99px;font-weight:700;color:#2563eb;font-size:0.9rem;margin-bottom:24px">
          🔒 ${ALLOWED_WIFI.join(' &nbsp;•&nbsp; ')}
        </div>
        <br/>
        <button onclick="location.reload()" style="padding:11px 24px;background:#2563eb;color:#fff;border:none;border-radius:10px;font-size:0.95rem;font-weight:700;cursor:pointer">
          🔄 Retry Wi-Fi Connection
        </button>
      </div></html>`);
    return;
  }

  if (serverReady) {
    mainWindow.loadURL(SERVER);
  } else {
    mainWindow.loadURL(`data:text/html,
      <html style="background:#ffffff;color:#0f172a;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
      <div style="text-align:center;padding:40px">
        <div style="font-size:3.5rem;margin-bottom:16px">🔌</div>
        <h2 style="font-size:1.4rem;font-weight:800;margin-bottom:8px">Connecting to server…</h2>
        <p style="color:#64748b;margin-bottom:20px">Please check your internet connection.</p>
        <button onclick="location.reload()" style="padding:10px 24px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:1rem;font-weight:700;cursor:pointer">
          🔄 Retry
        </button>
      </div></html>`);
  }
}

function startWifiMonitor() {
  if (wifiCheckTimer) clearInterval(wifiCheckTimer);
  wifiCheckTimer = setInterval(() => {
    if (!mainWindow) return;
    const wifiStatus = checkWifiAccess();
    const currentUrl = mainWindow.webContents.getURL();
    const isRestrictedPage = currentUrl.startsWith('data:text/html');

    if (!wifiStatus.allowed && !isRestrictedPage) {
      loadAppContent(true);
    } else if (wifiStatus.allowed && isRestrictedPage) {
      mainWindow.loadURL(SERVER);
    }
  }, 10000);
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
      { label: 'Office Wi-Fi: ' + ALLOWED_WIFI.join(', '), enabled: false },
      { type: 'separator' },
      { label: 'Quit',         click: () => { isQuitting = true; app.quit(); } },
    ]));
    tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
  } catch (e) { console.error('Tray error:', e.message); }
}

// ── App lifecycle ───────────────────────────────
app.whenReady().then(() => {
  console.log('[Desktop] Connecting to server:', SERVER);

  try {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: false
    });
  } catch (err) {
    console.log('[Desktop] Could not set auto-start:', err.message);
  }

  waitForServer(20, (ready) => {
    createWindow(ready);
    createTray();
  });
});

app.on('activate', () => { if (mainWindow) mainWindow.show(); else createWindow(true); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin' && !tray) app.quit(); });
app.on('before-quit', () => { isQuitting = true; });
