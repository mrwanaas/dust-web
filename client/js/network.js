// network.js — v2: Fixed respawn + buy system
import { startGame, onDeath, onRespawn } from './main.js';

const SERVER_URL = 'https://dust-web.onrender.com';

export class NetworkManager {
  constructor(state) {
    this.state=state;
    this.socket=null;
    this._posThrottle=0;
    this._shootCount=0;
    this._shootReset=0;
  }

  connect(onReady) {
    if(typeof io==='undefined'){
      const s=document.createElement('script');
      s.src='https://cdn.socket.io/4.7.2/socket.io.min.js';
      s.onload=()=>this._init(onReady);
      document.head.appendChild(s);
    } else { this._init(onReady); }
  }

  _init(onReady) {
    // Detect placeholder URL — show clear error instead of silently starting solo
    const isPlaceholder = SERVER_URL.includes('your-server') || SERVER_URL === '';
    if(isPlaceholder) {
      this._showServerError('SERVER_URL not set.<br><br>Open client/js/network.js and replace line 5 with your Render.com server URL, then push to GitHub.');
      return;
    }

    this.socket=io(SERVER_URL,{
      transports:['websocket','polling'],
      reconnectionAttempts:3,
      timeout:10000,
    });

    this.socket.on('connect',()=>{
      console.log('[Net] connected',this.socket.id);
      this.state.myId=this.socket.id;
      if(onReady) onReady();
    });

    this.socket.on('connect_error',(err)=>{
      console.warn('[Net] connection failed:',err.message);
      // Only fall to solo after all reconnection attempts exhausted
      this._showServerError('Cannot reach game server. Starting offline mode...');
      setTimeout(()=>this._startSolo(), 2000);
    });

    this._registerEvents();
  }

  _showServerError(msg) {
    const el = document.getElementById('lobby-connecting');
    if (el) {
      el.innerHTML = `
        <div style="text-align:center;padding:20px;">
          <div style="color:#ff6060;font-size:0.75rem;letter-spacing:0.2em;margin-bottom:16px;">⚠ SERVER OFFLINE</div>
          <div style="color:rgba(255,255,255,0.4);font-size:0.65rem;letter-spacing:0.15em;line-height:1.8;">${msg}</div>
          <button onclick="location.reload()" style="margin-top:20px;font-family:inherit;font-size:0.65rem;letter-spacing:0.2em;padding:10px 24px;background:#c8a050;color:#000;border:none;cursor:pointer;">RETRY</button>
        </div>
      `;
    }
  }

