// gameState.js — Authoritative Server-Side Game State (Fixed)

function createVec3Shim() {
  class Vector3 {
    constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
    distanceTo(o){const dx=this.x-o.x,dy=this.y-o.y,dz=this.z-o.z;return Math.sqrt(dx*dx+dy*dy+dz*dz);}
    clone(){return new Vector3(this.x,this.y,this.z);}
  }
  return {Vector3};
}
const { Vector3 } = createVec3Shim();

const ROUND_TIME    = 105;
const ROUNDS_TO_WIN = 16;
const RESPAWN_DELAY = 3000;
const BUY_TIME      = 15;

const SPAWN_CT = [
  {x:0,y:1.7,z:-42},{x:-5,y:1.7,z:-44},{x:5,y:1.7,z:-44},
  {x:-10,y:1.7,z:-42},{x:10,y:1.7,z:-42},
];
const SPAWN_T = [
  {x:0,y:1.7,z:42},{x:-5,y:1.7,z:44},{x:5,y:1.7,z:44},
  {x:-10,y:1.7,z:42},{x:10,y:1.7,z:42},
];

const WEAPONS = {
  ak47:   { damage:36, headshotMult:4, legMult:0.75, price:2700 },
  m4a1:   { damage:29, headshotMult:4, legMult:0.75, price:3100 },
  deagle: { damage:63, headshotMult:4, legMult:0.75, price:700  },
  awp:    { damage:115,headshotMult:4, legMult:0.85, price:4750 },
  mp5:    { damage:20, headshotMult:4, legMult:0.75, price:1500 },
  glock:  { damage:18, headshotMult:4, legMult:0.75, price:0    },
};

class GameState {
  constructor(roomCode, io) {
    this.roomCode   = roomCode;
    this.io         = io;
    this.players    = new Map();
    this.hostId     = null;
    this.started    = false;
    this.scores     = { CT:0, T:0 };
    this.roundNum   = 1;
    this.roundTimer = ROUND_TIME;
    this.buyTimer   = BUY_TIME;
    this.inBuyPhase = false;
    this.roundActive= false;
    this._tickInterval  = null;
    this._stateInterval = null;
    this._respawnTimers = new Map();
  }

  addPlayer(socketId, { username, team }) {
    this.players.set(socketId, {
      socketId, username,
      team: team === 'T' ? 'T' : 'CT',
      ready:false, alive:false,
      health:100, armor:100,
      kills:0, deaths:0, assists:0,
      money: 800,
      weapon: team === 'T' ? 'glock' : 'glock',
      position:{x:0,y:1.7,z:0},
      yaw:0, pitch:0, crouching:false,
    });
    if (!this.hostId) this.hostId = socketId;
  }

  removePlayer(sid) {
    const t = this._respawnTimers.get(sid);
    if (t) clearTimeout(t);
    this._respawnTimers.delete(sid);
    this.players.delete(sid);
  }

  hasPlayer(sid)    { return this.players.has(sid); }
  playerCount()     { return this.players.size; }
  isHost(sid)       { return this.hostId === sid; }
  setHost(sid)      { this.hostId = sid; }
  getFirstPlayer()  { for(const [id] of this.players) return id; return null; }
  setPlayerTeam(sid,team){ const p=this.players.get(sid); if(p) p.team=team==='T'?'T':'CT'; }
  setPlayerReady(sid,r)  { const p=this.players.get(sid); if(p) p.ready=!!r; }

  getLobbyPlayers() {
    const obj={};
    for(const [id,p] of this.players)
      obj[id]={username:p.username,team:p.team,ready:p.ready};
    return obj;
  }

  startGame() {
    this.started = true;
    this._spawnAll();
    this._stateInterval = setInterval(()=>this._broadcastState(), 50);
    this._tickInterval  = setInterval(()=>this._roundTick(), 1000);
  }

  _spawnAll() {
    let ctIdx=0, tIdx=0;
    for(const [id,p] of this.players){
      const spawns = p.team==='CT' ? SPAWN_CT : SPAWN_T;
      const idx    = p.team==='CT' ? ctIdx++ : tIdx++;
      const pos    = spawns[idx % spawns.length];
      p.alive=true; p.health=100; p.armor=100;
      p.position={...pos};
      p.money = Math.min(p.money + (this.roundNum===1?800:1400), 16000);
      this.io.to(id).emit('game:starting',{ spawnPos:pos, money:p.money, buyTime:BUY_TIME });
    }
    this.roundActive=true;
    this.roundTimer=ROUND_TIME;
    this.inBuyPhase=true;
    this.buyTimer=BUY_TIME;
  }

  _roundTick() {
    if(!this.roundActive) return;
    if(this.inBuyPhase){
      this.buyTimer--;
      if(this.buyTimer<=0) this.inBuyPhase=false;
    }
    this.roundTimer--;
    if(this.roundTimer<=0) this._endRound('CT');
  }

