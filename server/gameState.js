// gameState.js — Authoritative Server-Side Game State
const { Vector3 } = require('three-math-ts') || createVec3Shim();

// Minimal Vec3 shim if three-math-ts not available
function createVec3Shim() {
  class Vector3 {
    constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
    distanceTo(o){const dx=this.x-o.x,dy=this.y-o.y,dz=this.z-o.z;return Math.sqrt(dx*dx+dy*dy+dz*dz);}
    clone(){return new Vector3(this.x,this.y,this.z);}
  }
  return {Vector3};
}

const ROUND_TIME    = 105; // seconds
const ROUNDS_TO_WIN = 16;
const RESPAWN_DELAY = 3000; // ms

const SPAWN_CT = [
  {x:0,y:1.7,z:-40}, {x:-5,y:1.7,z:-42}, {x:5,y:1.7,z:-42},
  {x:-10,y:1.7,z:-40}, {x:10,y:1.7,z:-40},
];
const SPAWN_T = [
  {x:0,y:1.7,z:40}, {x:-5,y:1.7,z:42}, {x:5,y:1.7,z:42},
  {x:-10,y:1.7,z:40}, {x:10,y:1.7,z:40},
];

// Weapon damage tables (must match client)
const WEAPONS = {
  ak47:   { damage: 36, headshotMult: 4, legMult: 0.75 },
  m4a1:   { damage: 29, headshotMult: 4, legMult: 0.75 },
  deagle: { damage: 63, headshotMult: 4, legMult: 0.75 },
};

// Map AABB walls for server-side raycast validation
const WALLS = [
  {min:{x:-24,y:0,z:-22},max:{x:-16,y:2.5,z:-18}},
  {min:{x:16,y:0,z:-22}, max:{x:24,y:2.5,z:-18}},
  {min:{x:-7,y:0,z:-9},  max:{x:-3,y:2.5,z:-1}},
  {min:{x:3,y:0,z:1},    max:{x:7,y:2.5,z:9}},
  {min:{x:-23,y:0,z:6},  max:{x:-17,y:2.5,z:14}},
  {min:{x:17,y:0,z:6},   max:{x:23,y:2.5,z:14}},
  {min:{x:-32,y:0,z:-6}, max:{x:-28,y:2.5,z:6}},
  {min:{x:28,y:0,z:-6},  max:{x:32,y:2.5,z:6}},
  {min:{x:-16,y:0,z:23}, max:{x:-4,y:2.5,z:27}},
  {min:{x:4,y:0,z:-27},  max:{x:16,y:2.5,z:-23}},
];

class GameState {
  constructor(roomCode, io) {
    this.roomCode = roomCode;
    this.io       = io;
    this.players  = new Map(); // socketId → PlayerData
    this.hostId   = null;
    this.started  = false;

    // Round state
    this.scores     = { CT: 0, T: 0 };
    this.roundNum   = 1;
    this.roundTimer = ROUND_TIME;
    this.roundActive = false;

    this._tickInterval  = null;
    this._stateInterval = null;
  }

  // ── LOBBY ──
  addPlayer(socketId, { username, team }) {
    this.players.set(socketId, {
      socketId, username, team,
      ready: false,
      alive: false,
      health: 100,
      armor: 100,
      kills: 0, deaths: 0, assists: 0,
      position: { x: 0, y: 1.7, z: 0 },
      yaw: 0, pitch: 0,
      crouching: false,
      spawnIndex: 0,
    });
    if (!this.hostId) this.hostId = socketId;
  }

  removePlayer(socketId) { this.players.delete(socketId); }
  hasPlayer(socketId)    { return this.players.has(socketId); }
  playerCount()          { return this.players.size; }
  isHost(socketId)       { return this.hostId === socketId; }
  setHost(socketId)      { this.hostId = socketId; }

  getFirstPlayer() {
    for (const [id] of this.players) return id;
    return null;
  }