  _registerEvents() {
    const s=this.socket, S=this.state;

    s.on('room:created',({roomCode,players})=>{
      S.roomCode=roomCode;
      document.getElementById('room-code-display').textContent=roomCode;
      this._showPanel('lobby-waiting');
      this._updateLobbyPlayers(players);
    });

    s.on('room:joined',({roomCode,players,isHost})=>{
      S.roomCode=roomCode;
      document.getElementById('room-code-display').textContent=roomCode;
      this._showPanel('lobby-waiting');
      if(isHost) document.getElementById('start-btn').classList.remove('hidden');
      this._updateLobbyPlayers(players);
    });

    s.on('room:error',({message})=>{
      alert('Error: '+message);
      this._showPanel('lobby-main');
    });

    s.on('lobby:update',({players})=>this._updateLobbyPlayers(players));
    s.on('lobby:hostChanged',()=>document.getElementById('start-btn').classList.remove('hidden'));

    // Game start — includes spawn pos and money
    s.on('game:starting',({spawnPos,money,buyTime})=>{
      S.money=money??800;
      startGame(spawnPos);
      // Show buy menu if buy time available
      if(buyTime>0) setTimeout(()=>S.hud?.showBuyMenu(buyTime),500);
    });

    s.on('game:state',({players,scores,roundTimer,roundNum,inBuyPhase,buyTimer})=>{
      S.players=players;
      S.hud?.updateScores(scores.CT,scores.T);
      S.hud?.updateTimer(roundTimer);
      S.hud?.updateRoundNum(roundNum);
      if(S.map) S.map.updateRemotePlayers(players,S.myId,S.team);
      S.hud?.updateScoreboard(players,S.myId);
      S.hud?.updateMinimap(players,S.myId);
    });

    s.on('player:hit',({shooterId,victimId,damage,hitzone,killfeedEntry})=>{
      if(victimId===S.myId){
        S.health=Math.max(0,S.health-damage);
        S.hud?.updateHealth(S.health);
        S.renderer?.shake(0.03+damage*0.0008,0.2);
        S.audio?.play('pain');
        this._flashDamage();
      }
      if(killfeedEntry) S.hud?.addKillFeed(killfeedEntry);
    });

    s.on('player:died',({victimId,killerId,killerName,weapon,headshot})=>{
      if(victimId===S.myId) onDeath(killerId,killerName,weapon,headshot);
    });

    // FIXED: proper respawn handler
    s.on('player:spawned',({playerId,position})=>{
      console.log('[Net] spawned event',playerId,S.myId);
      if(playerId===S.myId){
        console.log('[Net] calling onRespawn at',position);
        onRespawn(position);
      }
    });

    s.on('player:respawned',({playerId})=>{
      // Another player respawned — map will update on next game:state
    });

    s.on('buy:success',({weaponId,money})=>{
      S.money=money;
      S.weapons?.switchToWeapon(weaponId);
      S.weapons?.resetAmmo();
      S.audio?.play('buy_beep');
      S.hud?.updateMoney(money);
    });

    s.on('game:roundEnd',({winner,scores})=>{
      S.hud?.showRoundEnd(winner);
      S.audio?.play(winner===S.team?'round_win':'round_lose');
      setTimeout(()=>S.hud?.hideRoundEnd(),4000);
    });

    s.on('game:matchEnd',({winner,scores})=>S.hud?.showMatchEnd(winner,scores));
    s.on('player:bulletWhiz',()=>S.audio?.play('whiz',{volume:0.5}));
    s.on('disconnect',()=>console.warn('[Net] disconnected'));
  }

  createRoom(username){ this.socket?.emit('player:join',{username,team:this.state.team,action:'create'}); }
  joinRoom(code,username){ this.socket?.emit('player:join',{username,team:this.state.team,action:'join',roomCode:code}); }

  emit(event,data){
    if(!this.socket?.connected) return;
    if(event==='player:shoot'){
      const now=Date.now();
      if(now-this._shootReset>1000){this._shootCount=0;this._shootReset=now;}
      if(++this._shootCount>14) return;
    }
    this.socket.emit(event,data);
  }

  sendPosition(){
    if(!this.state.player||!this.state.alive) return;
    if(++this._posThrottle%2!==0) return;
    this.emit('player:move',this.state.player.getNetworkState());
  }

  _showPanel(id){
    ['lobby-main','lobby-join','lobby-waiting','lobby-connecting'].forEach(p=>{
      document.getElementById(p)?.classList.add('hidden');
    });
    document.getElementById(id)?.classList.remove('hidden');
  }

  _updateLobbyPlayers(players){
    const ct=document.getElementById('team-ct');
    const t=document.getElementById('team-t');
    if(!ct||!t) return;
    ct.innerHTML=''; t.innerHTML='';
    for(const [id,p] of Object.entries(players)){
      const div=document.createElement('div');
      div.className='team-player'+(p.ready?' ready':'');
      div.innerHTML=`<span>${p.username}${id===this.socket?.id?' (you)':''}</span><span class="player-status">${p.ready?'READY':'waiting'}</span>`;
      (p.team==='CT'?ct:t).appendChild(div);
    }
    const count=Object.keys(players).length;
    const allReady=Object.values(players).every(p=>p.ready);
    const statusEl=document.getElementById('lobby-status');
    if(statusEl) statusEl.textContent=allReady&&count>=2?`All ${count} ready! Host can start.`:`${count} connected — waiting...`;
  }

  _flashDamage(){
    const el=document.getElementById('damage-flash');
    if(!el) return;
    el.classList.remove('hidden');
    clearTimeout(this._ft);
    this._ft=setTimeout(()=>el.classList.add('hidden'),140);
  }

  _startSolo(){
    this.state.myId='solo-player';
    this.state.money=800;
    document.getElementById('lobby').style.display='none';
    startGame({x:0,y:1.7,z:-38});
  }
}