  _endRound(winner) {
    if(!this.roundActive) return;
    this.roundActive=false;
    this.scores[winner]++;
    // Reward money
    for(const [,p] of this.players){
      const won = p.team===winner;
      p.money = Math.min(p.money + (won?3250:1400), 16000);
    }
    this.io.to(this.roomCode).emit('game:roundEnd',{ winner, scores:{...this.scores} });
    if(this.scores[winner]>=ROUNDS_TO_WIN){
      this.io.to(this.roomCode).emit('game:matchEnd',{ winner, scores:{...this.scores} });
      this._stopTimers(); return;
    }
    setTimeout(()=>{ this.roundNum++; this._spawnAll(); }, 6000);
  }

  _broadcastState() {
    const obj={};
    for(const [id,p] of this.players)
      obj[id]={
        username:p.username, team:p.team, alive:p.alive,
        health:p.health, position:p.position,
        yaw:p.yaw, pitch:p.pitch, crouching:p.crouching,
        kills:p.kills, deaths:p.deaths, assists:p.assists,
        weapon:p.weapon,
      };
    this.io.to(this.roomCode).emit('game:state',{
      players:obj, scores:this.scores,
      roundTimer:this.roundTimer, roundNum:this.roundNum,
      inBuyPhase:this.inBuyPhase, buyTimer:this.buyTimer,
    });
  }

  updatePlayerPosition(sid, data) {
    const p=this.players.get(sid);
    if(!p||!p.alive) return;
    const cl=(v,mn,mx)=>Math.max(mn,Math.min(mx,v));
    p.position={ x:cl(data.x??p.position.x,-49,49), y:cl(data.y??p.position.y,0,10), z:cl(data.z??p.position.z,-49,49) };
    p.yaw=data.yaw??p.yaw;
    p.pitch=data.pitch??p.pitch;
    p.crouching=!!data.crouching;
  }

  processBuy(sid, weaponId) {
    const p=this.players.get(sid);
    if(!p||!this.inBuyPhase) return;
    const w=WEAPONS[weaponId];
    if(!w) return;
    if(p.money<w.price) return;
    p.money-=w.price;
    p.weapon=weaponId;
    this.io.to(sid).emit('buy:success',{ weaponId, money:p.money });
  }

  processShot(shooterId, data, io, roomCode) {
    if(!this.roundActive||this.inBuyPhase) return;
    const shooter=this.players.get(shooterId);
    if(!shooter||!shooter.alive) return;
    const weaponDef=WEAPONS[data.weaponId]||WEAPONS['glock'];

    const origin=data.origin;
    const dir=normalize3(data.direction);
    if(!dir) return;

    // Validate origin proximity
    const dist=Math.hypot(origin.x-shooter.position.x, origin.y-shooter.position.y, origin.z-shooter.position.z);
    if(dist>6) return;

    let closestHit=null, closestDist=Infinity;
    for(const [targetId,target] of this.players){
      if(targetId===shooterId||!target.alive||target.team===shooter.team) continue;
      const hit=raycastPlayer(origin,dir,target);
      if(hit&&hit.dist<closestDist){ closestDist=hit.dist; closestHit={targetId,target,hitzone:hit.zone}; }
    }

    if(closestHit){
      const {targetId,target,hitzone}=closestHit;
      const headshot=hitzone==='head';
      let damage=weaponDef.damage;
      if(headshot) damage*=weaponDef.headshotMult;
      if(hitzone==='legs') damage*=weaponDef.legMult;
      damage=Math.round(damage);

      const armorAbsorb=Math.min(target.armor,damage*0.5);
      target.armor=Math.max(0,target.armor-armorAbsorb);
      target.health=Math.max(0,target.health-damage);

      const killfeedEntry=(headshot||target.health<=0)?{
        killerName:shooter.username, victimName:target.username,
        weapon:data.weaponId, headshot, killerTeam:shooter.team,
      }:null;

      io.to(roomCode).emit('player:hit',{ shooterId, victimId:targetId, damage, hitzone, killfeedEntry });
      this._notifyBulletWhiz(shooterId,origin,dir,roomCode);

      if(target.health<=0) this._handleKill(shooterId,targetId,data.weaponId,headshot,io,roomCode);
    } else {
      this._notifyBulletWhiz(shooterId,origin,dir,roomCode);
    }
  }