  setPlayerTeam(socketId, team) {
    const p = this.players.get(socketId);
    if (p) p.team = team;
  }

  setPlayerReady(socketId, ready) {
    const p = this.players.get(socketId);
    if (p) p.ready = ready;
  }

  getLobbyPlayers() {
    const obj = {};
    for (const [id, p] of this.players) {
      obj[id] = { username: p.username, team: p.team, ready: p.ready };
    }
    return obj;
  }

  // ── GAME START ──
  startGame() {
    this.started = true;
    this._spawnAll();
    this._beginRound();

    // State broadcast at 20Hz
    this._stateInterval = setInterval(() => this._broadcastState(), 50);

    // Round tick at 1Hz
    this._tickInterval = setInterval(() => this._roundTick(), 1000);
  }

  _spawnAll() {
    let ctIdx = 0, tIdx = 0;
    for (const [id, p] of this.players) {
      const spawns = p.team === 'CT' ? SPAWN_CT : SPAWN_T;
      const idx    = p.team === 'CT' ? ctIdx++ : tIdx++;
      const pos    = spawns[idx % spawns.length];

      p.alive    = true;
      p.health   = 100;
      p.armor    = 100;
      p.position = { ...pos };

      this.io.to(id).emit('game:starting', { spawnPos: pos });
    }
    this.roundActive = true;
    this.roundTimer  = ROUND_TIME;
  }

  _beginRound() {
    this.roundActive = true;
    this.roundTimer  = ROUND_TIME;
  }

  _roundTick() {
    if (!this.roundActive) return;
    this.roundTimer--;

    // Check time out → CT win (defused scenario)
    if (this.roundTimer <= 0) {
      this._endRound('CT');
    }
  }

  _endRound(winner) {
    this.roundActive = false;
    this.scores[winner]++;
    this.io.to(this.roomCode).emit('game:roundEnd', {
      winner,
      scores: { ...this.scores },
    });

    // Check match winner
    if (this.scores[winner] >= ROUNDS_TO_WIN) {
      this.io.to(this.roomCode).emit('game:matchEnd', {
        winner,
        scores: { ...this.scores },
      });
      this._stopTimers();
      return;
    }

    // Next round after 5s
    setTimeout(() => {
      this.roundNum++;
      this._spawnAll();
    }, 5000);
  }

  _broadcastState() {
    const playersObj = {};
    for (const [id, p] of this.players) {
      playersObj[id] = {
        username:  p.username,
        team:      p.team,
        alive:     p.alive,
        health:    p.health,
        position:  p.position,
        yaw:       p.yaw,
        pitch:     p.pitch,
        crouching: p.crouching,
        kills:     p.kills,
        deaths:    p.deaths,
        assists:   p.assists,
      };
    }
    this.io.to(this.roomCode).emit('game:state', {
      players:    playersObj,
      scores:     this.scores,
      roundTimer: this.roundTimer,
      roundNum:   this.roundNum,
    });
  }

  // ── PLAYER UPDATES ──
  updatePlayerPosition(socketId, data) {
    const p = this.players.get(socketId);
    if (!p || !p.alive) return;

    // Clamp to map bounds
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    p.position = {
      x: clamp(data.x ?? p.position.x, -49, 49),
      y: clamp(data.y ?? p.position.y,  0,  10),
      z: clamp(data.z ?? p.position.z, -49, 49),
    };
    p.yaw       = data.yaw   ?? p.yaw;
    p.pitch     = data.pitch ?? p.pitch;
    p.crouching = !!data.crouching;
  }

