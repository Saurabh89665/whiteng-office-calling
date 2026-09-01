"""
Whiteng Software — Office Calling System
Python Backend: FastAPI + python-socketio
Sir = Super Admin (add/remove employees, set passwords, call employees)
"""

import os, json, hashlib, secrets, uuid
from pathlib import Path
from datetime import datetime
import socketio, uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv

load_dotenv()

PORT               = int(os.getenv("PORT", 8000))
SIR_PASSWORD       = os.getenv("SIR_PASSWORD", "admin123")
ALLOWED_OFFICE_IPS = os.getenv("ALLOWED_OFFICE_IPS", "").strip()  # Comma-separated list of company Wi-Fi public IPs
BASE_DIR           = Path(__file__).parent

def get_client_ip(environ) -> str:
    """Extract client IP address handling proxies (X-Forwarded-For)."""
    if "HTTP_X_FORWARDED_FOR" in environ:
        return environ["HTTP_X_FORWARDED_FOR"].split(",")[0].strip()
    if "asgi.scope" in environ:
        client = environ["asgi.scope"].get("client")
        if client:
            return client[0]
    return ""

def is_ip_allowed(client_ip: str) -> bool:
    """Check if the client IP is allowed. Returns True if ALLOWED_OFFICE_IPS is empty (disabled) or matches."""
    if not ALLOWED_OFFICE_IPS:
        return True
    allowed_list = [ip.strip() for ip in ALLOWED_OFFICE_IPS.split(",") if ip.strip()]
    return client_ip in allowed_list

# ── Employee data (load from JSON, save on changes) ─
EMP_FILE = BASE_DIR / "employees.json"

def load_employees() -> list[dict]:
    if EMP_FILE.exists():
        return json.loads(EMP_FILE.read_text(encoding="utf-8"))
    return []

def save_employees(data: list[dict]):
    EMP_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

employees: list[dict] = load_employees()
print(f"[Server] Loaded {len(employees)} employees")

# ── Password hashing ────────────────────────────────
def hash_pw(password: str) -> str:
    return hashlib.sha256(password.strip().encode()).hexdigest()

# ── Socket.IO ───────────────────────────────────────
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    ping_timeout=30,
    ping_interval=10,
    logger=False,
    engineio_logger=False,
)