  _handleKill(killerId,victimId,weapon,headshot,io,roomCode){
    const killer=this.players.get(killerId);
    const victim=this.players.get(victimId);
    if(!killer||!victim) return;
    killer.kills++; victim.deaths++;
    victim.alive=false; victim.health=0;
    io.to(roomCode).emit('player:died',{ victimId, killerId, killerName:killer.username, weapon, headshot });

    // FIXED: Guaranteed respawn with proper error handling
    const timer=setTimeout(()=>{
      this._respawnTimers.delete(victimId);
      const v=this.players.get(victimId);
      if(!v||!this.roundActive) return;
      v.alive=true; v.health=100; v.armor=100;
      const spawns=v.team==='CT'?SPAWN_CT:SPAWN_T;
      const pos=spawns[Math.floor(Math.random()*spawns.length)];
      v.position={...pos};
      console.log(`[Respawn] ${v.username} at`,pos);
      io.to(victimId).emit('player:spawned',{ playerId:victimId, position:pos });
      io.to(roomCode).emit('player:respawned',{ playerId:victimId });
    }, RESPAWN_DELAY);
    this._respawnTimers.set(victimId, timer);

    this._checkRoundWin(io,roomCode);
  }

  _checkRoundWin(io,roomCode){
    if(!this.roundActive) return;
    let ctAlive=0, tAlive=0;
    for(const [,p] of this.players){
      if(!p.alive) continue;
      if(p.team==='CT') ctAlive++; else tAlive++;
    }
    if(ctAlive===0&&tAlive>0) this._endRound('T');
    else if(tAlive===0&&ctAlive>0) this._endRound('CT');
  }

  _notifyBulletWhiz(shooterId,origin,dir,roomCode){
    for(const [id,p] of this.players){
      if(id===shooterId||!p.alive) continue;
      const d=pointRayDist(p.position,origin,dir);
      if(d<2.0) this.io.to(id).emit('player:bulletWhiz',{direction:dir});
    }
  }

  destroy(){ this._stopTimers(); for(const t of this._respawnTimers.values()) clearTimeout(t); }
  _stopTimers(){ clearInterval(this._stateInterval); clearInterval(this._tickInterval); }
}

function normalize3(v){
  if(!v) return null;
  const len=Math.sqrt(v.x*v.x+v.y*v.y+v.z*v.z);
  if(len<0.0001) return null;
  return {x:v.x/len,y:v.y/len,z:v.z/len};
}

function raycastPlayer(origin,dir,player){
  const pos=player.position;
  const h=player.crouching?1.1:1.7;
  const headY=pos.y+h-0.22;
  const dHead=raySphereIntersect(origin,dir,{x:pos.x,y:headY,z:pos.z},0.24);
  if(dHead!==null) return {zone:'head',dist:dHead};
  const bodyMin={x:pos.x-0.32,y:pos.y+0.5,z:pos.z-0.22};
  const bodyMax={x:pos.x+0.32,y:pos.y+h-0.42,z:pos.z+0.22};
  const dBody=rayAABBIntersect(origin,dir,bodyMin,bodyMax);
  if(dBody!==null) return {zone:'body',dist:dBody};
  const legsMin={x:pos.x-0.28,y:pos.y,z:pos.z-0.18};
  const legsMax={x:pos.x+0.28,y:pos.y+0.5,z:pos.z+0.18};
  const dLegs=rayAABBIntersect(origin,dir,legsMin,legsMax);
  if(dLegs!==null) return {zone:'legs',dist:dLegs};
  return null;
}

function raySphereIntersect(o,d,c,r){
  const oc={x:o.x-c.x,y:o.y-c.y,z:o.z-c.z};
  const b=2*(oc.x*d.x+oc.y*d.y+oc.z*d.z);
  const cv=oc.x*oc.x+oc.y*oc.y+oc.z*oc.z-r*r;
  const disc=b*b-4*cv;
  if(disc<0) return null;
  const t=(-b-Math.sqrt(disc))/2;
  return t>0?t:null;
}

function rayAABBIntersect(o,d,min,max){
  const inv={x:1/d.x,y:1/d.y,z:1/d.z};
  const t1=(min.x-o.x)*inv.x,t2=(max.x-o.x)*inv.x;
  const t3=(min.y-o.y)*inv.y,t4=(max.y-o.y)*inv.y;
  const t5=(min.z-o.z)*inv.z,t6=(max.z-o.z)*inv.z;
  const tMin=Math.max(Math.max(Math.min(t1,t2),Math.min(t3,t4)),Math.min(t5,t6));
  const tMax=Math.min(Math.min(Math.max(t1,t2),Math.max(t3,t4)),Math.max(t5,t6));
  if(tMax<0||tMin>tMax) return null;
  return tMin>0?tMin:tMax;
}

function pointRayDist(point,origin,dir){
  const op={x:point.x-origin.x,y:point.y-origin.y,z:point.z-origin.z};
  const dot=op.x*dir.x+op.y*dir.y+op.z*dir.z;
  if(dot<0) return Infinity;
  const proj={x:origin.x+dir.x*dot,y:origin.y+dir.y*dot,z:origin.z+dir.z*dot};
  return Math.sqrt((point.x-proj.x)**2+(point.y-proj.y)**2+(point.z-proj.z)**2);
}

module.exports = GameState;