  // ── HIT DETECTION ──
  processShot(shooterId, data, io, roomCode) {
    if (!this.roundActive) return;
    const shooter = this.players.get(shooterId);
    if (!shooter || !shooter.alive) return;

    const weaponDef = WEAPONS[data.weaponId];
    if (!weaponDef) return;

    // Validate origin is close to shooter's known position (anti-teleport)
    const reportedOrigin = data.origin;
    const knownPos = shooter.position;
    const distFromKnown = Math.hypot(
      reportedOrigin.x - knownPos.x,
      reportedOrigin.y - knownPos.y,
      reportedOrigin.z - knownPos.z
    );
    if (distFromKnown > 5) return; // Reject if too far off

    const origin = { x: data.origin.x, y: data.origin.y, z: data.origin.z };
    const dir    = normalize3(data.direction);
    if (!dir) return;

    // Cast ray against all enemy players
    let closestHit  = null;
    let closestDist = Infinity;

    for (const [targetId, target] of this.players) {
      if (targetId === shooterId) continue;
      if (!target.alive) continue;
      if (target.team === shooter.team) continue; // No friendly fire

      const hit = raycastPlayer(origin, dir, target);
      if (hit && hit.dist < closestDist) {
        closestDist = hit.dist;
        closestHit  = { targetId, target, hitzone: hit.zone };
      }
    }

    if (closestHit) {
      const { targetId, target, hitzone } = closestHit;
      const headshot = hitzone === 'head';

      let damage = weaponDef.damage;
      if (headshot)        damage *= weaponDef.headshotMult;
      if (hitzone === 'legs') damage *= weaponDef.legMult;
      damage = Math.round(damage);

      // Apply armor
      const armorAbsorb = Math.min(target.armor, damage * 0.5);
      target.armor  = Math.max(0, target.armor - armorAbsorb);
      target.health = Math.max(0, target.health - damage);

      // Emit hit to all clients
      const killfeedEntry = headshot || target.health <= 0 ? {
        killerName: shooter.username,
        victimName: target.username,
        weapon:     data.weaponId,
        headshot,
        killerTeam: shooter.team,
      } : null;

      io.to(roomCode).emit('player:hit', {
        shooterId,
        victimId: targetId,
        damage,
        hitzone,
        killfeedEntry,
      });

      // Bullet whiz — notify players near the shot line
      this._notifyBulletWhiz(shooterId, origin, dir, roomCode);

      // Death
      if (target.health <= 0) {
        this._handleKill(shooterId, targetId, data.weaponId, headshot, io, roomCode);
      }
    } else {
      // Missed shot — still notify whiz
      this._notifyBulletWhiz(shooterId, origin, dir, roomCode);
    }
  }

  _handleKill(killerId, victimId, weapon, headshot, io, roomCode) {
    const killer = this.players.get(killerId);
    const victim = this.players.get(victimId);
    if (!killer || !victim) return;

    killer.kills++;
    victim.deaths++;
    victim.alive  = false;
    victim.health = 0;

    io.to(roomCode).emit('player:died', {
      victimId,
      killerId,
      killerName: killer.username,
      weapon,
    });

    // Respawn after delay
    setTimeout(() => {
      if (!this.roundActive) return;
      victim.alive  = true;
      victim.health = 100;
      victim.armor  = 100;

      const spawns = victim.team === 'CT' ? SPAWN_CT : SPAWN_T;
      const pos    = spawns[Math.floor(Math.random() * spawns.length)];
      victim.position = { ...pos };

      io.to(victimId).emit('player:spawned', { playerId: victimId, position: pos });
    }, RESPAWN_DELAY);

    // Check round win condition (all enemies dead)
    this._checkRoundWin(io, roomCode);
  }

  _checkRoundWin(io, roomCode) {
    let ctAlive = 0, tAlive = 0;
    for (const [, p] of this.players) {
      if (!p.alive) continue;
      if (p.team === 'CT') ctAlive++;
      else tAlive++;
    }
    if (ctAlive === 0 && tAlive > 0)  this._endRound('T');
    if (tAlive  === 0 && ctAlive > 0) this._endRound('CT');
  }

