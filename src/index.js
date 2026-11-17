const express = require('express');
const http = require('http');
const cors = require('cors');
const { WebSocketServer, WebSocket } = require('ws');
const Room = require('./room');
const MAP = require('./map');

const app = express();
app.use(cors());
app.use(express.json());

// Active game rooms map: roomCode -> Room
const rooms = {};

// Client connection mapping: ws -> { socketId, roomCode }
const clientSessions = new Map();

// Helper: generate 4-character uppercase alphanumeric room code
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid 0/O and 1/I ambiguity
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms[code] ? generateRoomCode() : code;
}

// -------------------------------------------------------------
// HTTP REST & Health Check Endpoints (Render deployment ready)
// -------------------------------------------------------------
app.get('/', (req, res) => {
  const totalHumans = Object.values(rooms).reduce((sum, r) => {
    return sum + Object.values(r.players).filter(p => !p.isBot).length;
  }, 0);
  const totalBots = Object.values(rooms).reduce((sum, r) => {
    return sum + Object.values(r.players).filter(p => p.isBot).length;
  }, 0);

  res.json({
    status: 'ok',
    game: 'Doodle Army 2D Native Multiplayer Server',
    engine: 'C++17 Raylib / Raymob + Node.js ws',
    roomsCount: Object.keys(rooms).length,
    humanPlayers: totalHumans,
    botPlayers: totalBots,
    uptime: Math.floor(process.uptime()),
    timestamp: Date.now(),
  });
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// List public rooms
app.get('/api/rooms', (req, res) => {
  const list = Object.entries(rooms).map(([code, room]) => ({
    roomCode: code,
    playerCount: Object.values(room.players).filter(p => !p.isBot).length,
    botCount: Object.values(room.players).filter(p => p.isBot).length,
    createdAt: room.createdAt,
    duration: Math.floor((Date.now() - room.createdAt) / 1000),
  }));
  res.json({ rooms: list });
});

// -------------------------------------------------------------
// WebSocket Server Setup
// -------------------------------------------------------------
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// 30-second ping/pong heartbeat interval for Render load balancers
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log('[Heartbeat Timeout] Terminating inactive WebSocket client');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

wss.on('error', (err) => {
  if (err.code === 'EADDRINUSE') return;
  console.warn('[WSS Error]:', err.message);
});

let nextClientId = 1001;

// Helper: send typed JSON message to a client
function sendJson(ws, type, payload = {}) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  const clientId = `p_${nextClientId++}_${Math.random().toString(36).substring(2, 6)}`;
  clientSessions.set(ws, { socketId: clientId, roomCode: null });

  console.log(`[WS Connected] Client ${clientId} from ${req.socket.remoteAddress}`);

  // Send initial welcome
  sendJson(ws, 'welcome', {
    clientId,
    serverTime: Date.now(),
  });

  // Handle client messages
  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (e) {
      console.warn(`[Invalid JSON from ${clientId}]:`, data.toString().substring(0, 50));
      return;
    }

    const { type, payload = {} } = msg;
    const session = clientSessions.get(ws);
    if (!session) return;

    switch (type) {
      // 1. CREATE ROOM
      case 'create_room': {
        const roomCode = generateRoomCode();
        const botCount = typeof payload.botCount === 'number' ? payload.botCount : 0;
        const room = new Room(roomCode, { botCount });
        rooms[roomCode] = room;

        session.roomCode = roomCode;
        const player = room.addPlayer(clientId, payload.name, payload.avatarStyle, ws);

        console.log(`[Room Created] ${roomCode} by ${player.name} (${clientId}) with ${botCount} bots`);

        sendJson(ws, 'room_created', {
          roomCode,
          playerId: clientId,
          isHost: true,
          player,
          map: room.map,
        });

        // Broadcast initial state
        room.broadcastState();
        break;
      }

      // 2. JOIN ROOM
      case 'join_room': {
        const code = (payload.roomCode || '').toUpperCase().trim();
        const room = rooms[code];

        if (!room) {
          sendJson(ws, 'error', { message: `Room "${code}" not found` });
          return;
        }

        const humanCount = Object.values(room.players).filter(p => !p.isBot).length;
        if (humanCount >= 8) {
          sendJson(ws, 'error', { message: `Room "${code}" is full (max 8 players)` });
          return;
        }

        session.roomCode = code;
        const player = room.addPlayer(clientId, payload.name, payload.avatarStyle, ws);

        console.log(`[Player Joined] ${player.name} (${clientId}) joined ${code}`);

        sendJson(ws, 'room_joined', {
          roomCode: code,
          playerId: clientId,
          isHost: false,
          player,
          map: room.map,
        });

        room.broadcastState();
        break;
      }

      // 3. QUICK PLAY
      case 'quick_play': {
        let targetCode = null;
        for (const [code, r] of Object.entries(rooms)) {
          const humans = Object.values(r.players).filter(p => !p.isBot).length;
          if (humans < 6) {
            targetCode = code;
            break;
          }
        }

        if (!targetCode) {
          targetCode = generateRoomCode();
          rooms[targetCode] = new Room(targetCode, { botCount: 2 });
        }

        const room = rooms[targetCode];
        session.roomCode = targetCode;
        const isHost = Object.values(room.players).filter(p => !p.isBot).length === 0;
        const player = room.addPlayer(clientId, payload.name, payload.avatarStyle, ws);

        sendJson(ws, isHost ? 'room_created' : 'room_joined', {
          roomCode: targetCode,
          playerId: clientId,
          isHost,
          player,
          map: room.map,
        });

        room.broadcastState();
        break;
      }

      // 4. MOVEMENT & AIM INPUTS
      case 'input': {
        const room = rooms[session.roomCode];
        if (room) {
          room.handleInput(clientId, payload);
        }
        break;
      }

      // 5. SHOOT WEAPON
      case 'shoot': {
        const room = rooms[session.roomCode];
        if (room) {
          room.handleShoot(clientId, payload.aimAngle);
        }
        break;
      }

      // 6. THROW GRENADE
      case 'grenade': {
        const room = rooms[session.roomCode];
        if (room) {
          room.handleGrenade(clientId, payload.aimAngle);
        }
        break;
      }

      // 7. RELOAD WEAPON
      case 'reload': {
        const room = rooms[session.roomCode];
        if (room) {
          room.handleReload(clientId);
        }
        break;
      }

      // 8. ADD BOT
      case 'add_bot': {
        const room = rooms[session.roomCode];
        if (room) {
          const currentCount = Object.keys(room.players).length;
          if (currentCount < 10) {
            const botNum = Object.keys(room.bots).length + 1;
            room.addBot(`BOT_${botNum}`);
            room.broadcastState();
          }
        }
        break;
      }

      // 9. REMOVE BOT
      case 'remove_bot': {
        const room = rooms[session.roomCode];
        if (room) {
          if (room.removeBot()) {
            room.broadcastState();
          }
        }
        break;
      }

      // 10. HEARTBEAT / PING
      case 'ping': {
        sendJson(ws, 'pong', {
          timestamp: payload.timestamp || Date.now(),
        });
        break;
      }

      // 11. LEAVE ROOM
      case 'leave': {
        handleClientLeave(ws, session);
        break;
      }

      default:
        console.warn(`[Unknown WS message type]: ${type}`);
    }
  });

  // Client socket error handler
  ws.on('error', (err) => {
    if (['EPIPE', 'ECONNRESET', 'ECONNABORTED'].includes(err.code)) return;
    console.warn(`[WS Client Error ${clientId}]:`, err.message);
  });

  // Client disconnect
  ws.on('close', () => {
    const session = clientSessions.get(ws);
    if (session) {
      console.log(`[WS Disconnected] Client ${session.socketId}`);
      handleClientLeave(ws, session);
      clientSessions.delete(ws);
    }
  });
});

