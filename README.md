# Office Sir Calling System

A Windows desktop application (Electron) that allows **Sir** to see which employees are online and call them with a real-time desktop notification, sound, and text-to-speech — over the internet via a cloud-hosted Node.js + Socket.IO server.

---

## Project Structure

```
office-calling-system/
│
├── server/                   ← Cloud server (Node.js + Socket.IO)
│   ├── server.js
│   ├── employees.json        ← Edit this to add/remove employees
│   ├── package.json
│   ├── .env.example
│   └── .env                  ← Create this from .env.example
│
├── desktop/                  ← Electron desktop app
│   ├── main.js               ← Main process
│   ├── preload.js            ← IPC bridge
│   ├── config.json           ← Set SERVER_URL here
│   ├── package.json
│   ├── assets/
│   │   └── icon.png
│   └── renderer/
│       ├── login.html
│       ├── sir-dashboard.html
│       ├── employee-dashboard.html
│       ├── css/styles.css
│       └── js/
│           ├── login.js
│           ├── sir-dashboard.js
│           └── employee-dashboard.js
│
└── README.md
```

---

## Quick Start (Local Development)

### Step 1 — Start the Server

```bash
cd server
npm install
copy .env.example .env       # Windows
# Edit .env and set your password
npm start
```

Server runs at `http://localhost:3000`.

### Step 2 — Start the Desktop App

```bash
cd desktop
npm install
npm start
```

The Electron window will open.

---

## Credentials

| Role     | Login        |
|----------|--------------|
| Sir      | Password: `office123` (set in server `.env` → `SIR_PASSWORD`) |
| Employee | Select your name from the list |

---

## Add/Remove Employees

Edit **`server/employees.json`**:

```json
[
  { "id": "EMP001", "name": "Saurabh" },
  { "id": "EMP002", "name": "Rahul" },
  { "id": "EMP007", "name": "NewEmployee" }
]
```

Restart the server after editing. No other code changes needed.

---

## Change Sir's Password

Edit **`server/.env`**:

```
SIR_PASSWORD=your_new_password_here
```

Restart the server.

---

## Build Windows .exe Installer

> ⚠️ Requires electron-builder and the correct icon format.

### Option A — PNG icon (quickest)

The `desktop/package.json` is pre-configured. Just run:

```bash
cd desktop
npm install
npm run build
```

The installer appears at:
```
desktop/dist/Office Sir Calling System Setup 1.0.0.exe
```

### Option B — Convert to ICO first (recommended for production)

1. Install `png-to-ico` or use any online PNG→ICO converter.
2. Place `icon.ico` at `desktop/assets/icon.ico`.
3. Run `npm run build`.

---

## Cloud Deployment (Cross-Network / Internet)

### Deploy Server to Railway.app (Free)

1. Go to [railway.app](https://railway.app) and create a new project.
2. Click **"Deploy from GitHub"** — push your `server/` folder to a GitHub repo first.
3. Or use the **Railway CLI**:
   ```bash
   npm install -g @railway/cli
   railway login
   cd server
   railway init
   railway up
   ```
4. In Railway dashboard → **Variables**, add:
   ```
   PORT=3000
   SIR_PASSWORD=your_secure_password
   SESSION_SECRET=a_very_long_random_string
   ```
5. Railway gives you a public URL like `https://your-app.up.railway.app`.

### Deploy Server to Render.com (Free)

1. Push `server/` to GitHub.
2. Create new **Web Service** on [render.com](https://render.com).
3. Set Build Command: `npm install`
4. Set Start Command: `node server.js`
5. Add environment variables in Render dashboard.
6. Render gives you a URL like `https://your-app.onrender.com`.

### Configure Desktop App with Cloud URL

After deploying, edit **`desktop/config.json`**:

```json
{
  "serverUrl": "https://your-app.up.railway.app",
  "appName": "Office Sir Calling System",
  "version": "1.0.0"
}
```

Then rebuild the .exe:
```bash
cd desktop
npm run build
```

Distribute the new `dist/Office Sir Calling System Setup 1.0.0.exe` to all laptops.

---

## Install on Laptops

1. Copy the `.exe` to the target laptop.
2. Double-click → follow the NSIS installer wizard.
3. After install, the app appears in:
   - **Desktop shortcut**: "Office Sir Calling System"
   - **Start Menu**: "Office Sir Calling System"
4. Launch the app → Login.

> No need to install Node.js or any other software on employee laptops.

---

## Testing Procedure

### Local Test (same machine)

1. `cd server && npm start`
2. Open another terminal: `cd desktop && npm start`
3. Login as Sir (password: `office123`)
4. Open a second Electron window — run again or on another terminal
5. Login as Saurabh
6. Sir sees 🟢 Saurabh
7. Sir clicks Saurabh → notification appears + sound + TTS

### Cross-Network Test (production-like)

1. Deploy server to Railway/Render
2. Update `desktop/config.json` with the cloud URL
3. Run app on **Sir's laptop** (any network) → Login as Sir
4. Run app on **Employee laptop** (different network/hotspot) → Login as employee
5. Sir calls employee → employee receives notification instantly

---

## Environment Variables Reference

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `SIR_PASSWORD` | `office123` | Sir's login password |
| `SESSION_SECRET` | *(change this!)* | Token signing secret |
| `CORS_ORIGIN` | `*` | Allowed CORS origins |

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "Cannot connect to server" | Make sure server is running and `config.json` has the correct URL |
| TTS not working | PowerShell and System.Speech should be available on all Windows 10/11 machines |
| Notification not appearing | Check Windows notification settings → make sure "Office Sir Calling System" is allowed |
| Employee list not loading | Server must be running before the desktop app is opened |
| .exe build fails on icon | Use PNG icon or convert to 256x256 ICO first |

---

## Architecture Overview

```
                    INTERNET
                        │
                        ▼
              ┌─────────────────────┐
              │   Cloud Server       │
              │  Node.js + Express   │  ← server/server.js
              │  Socket.IO v4        │
              │  employees.json      │
              └──────────┬──────────┘
                         │  WebSocket (WSS in prod)
           ┌─────────────┴─────────────┐
           │                           │
           ▼                           ▼
  Sir's Electron App          Employee Electron App
  (Sir Dashboard)             (Employee Dashboard)
  Any network                 Any network
```

---

## Security Notes

- Sir password is stored only in server `.env` — never in client code.
- Each login generates a random session token used for all subsequent events.
- Server validates the token on every sensitive event (`call_employee`, etc.).
- Use HTTPS/WSS in production (Railway and Render provide this automatically).
- No employee passwords are stored — they log in by selecting their name only.

---

*Built with Electron, Node.js, Socket.IO — designed for Windows internal office use.*
