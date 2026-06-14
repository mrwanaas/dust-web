// main.js — v2: Game Entry Point
import { GameRenderer } from './renderer.js';
import { PlayerController } from './player.js';
import { WeaponSystem } from './weapons.js';
import { NetworkManager } from './network.js';
import { HUD } from './hud.js';
import { GameMap } from './map.js';
import { ParticleSystem } from './particles.js';
import { AudioEngine } from './audio.js';

export const State = {
  socket:null, roomCode:null, myId:null,
  username: localStorage.getItem('dw_username')||'Player',
  team:'CT',
  alive:true, health:100, armor:100,
  money:800,
  roundTimer:105, roundNum:1,
  scores:{CT:0,T:0},
  players:{},
  keys:{}, pointerLocked:false,
  mouseDX:0, mouseDY:0,
  yaw:0, pitch:0,
  sensitivity: parseFloat(localStorage.getItem('dw_sens')||'0.002'),
  fov: parseInt(localStorage.getItem('dw_fov')||'90'),
  renderer:null, player:null, weapons:null,
  network:null, hud:null, map:null,
  particles:null, audio:null,
  lastTime:0, frameId:null,
};

// ── LOBBY ──
window.lobbyCreateRoom=()=>{
  const name=document.getElementById('username-input').value.trim()||'Player';
  State.username=name; localStorage.setItem('dw_username',name);
  showPanel('lobby-connecting');
  State.network=new NetworkManager(State);
  State.network.connect(()=>State.network.createRoom(name));
};
window.lobbyShowJoin=()=>{
  const name=document.getElementById('username-input').value.trim()||'Player';
  State.username=name; localStorage.setItem('dw_username',name);
  showPanel('lobby-join');
};
window.lobbyJoinRoom=()=>{
  const code=document.getElementById('room-code-input').value.trim().toUpperCase();
  if(code.length!==6){alert('Enter a 6-character room code.');return;}
  showPanel('lobby-connecting');
  State.network=new NetworkManager(State);
  State.network.connect(()=>State.network.joinRoom(code,State.username));
};
window.lobbyBack=()=>showPanel('lobby-main');
window.lobbyCopyCode=()=>navigator.clipboard.writeText(State.roomCode||'');
window.lobbySwapTeam=()=>{
  State.team=State.team==='CT'?'T':'CT';
  State.network?.emit('player:team',{team:State.team});
};
let isReady=false;
window.lobbyToggleReady=()=>{
  isReady=!isReady;
  const btn=document.getElementById('ready-btn');
  btn.textContent=isReady?'NOT READY':'READY';
  btn.classList.toggle('active',isReady);
  State.network?.emit('player:ready',{ready:isReady});
};
window.lobbyStartGame=()=>State.network?.emit('game:start',{});
window.closeSettings=()=>{
  document.getElementById('settings').classList.add('hidden');
  document.body.requestPointerLock();
};

function showPanel(id){
  ['lobby-main','lobby-join','lobby-waiting','lobby-connecting'].forEach(p=>{
    document.getElementById(p)?.classList.add('hidden');
  });
  document.getElementById(id)?.classList.remove('hidden');
}

// ── GAME START ──
export async function startGame(spawnPos) {
  document.getElementById('lobby').style.display='none';
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('click-prompt').classList.remove('hidden');

  State.renderer  = new GameRenderer(document.getElementById('game-canvas'),State);
  State.map       = new GameMap(State.renderer.scene, State.renderer.renderer);
  State.particles = new ParticleSystem(State.renderer.scene);
  State.audio     = new AudioEngine(State.renderer.camera);
  State.hud       = new HUD(State);
  State.player    = new PlayerController(State, spawnPos||{x:0,y:1.7,z:0});
  State.weapons   = new WeaponSystem(State);

  // Wire up map colliders to player
  State.player.setColliders(State.map.getColliders());

  State.hud.init();
  State.weapons.init();
  State.audio.init();
  State.hud.updateMoney(State.money||800);

  setupPointerLock();
  setupInput();

  State.lastTime=performance.now();
  loop(State.lastTime);
}

// ── GAME LOOP ──
function loop(now) {
  State.frameId=requestAnimationFrame(loop);
  const dt=Math.min((now-State.lastTime)/1000,0.1);
  State.lastTime=now;

  if(State.alive){
    State.player.update(dt);
    State.weapons.update(dt);
  }
  State.particles.update(dt);
  State.hud.update(dt);
  State.audio?.updateListener?.();
  State.network?.sendPosition();
  State.renderer.render();
}