app = FastAPI(title="Whiteng Software — Office Calling System", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── In-memory state ─────────────────────────────────
sessions: dict         = {}   # token -> {role, name, sid}
online_employees: dict = {}   # employee_id -> {id, name, sid}
sir_sids: set          = set()

# ── Helpers ─────────────────────────────────────────
def new_token() -> str:
    return secrets.token_hex(32)

def employee_status():
    return [
        {"id": e["id"], "name": e["name"], "online": e["id"] in online_employees}
        for e in employees
    ]

def employees_full_list():
    """For management panel — excludes passwordHash."""
    return [{"id": e["id"], "name": e["name"]} for e in employees]

async def broadcast_sir(event, data):
    for sid in list(sir_sids):
        await sio.emit(event, data, to=sid)

def log(msg: str):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def is_sir(token: str) -> bool:
    s = sessions.get(token)
    return bool(s and s.get("role") == "sir")

# ── REST endpoints ──────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/api/status")
def status():
    return {
        "app": "Whiteng Software — Office Calling System",
        "version": "2.0.0",
        "employees": len(employees),
        "onlineEmployees": len(online_employees),
        "sirOnline": len(sir_sids) > 0,
    }

@app.get("/api/employees")
def get_employees():
    """Public — returns name list for login dropdown (no passwords)."""
    return [{"id": e["id"], "name": e["name"]} for e in employees]

# ═══════════════════════════════════════════════════
# Socket.IO Events
# ═══════════════════════════════════════════════════

@sio.event
async def connect(sid, environ):
    log(f"Connected: {sid}")

@sio.event
async def disconnect(sid):
    log(f"Disconnected: {sid}")
    sir_sids.discard(sid)
    sess = await sio.get_session(sid)
    if sess and sess.get("role") == "employee":
        eid = sess.get("employeeId")
        if eid and online_employees.get(eid, {}).get("sid") == sid:
            ename = sess.get("employeeName", "?")
            online_employees.pop(eid, None)
            log(f"{ename} went offline")
            await broadcast_sir("employees_status", employee_status())

# ── Sir login ────────────────────────────────────────
@sio.event
async def sir_login(sid, data):
    if data.get("password") != SIR_PASSWORD:
        return {"success": False, "error": "Invalid password. Please try again."}
    t = new_token()
    sessions[t] = {"role": "sir", "name": "Sir", "sid": sid}
    await sio.save_session(sid, {"token": t, "role": "sir"})
    sir_sids.add(sid)
    log(f"Sir (Admin) logged in")
    await sio.emit("employees_status", employee_status(), to=sid)
    await sio.emit("employees_list",   employees_full_list(), to=sid)
    return {"success": True, "token": t}

@sio.event
async def sir_reconnect(sid, data):
    t    = data.get("token")
    sess = sessions.get(t)
    if not sess or sess["role"] != "sir":
        return {"success": False, "error": "Session expired."}
    sessions[t]["sid"] = sid
    await sio.save_session(sid, {"token": t, "role": "sir"})
    sir_sids.add(sid)
    log(f"Sir reconnected")
    await sio.emit("employees_status", employee_status(), to=sid)
    await sio.emit("employees_list",   employees_full_list(), to=sid)
    return {"success": True}

# ── Employee CRUD (Sir only) ─────────────────────────
@sio.event
async def add_employee(sid, data):
    token    = data.get("token")
    name     = (data.get("name") or "").strip()
    password = (data.get("password") or "").strip()

    if not is_sir(token):
        return {"success": False, "error": "Unauthorized."}
    if not name:
        return {"success": False, "error": "Employee name is required."}
    if not password or len(password) < 4:
        return {"success": False, "error": "Password must be at least 4 characters."}
    if any(e["name"].lower() == name.lower() for e in employees):
        return {"success": False, "error": f"Employee '{name}' already exists."}

    # Generate unique ID
    emp_id = f"EMP{str(len(employees) + 1).zfill(3)}"
    while any(e["id"] == emp_id for e in employees):
        emp_id = f"EMP{secrets.randbelow(9000) + 1000}"

    new_emp = {"id": emp_id, "name": name, "passwordHash": hash_pw(password)}
    employees.append(new_emp)
    save_employees(employees)

    log(f"Sir added employee: {name} ({emp_id})")

    # Notify Sir
    await sio.emit("employees_status", employee_status(), to=sid)
    await sio.emit("employees_list",   employees_full_list(), to=sid)
    return {"success": True, "employee": {"id": emp_id, "name": name}}

@sio.event
async def remove_employee(sid, data):
    token  = data.get("token")
    emp_id = data.get("employeeId")

    if not is_sir(token):
        return {"success": False, "error": "Unauthorized."}
    if not emp_id:
        return {"success": False, "error": "Employee ID required."}

    emp = next((e for e in employees if e["id"] == emp_id), None)
    if not emp:
        return {"success": False, "error": "Employee not found."}

    employees.remove(emp)
    save_employees(employees)

    # Kick them offline if connected
    if emp_id in online_employees:
        kick_sid = online_employees[emp_id]["sid"]
        online_employees.pop(emp_id, None)
        await sio.emit("kicked", {"reason": "Your account was removed by admin."}, to=kick_sid)

    log(f"Sir removed employee: {emp['name']}")
    await broadcast_sir("employees_status", employee_status())
    await broadcast_sir("employees_list",   employees_full_list())
    return {"success": True}

@sio.event
async def update_employee_password(sid, data):
    token    = data.get("token")
    emp_id   = data.get("employeeId")
    password = (data.get("password") or "").strip()

    if not is_sir(token):
        return {"success": False, "error": "Unauthorized."}
    if not password or len(password) < 4:
        return {"success": False, "error": "Password must be at least 4 characters."}

    emp = next((e for e in employees if e["id"] == emp_id), None)
    if not emp:
        return {"success": False, "error": "Employee not found."}

    emp["passwordHash"] = hash_pw(password)
    save_employees(employees)
    log(f"Sir updated password for: {emp['name']}")
    return {"success": True}

# ── Employee login (with password) ──────────────────
@sio.event
async def employee_login(sid, data):
    environ = sio.environ.get(sid, {})
    client_ip = get_client_ip(environ)
    if not is_ip_allowed(client_ip):
        log(f"Employee login BLOCKED for IP {client_ip} (not on company Wi-Fi)")
        return {"success": False, "error": "Login restricted! You must be connected to company Wi-Fi."}

    emp_id   = data.get("employeeId")
    emp_name = data.get("employeeName")
    password = (data.get("password") or "").strip()

    emp = next((e for e in employees if e["id"] == emp_id and e["name"] == emp_name), None)
    if not emp:
        return {"success": False, "error": "Employee not found."}
    if emp.get("passwordHash") and emp["passwordHash"] != hash_pw(password):
        return {"success": False, "error": "Incorrect password."}

    t = new_token()
    sessions[t] = {"role": "employee", "name": emp_name, "id": emp_id, "sid": sid}
    await sio.save_session(sid, {"token": t, "role": "employee", "employeeId": emp_id, "employeeName": emp_name})
    online_employees[emp_id] = {"id": emp_id, "name": emp_name, "sid": sid}
    log(f"Employee logged in: {emp_name} (from IP {client_ip})")
    await broadcast_sir("employees_status", employee_status())
    return {"success": True, "token": t}

@sio.event
async def employee_reconnect(sid, data):
    emp_id   = data.get("employeeId")
    emp_name = data.get("employeeName")
    emp = next((e for e in employees if e["id"] == emp_id and e["name"] == emp_name), None)
    if not emp:
        return {"success": False}
    t = data.get("token") or new_token()
    sessions[t] = {"role": "employee", "name": emp_name, "id": emp_id, "sid": sid}
    await sio.save_session(sid, {"token": t, "role": "employee", "employeeId": emp_id, "employeeName": emp_name})
    online_employees[emp_id] = {"id": emp_id, "name": emp_name, "sid": sid}
    log(f"Employee reconnected: {emp_name}")
    await broadcast_sir("employees_status", employee_status())
    return {"success": True, "token": t}

# ── Sir calls employee ───────────────────────────────
@sio.event
async def call_employee(sid, data):
    token  = data.get("token")
    emp_id = data.get("employeeId")
    ename  = data.get("employeeName")
    if not is_sir(token):
        return {"success": False, "error": "Unauthorized."}
    emp = online_employees.get(emp_id)
    if not emp:
        return {"success": False, "error": f"{ename} is currently offline."}
    call_id = str(uuid.uuid4())
    log(f"Sir calling {ename}")
    await sio.emit("incoming_call", {
        "callId": call_id, "callerName": "Sir",
        "employeeName": ename, "employeeId": emp_id,
        "timestamp": datetime.utcnow().isoformat(),
        "isBroadcast": False,
    }, to=emp["sid"])
    return {"success": True, "callId": call_id, "message": f"Calling {ename}..."}

# ── Sir calls ALL employees (Everyone Come To Cabin) ─
@sio.event
async def call_all_employees(sid, data):
    token = data.get("token")
    if not is_sir(token):
        return {"success": False, "error": "Unauthorized."}
    if not online_employees:
        return {"success": False, "error": "No employees are currently online."}

    call_id = str(uuid.uuid4())
    count = len(online_employees)
    log(f"Sir calling ALL employees ({count} online)")

    for emp_id, emp in list(online_employees.items()):
        await sio.emit("incoming_call", {
            "callId": call_id,
            "callerName": "Sir",
            "employeeName": emp["name"],
            "employeeId": emp_id,
            "timestamp": datetime.utcnow().isoformat(),
            "isBroadcast": True,
            "messageText": "📢 Sir is calling EVERYONE to the cabin!"
        }, to=emp["sid"])

    return {"success": True, "callId": call_id, "count": count, "message": f"Calling all {count} online employees!"}

# ── Employee acknowledges ────────────────────────────
@sio.event
async def acknowledge_call(sid, data):
    sess = await sio.get_session(sid)
    if not sess or sess.get("role") != "employee":
        return
    call_id = data.get("callId")
    ename   = sess.get("employeeName", "?")
    log(f"{ename} acknowledged call {call_id}")
    await broadcast_sir("call_acknowledged", {
        "callId": call_id, "employeeName": ename,
        "timestamp": datetime.utcnow().isoformat(),
        "message": f"{ename} received the notification.",
    })

# ── Serve React build ────────────────────────────────
frontend_dist = BASE_DIR / "frontend_dist"
if not frontend_dist.exists():
    frontend_dist = BASE_DIR / "dist"
if not frontend_dist.exists():
    frontend_dist = BASE_DIR.parent / "frontend" / "dist"

log(f"[Server] Looking for frontend build in: {frontend_dist} (exists: {frontend_dist.exists()})")

if frontend_dist.exists():
    if (frontend_dist / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets")
    @app.get("/")
    def serve_index():
        return FileResponse(str(frontend_dist / "index.html"))
    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        if any(full_path.startswith(p) for p in ["api/", "health", "socket.io"]):
            from fastapi import HTTPException
            raise HTTPException(404)
        return FileResponse(str(frontend_dist / "index.html"))

# ── Run ──────────────────────────────────────────────
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

if __name__ == "__main__":
    print("-" * 50)
    print("  Whiteng Software - Office Calling System")
    print(f"  Backend: http://localhost:{PORT}")
    print(f"  Employees: {len(employees)} loaded")
    print("-" * 50)
    uvicorn.run(socket_app, host="0.0.0.0", port=PORT, log_level="warning")
