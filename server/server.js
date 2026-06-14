// server.js — DUST_WEB Game Server (v3 - Render.com compatible)
const { createServer } = require('http');
const { Server }       = require('socket.io');
const GameState        = require('./gameState');

const PORT = process.env.PORT || 3000;

// HTTP server with proper CORS headers for all requests
const httpServer = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204); res.end(); return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', name: 'DUST_WEB Server', rooms: rooms.size }));
});

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: false,
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 20000,
  pingInterval: 10000,
});

const rooms = new Map();
const shootCounts = new Map();

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getRoomForPlayer(socketId) {
  for (const [code, gs] of rooms.entries())
    if (gs.hasPlayer(socketId)) return { code, gs };
  return null;
}

function rateLimitShoot(socketId, max=12) {
  const now = Date.now();
  let e = shootCounts.get(socketId) || { count:0, resetAt:now+1000 };
  if (now > e.resetAt) { e.count=0; e.resetAt=now+1000; }
  e.count++;
  shootCounts.set(socketId, e);
  return e.count <= max;
}

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} via ${socket.conn.transport.name}`);

  socket.on('player:join', ({ username, team, action, roomCode }) => {
    username = String(username || 'Player').slice(0, 16);
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
      console.log(`[Room] Created ${code} by ${username}`);

    } else if (action === 'join') {
      const code = String(roomCode || '').toUpperCase().slice(0, 6);
      const gs   = rooms.get(code);
      if (!gs)           return socket.emit('room:error', { message: 'Room not found.' });
      if (gs.started)    return socket.emit('room:error', { message: 'Game already started.' });
      if (gs.playerCount() >= 10) return socket.emit('room:error', { message: 'Room full (max 10).' });
      gs.addPlayer(socket.id, { username, team });
      socket.join(code);
      socket.data.roomCode = code;
      socket.emit('room:joined', { roomCode:code, players:gs.getLobbyPlayers(), isHost:gs.isHost(socket.id) });
      io.to(code).emit('lobby:update', { players: gs.getLobbyPlayers() });
      console.log(`[Room] ${username} joined ${code}`);
    }
  });

  socket.on('player:team',  ({ team })  => { const r=getRoomForPlayer(socket.id); if(!r) return; r.gs.setPlayerTeam(socket.id, team); io.to(r.code).emit('lobby:update', {players:r.gs.getLobbyPlayers()}); });
  socket.on('player:ready', ({ ready }) => { const r=getRoomForPlayer(socket.id); if(!r) return; r.gs.setPlayerReady(socket.id, !!ready); io.to(r.code).emit('lobby:update', {players:r.gs.getLobbyPlayers()}); });

  socket.on('game:start', () => {
    const r = getRoomForPlayer(socket.id);
    if (!r || !r.gs.isHost(socket.id)) return;
    if (r.gs.playerCount() < 1) return;
    console.log(`[Room] Starting ${r.code}`);
    r.gs.startGame();
  });

  socket.on('player:move',  (data) => { const r=getRoomForPlayer(socket.id); if(!r||!r.gs.started) return; r.gs.updatePlayerPosition(socket.id, data); });
  socket.on('player:shoot', (data) => { if(!rateLimitShoot(socket.id)) return; const r=getRoomForPlayer(socket.id); if(!r||!r.gs.started) return; r.gs.processShot(socket.id, data, io, r.code); });
  socket.on('player:buy',   ({ weaponId }) => { const r=getRoomForPlayer(socket.id); if(!r||!r.gs.started) return; r.gs.processBuy(socket.id, weaponId); });

  socket.on('disconnect', (reason) => {
    console.log(`[-] ${socket.id} (${reason})`);
    shootCounts.delete(socket.id);
    const r = getRoomForPlayer(socket.id);
    if (!r) return;
    const wasHost = socket.data.isHost;
    r.gs.removePlayer(socket.id);
    if (r.gs.playerCount() === 0) { r.gs.destroy(); rooms.delete(r.code); console.log(`[Room] Destroyed ${r.code}`); return; }
    io.to(r.code).emit('lobby:update', { players: r.gs.getLobbyPlayers() });
    if (wasHost) { const newHost = r.gs.getFirstPlayer(); if(newHost) { r.gs.setHost(newHost); io.to(newHost).emit('lobby:hostChanged'); } }
  });

  socket.on('error', (err) => console.error(`[Socket Error] ${socket.id}:`, err));
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`DUST_WEB server listening on 0.0.0.0:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => { console.log('SIGTERM received'); httpServer.close(); });
process.on('uncaughtException', (err) => console.error('[Uncaught]', err));
process.on('unhandledRejection', (err) => console.error('[Unhandled]', err));