// ── POINTER LOCK ──
function setupPointerLock(){
  const canvas=document.getElementById('game-canvas');
  canvas.addEventListener('click',()=>{
    if(!document.getElementById('settings').classList.contains('hidden')) return;
    if(!document.getElementById('buy-menu')?.classList.contains('hidden')) return;
    document.body.requestPointerLock();
  });
  document.addEventListener('pointerlockchange',()=>{
    State.pointerLocked=document.pointerLockElement===document.body;
    const prompt=document.getElementById('click-prompt');
    if(State.pointerLocked){ prompt.classList.add('hidden'); }
    else {
      const inMenu=!document.getElementById('settings').classList.contains('hidden');
      const inBuy=!document.getElementById('buy-menu')?.classList.contains('hidden');
      if(!inMenu&&!inBuy) prompt.classList.remove('hidden');
    }
  });
  document.addEventListener('mousemove',(e)=>{
    if(!State.pointerLocked) return;
    State.mouseDX+=e.movementX;
    State.mouseDY+=e.movementY;
  });
}

// ── INPUT ──
function setupInput(){
  document.addEventListener('keydown',(e)=>{
    State.keys[e.code]=true;
    if(e.code==='Tab'){e.preventDefault();document.getElementById('scoreboard').classList.remove('hidden');}
    if(e.code==='Escape') toggleSettings();
    if(e.code==='KeyR') State.weapons?.startReload();
    if(e.code==='KeyB') State.hud?.toggleBuyMenu();
    if(e.code==='Digit1') State.weapons?.switchTo(0);
    if(e.code==='Digit2') State.weapons?.switchTo(1);
    if(e.code==='Digit3') State.weapons?.switchTo(2);
    if(e.code==='Digit4') State.weapons?.switchTo(3);
    if(e.code==='Digit5') State.weapons?.switchTo(4);
    if(e.code==='Digit6') State.weapons?.switchTo(5);
  });
  document.addEventListener('keyup',(e)=>{
    State.keys[e.code]=false;
    if(e.code==='Tab') document.getElementById('scoreboard').classList.add('hidden');
  });
  document.addEventListener('mousedown',(e)=>{
    if(!State.pointerLocked) return;
    if(e.button===0) State.weapons?.startFiring();
  });
  document.addEventListener('mouseup',(e)=>{
    if(e.button===0) State.weapons?.stopFiring();
  });
  document.addEventListener('wheel',(e)=>{
    if(!State.pointerLocked) return;
    State.weapons?.scrollSwitch(e.deltaY>0?1:-1);
  });

  // Settings sliders
  document.getElementById('sens-slider').addEventListener('input',(e)=>{
    State.sensitivity=parseFloat(e.target.value);
    document.getElementById('sens-val').textContent=State.sensitivity.toFixed(4);
    localStorage.setItem('dw_sens',State.sensitivity);
  });
  document.getElementById('fov-slider').addEventListener('input',(e)=>{
    State.fov=parseInt(e.target.value);
    document.getElementById('fov-val').textContent=State.fov+'°';
    localStorage.setItem('dw_fov',State.fov);
    if(State.renderer) State.renderer.setFOV(State.fov);
  });
  document.getElementById('vol-slider').addEventListener('input',(e)=>{
    const vol=parseFloat(e.target.value);
    document.getElementById('vol-val').textContent=Math.round(vol*100)+'%';
    if(State.audio) State.audio.setMasterVolume(vol);
  });
}

function toggleSettings(){
  const el=document.getElementById('settings');
  const isOpen=!el.classList.contains('hidden');
  if(isOpen){el.classList.add('hidden');document.body.requestPointerLock();}
  else{el.classList.remove('hidden');document.exitPointerLock();}
}

// ── DEATH / RESPAWN ──
export function onDeath(killerId, killerName, weapon, headshot) {
  State.alive=false;
  State.health=0;
  document.getElementById('death-screen').classList.remove('hidden');
  document.getElementById('killer-info').textContent=
    killerName?`Killed by ${killerName} with ${weapon}${headshot?' [HEADSHOT]':''}`:'' ;
  let count=3;
  document.getElementById('respawn-timer').textContent=`Respawning in ${count}...`;
  const iv=setInterval(()=>{
    count--;
    if(count<=0){clearInterval(iv);}
    else document.getElementById('respawn-timer').textContent=`Respawning in ${count}...`;
  },1000);
}

export function onRespawn(pos) {
  console.log('[Main] onRespawn called',pos);
  State.alive=true;
  State.health=100;
  State.armor=100;
  document.getElementById('death-screen').classList.add('hidden');
  State.player.teleport(pos);
  State.weapons.resetAmmo();
  State.hud.updateHealth(100);
  State.hud.updateArmor(100);
}

document.getElementById('username-input').value=State.username;
