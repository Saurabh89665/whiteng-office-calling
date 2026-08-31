import { io } from 'socket.io-client'

// In dev: Vite proxies /socket.io → Python backend
// In prod: Python serves both app + socket.io from same origin
const URL = import.meta.env.PROD ? window.location.origin : ''

const socket = io(URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 8000,
  transports: ['websocket', 'polling'],
})

export default socket
