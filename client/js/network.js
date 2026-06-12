// network.js — Socket.io Client & Event Handling
import { startGame, onDeath, onRespawn } from './main.js';

// ── Update this with your Render.com server URL ──
const SERVER_URL = 'https://your-server.onrender.com';

export class NetworkManager {
  constructor(state) {
    this.state  = state;
    this.socket = null;
    this._positionThrottle = 0;
    this._shootCount = 0;
    this._shootReset = 0;
  }

  connect(onReady) {
    // Load Socket.io from CDN if not already loaded
    if (typeof io === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
      script.onload = () => this._init(onReady);
      document.head.appendChild(script);
    } else {
      this._init(onReady);
    }
  }

  _init(onReady) {
    this.socket = io(SERVER_URL, {
      transports: ['websocket'],
      reconnectionAttempts: 5,
    });

    this.socket.on('connect', () => {
      console.log('[Network] Connected:', this.socket.id);
      this.state.myId = this.socket.id;
      if (onReady) onReady();
    });

    this.socket.on('connect_error', (err) => {
      console.error('[Network] Connection error:', err.message);
      // Fall back to local solo mode
      this._startSolo();
    });

    this._registerEvents();
  }

  _registerEvents() {
    const s = this.socket;
    const S = this.state;

    // ── LOBBY ──
    s.on('room:created', ({ roomCode, players }) => {
      S.roomCode = roomCode;
      document.getElementById('room-code-display').textContent = roomCode;
      document.getElementById('lobby-connecting').classList.add('hidden');
      document.getElementById('lobby-waiting').classList.remove('hidden');
      this._updateLobbyPlayers(players);
    });

    s.on('room:joined', ({ roomCode, players, isHost }) => {
      S.roomCode = roomCode;
      document.getElementById('room-code-display').textContent = roomCode;
      document.getElementById('lobby-connecting').classList.add('hidden');
      document.getElementById('lobby-waiting').classList.remove('hidden');
      if (isHost) document.getElementById('start-btn').classList.remove('hidden');
      this._updateLobbyPlayers(players);
    });

    s.on('room:error', ({ message }) => {
      alert('Room error: ' + message);
      document.getElementById('lobby-connecting').classList.add('hidden');
      document.getElementById('lobby-main').classList.remove('hidden');
    });

    s.on('lobby:update', ({ players }) => {
      this._updateLobbyPlayers(players);
    });

    s.on('lobby:hostChanged', () => {
      document.getElementById('start-btn').classList.remove('hidden');
    });

    // ── GAME START ──
    s.on('game:starting', ({ spawnPos }) => {
      startGame(spawnPos);
    });

    // ── GAME STATE (50ms tick) ──
    s.on('game:state', ({ players, scores, roundTimer, roundNum }) => {
      // Update remote players
      S.players = players;
      S.hud?.updateScores(scores.CT, scores.T);
      S.hud?.updateTimer(roundTimer);
      S.hud?.updateRoundNum(roundNum);

      // Update remote player meshes
      if (S.map) S.map.updateRemotePlayers(players, S.myId, S.team);
      S.hud?.updateScoreboard(players, S.myId);
      S.hud?.updateMinimap(players, S.myId);
    });

    // ── COMBAT ──
    s.on('player:hit', ({ shooterId, victimId, damage, hitzone, killfeedEntry }) => {
      if (victimId === S.myId) {
        // We got hit
        S.health = Math.max(0, S.health - damage);
        S.hud?.updateHealth(S.health);
        S.renderer?.shake(0.04 + damage * 0.001, 0.25);
        S.audio?.play('pain');
        this._showDamageFlash();
      }
      if (killfeedEntry) {
        S.hud?.addKillFeed(killfeedEntry);
      }
    });

    s.on('player:died', ({ victimId, killerId, killerName, weapon }) => {
      if (victimId === S.myId) {
        onDeath(killerId, killerName, weapon);
      }
      // Update scoreboard data
    });

    s.on('player:spawned', ({ playerId, position }) => {
      if (playerId === S.myId) {
        onRespawn(position);
      }
    });

    // ── ROUND EVENTS ──
    s.on('game:roundEnd', ({ winner, scores }) => {
      S.hud?.showRoundEnd(winner);
      setTimeout(() => S.hud?.hideRoundEnd(), 3000);
    });

    s.on('game:matchEnd', ({ winner, scores }) => {
      S.hud?.showMatchEnd(winner, scores);
    });

    // ── BULLET WHIZ ──
    s.on('player:bulletWhiz', ({ direction }) => {
      S.audio?.play('whiz', { volume: 0.4 });
    });

    // ── DISCONNECT ──
    s.on('disconnect', () => {
      console.warn('[Network] Disconnected from server');
    });
  }

  createRoom(username) {
    this.socket?.emit('player:join', {
      username,
      team: this.state.team,
      action: 'create',
    });
  }

  joinRoom(roomCode, username) {
    this.socket?.emit('player:join', {
      username,
      team: this.state.team,
      action: 'join',
      roomCode,
    });
  }

  emit(event, data) {
    if (!this.socket?.connected) return;

    // Client-side rate limiting for shoot
    if (event === 'player:shoot') {
      const now = Date.now();
      if (now - this._shootReset > 1000) {
        this._shootCount = 0;
        this._shootReset = now;
      }
      if (++this._shootCount > 12) return; // drop excess
    }

    this.socket.emit(event, data);
  }

  sendPosition() {
    if (!this.state.player || !this.state.alive) return;
    this._positionThrottle++;
    if (this._positionThrottle % 2 !== 0) return; // ~30Hz

    const ns = this.state.player.getNetworkState();
    this.emit('player:move', ns);
  }

  _updateLobbyPlayers(players) {
    const ctList = document.getElementById('team-ct');
    const tList  = document.getElementById('team-t');
    if (!ctList || !tList) return;

    ctList.innerHTML = '';
    tList.innerHTML  = '';

    for (const [id, p] of Object.entries(players)) {
      const div = document.createElement('div');
      div.className = 'team-player' + (p.ready ? ' ready' : '');
      div.innerHTML = `
        <span>${p.username}${id === this.socket?.id ? ' (you)' : ''}</span>
        <span class="player-status">${p.ready ? 'READY' : 'waiting'}</span>
      `;
      (p.team === 'CT' ? ctList : tList).appendChild(div);
    }

    // Ready check
    const allReady = Object.values(players).every(p => p.ready);
    const status   = document.getElementById('lobby-status');
    if (status) {
      const count = Object.keys(players).length;
      status.textContent = allReady && count >= 2
        ? `All ${count} players ready! Host can start.`
        : `${count} player(s) connected — waiting for ready...`;
    }
  }

  _showDamageFlash() {
    const el = document.getElementById('damage-flash');
    if (!el) return;
    el.classList.remove('hidden');
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => el.classList.add('hidden'), 150);
  }

  // Solo/offline fallback when server is unreachable
  _startSolo() {
    console.warn('[Network] Starting in solo/offline mode');
    document.getElementById('lobby').style.display = 'none';
    startGame({ x: 0, y: 1.7, z: 10 });
  }
}