// Helper: clean up player when leaving or disconnecting
function handleClientLeave(ws, session) {
  const { socketId, roomCode } = session;
  if (!roomCode || !rooms[roomCode]) return;

  const room = rooms[roomCode];
  room.removePlayer(socketId);
  session.roomCode = null;

  // Clean empty rooms after 10s if no humans remain
  const remainingHumans = Object.values(room.players).filter(p => !p.isBot).length;
  if (remainingHumans === 0) {
    setTimeout(() => {
      if (rooms[roomCode]) {
        const checkHumans = Object.values(rooms[roomCode].players).filter(p => !p.isBot).length;
        if (checkHumans === 0) {
          rooms[roomCode].stop();
          delete rooms[roomCode];
          console.log(`[Room Cleaned] Deleted empty room ${roomCode}`);
        }
      }
    }, 10000);
  }
}

// -------------------------------------------------------------
// Start Server
// -------------------------------------------------------------
const PORT = process.env.PORT || 4000;

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`⚠️ Port ${PORT} is in use. Retrying in 1.5s...`);
    setTimeout(() => {
      server.close();
      server.listen(PORT, '0.0.0.0');
    }, 1500);
  } else {
    console.error('Server error:', err);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🚀 Doodle Army 2D Native Server (ws + Express)`);
  console.log(`📡 Port: ${PORT} (0.0.0.0) - Ready for Render & C++ client`);
  console.log(`🎮 Protocol: JSON { type, payload } over standard WebSocket`);
  console.log(`=======================================================`);
});
