// server.js — DUST_WEB Game Server
const { createServer } = require('http');
const { Server }       = require('socket.io');
const GameState        = require('./gameState');

const PORT = process.env.PORT || 3000;

const httpServer = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('DUST_WEB Game Server\n');
});

const io = new Server(httpServer, {
  cors: {
    origin: '*',       // Allow GitHub Pages domain — tighten in production
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
});

// Rooms: roomCode → GameState instance
const rooms = new Map();

// ── Utility ──
function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getRoomForPlayer(socketId) {
  for (const [code, gs] of rooms.entries()) {
    if (gs.hasPlayer(socketId)) return { code, gs };
  }
  return null;
}

// ── Rate limiting per socket ──
const shootCounts = new Map(); // socketId → { count, resetAt }

function rateLimitShoot(socketId, maxPerSec = 10) {
  const now = Date.now();
  let entry = shootCounts.get(socketId) || { count: 0, resetAt: now + 1000 };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 1000; }
  entry.count++;
  shootCounts.set(socketId, entry);
  return entry.count <= maxPerSec;
}

// ──────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ── LOBBY ──
  socket.on('player:join', ({ username, team, action, roomCode }) => {
    username = String(username).slice(0, 16) || 'Player';
    team = team === 'T' ? 'T' : 'CT';

    if (action === 'create') {
      let code;
      do { code = generateCode(); } while (rooms.has(code));

      const gs = new GameState(code, io);
      gs.addPlayer(socket.id, { username, team });
      rooms.set(code, gs);
      socket.join(code);
      socket.data.roomCode = code;
      socket.data.isHost   = true;

      socket.emit('room:created', { roomCode: code, players: gs.getLobbyPlayers() });
      console.log(`[Room] Created: ${code} by ${username}`);

    } else if (action === 'join') {
      const code = String(roomCode).toUpperCase().slice(0, 6);
      const gs   = rooms.get(code);

      if (!gs) return socket.emit('room:error', { message: 'Room not found.' });
      if (gs.started)    return socket.emit('room:error', { message: 'Game already in progress.' });
      if (gs.playerCount() >= 10) return socket.emit('room:error', { message: 'Room is full (max 10).' });

      gs.addPlayer(socket.id, { username, team });
      socket.join(code);
      socket.data.roomCode = code;

      socket.emit('room:joined', {
        roomCode: code,
        players: gs.getLobbyPlayers(),
        isHost: gs.isHost(socket.id),
      });
      io.to(code).emit('lobby:update', { players: gs.getLobbyPlayers() });
      console.log(`[Room] ${username} joined ${code}`);
    }
  });

  socket.on('player:team', ({ team }) => {
    const r = getRoomForPlayer(socket.id);
    if (!r) return;
    r.gs.setPlayerTeam(socket.id, team === 'T' ? 'T' : 'CT');
    io.to(r.code).emit('lobby:update', { players: r.gs.getLobbyPlayers() });
  });

  socket.on('player:ready', ({ ready }) => {
    const r = getRoomForPlayer(socket.id);
    if (!r) return;
    r.gs.setPlayerReady(socket.id, !!ready);
    io.to(r.code).emit('lobby:update', { players: r.gs.getLobbyPlayers() });
  });

  socket.on('game:start', () => {
    const r = getRoomForPlayer(socket.id);
    if (!r || !r.gs.isHost(socket.id)) return;
    if (r.gs.playerCount() < 2) return;
    r.gs.startGame(io, r.code);
  });

  // ── IN-GAME ──
  socket.on('player:move', (data) => {
    const r = getRoomForPlayer(socket.id);
    if (!r || !r.gs.started) return;
    r.gs.updatePlayerPosition(socket.id, data);
  });

  socket.on('player:shoot', (data) => {
    if (!rateLimitShoot(socket.id)) return;
    const r = getRoomForPlayer(socket.id);
    if (!r || !r.gs.started) return;
    r.gs.processShot(socket.id, data, io, r.code);
  });

  socket.on('player:reload', ({ weaponId }) => {
    const r = getRoomForPlayer(socket.id);
    if (!r || !r.gs.started) return;
    // Server just acknowledges — ammo is tracked client-side with server validation
  });

  // ── DISCONNECT ──
  socket.on('disconnect', () => {
    console.log(`[-] Disconnected: ${socket.id}`);
    shootCounts.delete(socket.id);

    const r = getRoomForPlayer(socket.id);
    if (!r) return;

    r.gs.removePlayer(socket.id);
    io.to(r.code).emit('lobby:update', { players: r.gs.getLobbyPlayers() });

    // If host left, assign new host
    if (socket.data.isHost) {
      const newHost = r.gs.getFirstPlayer();
      if (newHost) {
        r.gs.setHost(newHost);
        io.to(newHost).emit('lobby:hostChanged');
      }
    }

    // Clean up empty rooms
    if (r.gs.playerCount() === 0) {
      r.gs.destroy();
      rooms.delete(r.code);
      console.log(`[Room] Destroyed: ${r.code}`);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`DUST_WEB server running on port ${PORT}`);
});
