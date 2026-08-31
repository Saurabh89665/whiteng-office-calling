'use strict';

/**
 * Office Sir Calling System - Cloud Server
 * Node.js + Express + Socket.IO
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

// ──────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const SIR_PASSWORD = process.env.SIR_PASSWORD || 'office123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'default_secret_changeme';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// ──────────────────────────────────────────────
// Load employee list
// ──────────────────────────────────────────────
const employeesPath = path.join(__dirname, 'employees.json');
let employees = [];
try {
  employees = JSON.parse(fs.readFileSync(employeesPath, 'utf-8'));
  console.log(`[Server] Loaded ${employees.length} employees from employees.json`);
} catch (err) {
  console.error('[Server] ERROR: Could not load employees.json:', err.message);
  process.exit(1);
}

// ──────────────────────────────────────────────
// Express + Socket.IO setup
// ──────────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST']
  },
  pingTimeout: 30000,
  pingInterval: 10000
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ──────────────────────────────────────────────
// In-memory state
// ──────────────────────────────────────────────
// sessions: token -> { role, name, id (for employees), socketId }
const sessions = new Map();

// onlineEmployees: employeeId -> { id, name, socketId }
const onlineEmployees = new Map();

// sirSocketIds: Set of socket IDs that belong to Sir
const sirSocketIds = new Set();

// ──────────────────────────────────────────────
// Helper functions
// ──────────────────────────────────────────────
function generateToken() {
  return crypto.createHmac('sha256', SESSION_SECRET)
    .update(crypto.randomBytes(32))
    .digest('hex');
}

function buildEmployeeStatus() {
  return employees.map(emp => ({
    id: emp.id,
    name: emp.name,
    online: onlineEmployees.has(emp.id)
  }));
}

function broadcastToSir(event, data) {
  for (const socketId of sirSocketIds) {
    io.to(socketId).emit(event, data);
  }
}

function log(msg) {
  console.log(`[${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}] ${msg}`);
}

// ──────────────────────────────────────────────
// HTTP Endpoints
// ──────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    app: 'Office Sir Calling System',
    version: '1.0.0',
    employees: employees.length,
    onlineEmployees: onlineEmployees.size,
    sirOnline: sirSocketIds.size > 0
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Public endpoint: fetch employee list (no auth needed for login UI)
app.get('/employees', (req, res) => {
  res.json(employees.map(e => ({ id: e.id, name: e.name })));
});

// ──────────────────────────────────────────────
// Socket.IO Connection Handler
// ──────────────────────────────────────────────
io.on('connection', (socket) => {
  log(`New connection: ${socket.id} (from ${socket.handshake.address})`);

  // ── Sir Reconnect (after page navigation) ──
  socket.on('sir_reconnect', ({ token }, callback) => {
    if (typeof callback !== 'function') return;
    const session = sessions.get(token);
    if (!session || session.role !== 'sir') {
      return callback({ success: false, error: 'Session expired. Please login again.' });
    }
    // Update socket reference
    sessions.set(token, { ...session, socketId: socket.id });
    socket.data.token = token;
    socket.data.role = 'sir';
    sirSocketIds.add(socket.id);
    log(`Sir reconnected: ${socket.id}`);
    callback({ success: true });
    socket.emit('employees_status', buildEmployeeStatus());
  });

  // ── Employee Reconnect (after page navigation) ──
  socket.on('employee_reconnect', ({ token, employeeId, employeeName }, callback) => {
    if (typeof callback !== 'function') return;
    const employee = employees.find(e => e.id === employeeId && e.name === employeeName);
    if (!employee) return callback({ success: false });
    // Re-register as online
    const newToken = token || generateToken();
    socket.data.token = newToken;
    socket.data.role = 'employee';
    socket.data.employeeId = employeeId;
    socket.data.employeeName = employeeName;
    sessions.set(newToken, { role: 'employee', name: employeeName, id: employeeId, socketId: socket.id });
    onlineEmployees.set(employeeId, { id: employeeId, name: employeeName, socketId: socket.id, token: newToken });
    log(`Employee reconnected: ${employeeName}`);
    callback({ success: true, token: newToken });
    broadcastToSir('employees_status', buildEmployeeStatus());
  });

  // ── Sir Login ──────────────────────────────
  socket.on('sir_login', ({ password }, callback) => {
    if (typeof callback !== 'function') return;

    if (!password || password !== SIR_PASSWORD) {
      log(`Sir login FAILED from ${socket.id} — wrong password`);
      return callback({ success: false, error: 'Invalid password. Please try again.' });
    }

    // Clean up any previous session for this socket
    if (socket.data.token) {
      sessions.delete(socket.data.token);
    }

    const token = generateToken();
    socket.data.token = token;
    socket.data.role = 'sir';

    sessions.set(token, {
      role: 'sir',
      name: 'Sir',
      socketId: socket.id
    });

    sirSocketIds.add(socket.id);
    log(`Sir logged in: ${socket.id}`);

    callback({
      success: true,
      token,
      message: 'Welcome, Sir!'
    });

    // Send current employee status to the newly logged-in Sir
    socket.emit('employees_status', buildEmployeeStatus());
  });

  // ── Employee Login ─────────────────────────
  socket.on('employee_login', ({ employeeId, employeeName }, callback) => {
    if (typeof callback !== 'function') return;

    // Validate employee exists in employees.json
    const employee = employees.find(
      e => e.id === employeeId && e.name === employeeName
    );

    if (!employee) {
      log(`Employee login FAILED: ${employeeName} (${employeeId}) not found`);
      return callback({ success: false, error: 'Employee not found. Please contact admin.' });
    }

    // If this employee is already online (reconnect scenario), update their socket
    if (onlineEmployees.has(employeeId)) {
      const existing = onlineEmployees.get(employeeId);
      sessions.delete(existing.token);
    }

    // Clean up any previous session for this socket
    if (socket.data.token) {
      sessions.delete(socket.data.token);
    }

    const token = generateToken();
    socket.data.token = token;
    socket.data.role = 'employee';
    socket.data.employeeId = employeeId;
    socket.data.employeeName = employeeName;

    sessions.set(token, {
      role: 'employee',
      name: employeeName,
      id: employeeId,
      socketId: socket.id
    });

    onlineEmployees.set(employeeId, {
      id: employeeId,
      name: employeeName,
      socketId: socket.id,
      token
    });

    log(`Employee logged in: ${employeeName} (${employeeId})`);

    callback({ success: true, token, message: `Welcome, ${employeeName}!` });

    // Notify all Sir dashboards of updated status
    broadcastToSir('employees_status', buildEmployeeStatus());
  });

  // ── Sir Calls Employee ─────────────────────
  socket.on('call_employee', ({ token, employeeId, employeeName }, callback) => {
    // Validate Sir's session
    const session = sessions.get(token);
    if (!session || session.role !== 'sir') {
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Unauthorized. Please login again.' });
      }
      return;
    }

    // Check if employee is online
    const employeeSocket = onlineEmployees.get(employeeId);
    if (!employeeSocket) {
      log(`Sir tried to call ${employeeName} but they are OFFLINE`);
      if (typeof callback === 'function') {
        callback({ success: false, error: `${employeeName} is currently offline.` });
      }
      return;
    }

    // Generate call ID
    const callId = crypto.randomUUID
      ? crypto.randomUUID()
      : `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const timestamp = new Date().toISOString();
    log(`Sir is calling ${employeeName} (callId: ${callId})`);

    // Send incoming_call event to the specific employee
    io.to(employeeSocket.socketId).emit('incoming_call', {
      callId,
      callerName: 'Sir',
      employeeName,
      employeeId,
      timestamp
    });

    if (typeof callback === 'function') {
      callback({
        success: true,
        callId,
        message: `Calling ${employeeName}...`
      });
    }
  });

  // ── Employee Acknowledges Call ─────────────
  socket.on('acknowledge_call', ({ callId, employeeName }) => {
    // Use socket.data.role set at login time — no separate token needed for ack
    if (socket.data.role !== 'employee') return;

    const timestamp = new Date().toISOString();
    log(`${socket.data.employeeName || employeeName} acknowledged call ${callId}`);

    // Notify all Sir dashboards
    broadcastToSir('call_acknowledged', {
      callId,
      employeeName: socket.data.employeeName || employeeName,
      timestamp,
      message: `${socket.data.employeeName || employeeName} received the notification.`
    });
  });

  // ── Disconnect ─────────────────────────────
  socket.on('disconnect', (reason) => {
    log(`Disconnected: ${socket.id} (reason: ${reason})`);

    // Remove from Sir set if applicable
    sirSocketIds.delete(socket.id);

    // Remove from online employees if applicable
    if (socket.data.role === 'employee' && socket.data.employeeId) {
      const emp = onlineEmployees.get(socket.data.employeeId);
      // Only remove if this is the SAME socket (not a reconnected one)
      if (emp && emp.socketId === socket.id) {
        onlineEmployees.delete(socket.data.employeeId);
        log(`${socket.data.employeeName} went offline`);
        broadcastToSir('employees_status', buildEmployeeStatus());
      }
    }

    // Clean up session
    if (socket.data.token) {
      sessions.delete(socket.data.token);
    }
  });

  // ── Error handler ──────────────────────────
  socket.on('error', (err) => {
    log(`Socket error on ${socket.id}: ${err.message}`);
  });
});

// ──────────────────────────────────────────────
// Start Server
// ──────────────────────────────────────────────
server.listen(PORT, () => {
  log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  log(`  Office Sir Calling System - Server`);
  log(`  Running on port ${PORT}`);
  log(`  Health: http://localhost:${PORT}/health`);
  log(`  Employees: ${employees.length} loaded`);
  log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    log('Server closed.');
    process.exit(0);
  });
});

process.on('uncaughtException', (err) => {
  log(`UNCAUGHT EXCEPTION: ${err.message}`);
  console.error(err.stack);
});