  _notifyBulletWhiz(shooterId, origin, dir, roomCode) {
    for (const [id, p] of this.players) {
      if (id === shooterId) continue;
      if (!p.alive) continue;
      // Check if the ray passes within 1.5 units of this player
      const d = pointRayDist(p.position, origin, dir);
      if (d < 1.5) {
        this.io.to(id).emit('player:bulletWhiz', { direction: dir });
      }
    }
  }

  destroy() {
    this._stopTimers();
  }

  _stopTimers() {
    clearInterval(this._stateInterval);
    clearInterval(this._tickInterval);
  }
}

// ── Math helpers ──
function normalize3(v) {
  if (!v) return null;
  const len = Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z);
  if (len < 0.0001) return null;
  return { x: v.x/len, y: v.y/len, z: v.z/len };
}

function raycastPlayer(origin, dir, player) {
  const pos = player.position;
  const h   = player.crouching ? 1.1 : 1.7;

  // Head hitbox: sphere at (pos.x, pos.y + h - 0.2, pos.z), r=0.22
  const headY = pos.y + h - 0.2;
  const dHead = raySphereIntersect(origin, dir, { x: pos.x, y: headY, z: pos.z }, 0.22);
  if (dHead !== null) return { zone: 'head', dist: dHead };

  // Body AABB: ±0.3 x, [pos.y + 0.5 .. pos.y + h - 0.4] y, ±0.2 z
  const bodyMin = { x: pos.x - 0.3, y: pos.y + 0.5, z: pos.z - 0.2 };
  const bodyMax = { x: pos.x + 0.3, y: pos.y + h - 0.4, z: pos.z + 0.2 };
  const dBody = rayAABBIntersect(origin, dir, bodyMin, bodyMax);
  if (dBody !== null) return { zone: 'body', dist: dBody };

  // Legs AABB
  const legsMin = { x: pos.x - 0.3, y: pos.y,     z: pos.z - 0.2 };
  const legsMax = { x: pos.x + 0.3, y: pos.y + 0.5, z: pos.z + 0.2 };
  const dLegs = rayAABBIntersect(origin, dir, legsMin, legsMax);
  if (dLegs !== null) return { zone: 'legs', dist: dLegs };

  return null;
}

function raySphereIntersect(o, d, c, r) {
  const oc = { x: o.x-c.x, y: o.y-c.y, z: o.z-c.z };
  const b  = 2*(oc.x*d.x + oc.y*d.y + oc.z*d.z);
  const cv = oc.x*oc.x + oc.y*oc.y + oc.z*oc.z - r*r;
  const disc = b*b - 4*cv;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / 2;
  return t > 0 ? t : null;
}

function rayAABBIntersect(o, d, min, max) {
  const inv = { x: 1/d.x, y: 1/d.y, z: 1/d.z };
  const t1 = (min.x - o.x) * inv.x, t2 = (max.x - o.x) * inv.x;
  const t3 = (min.y - o.y) * inv.y, t4 = (max.y - o.y) * inv.y;
  const t5 = (min.z - o.z) * inv.z, t6 = (max.z - o.z) * inv.z;
  const tMin = Math.max(Math.max(Math.min(t1,t2), Math.min(t3,t4)), Math.min(t5,t6));
  const tMax = Math.min(Math.min(Math.max(t1,t2), Math.max(t3,t4)), Math.max(t5,t6));
  if (tMax < 0 || tMin > tMax) return null;
  return tMin > 0 ? tMin : tMax;
}

function pointRayDist(point, origin, dir) {
  const op  = { x: point.x-origin.x, y: point.y-origin.y, z: point.z-origin.z };
  const dot = op.x*dir.x + op.y*dir.y + op.z*dir.z;
  if (dot < 0) return Infinity;
  const proj = { x: origin.x + dir.x*dot, y: origin.y + dir.y*dot, z: origin.z + dir.z*dot };
  return Math.sqrt((point.x-proj.x)**2 + (point.y-proj.y)**2 + (point.z-proj.z)**2);
}

module.exports = GameState;
