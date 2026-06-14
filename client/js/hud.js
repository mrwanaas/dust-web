// hud.js — v2: Full HUD + CS:GO Buy Menu
export class HUD {
  constructor(state){
    this.state=state;
    this.killFeedEntries=[];
    this.hitIndicatorTimer=0;
    this.minimapCtx=null;
    this.buyMenuOpen=false;
    this.buyTimeLeft=0;
    this._buyTimer=null;
  }

  init(){
    const mm=document.getElementById('minimap');
    if(mm) this.minimapCtx=mm.getContext('2d');
    this._buildBuyMenu();
    const s=document.getElementById('sens-slider');
    if(s){s.value=this.state.sensitivity;document.getElementById('sens-val').textContent=this.state.sensitivity.toFixed(4);}
    const f=document.getElementById('fov-slider');
    if(f){f.value=this.state.fov;document.getElementById('fov-val').textContent=this.state.fov+'°';}
  }

  update(dt){
    if(this.hitIndicatorTimer>0){
      this.hitIndicatorTimer-=dt;
      if(this.hitIndicatorTimer<=0) document.getElementById('hit-indicator')?.classList.remove('active');
    }
    const now=Date.now();
    this.killFeedEntries=this.killFeedEntries.filter(e=>{
      if(now-e.time>4000){e.el?.remove();return false;}
      const rem=4000-(now-e.time);
      if(rem<500&&e.el) e.el.style.opacity=(rem/500).toFixed(2);
      return true;
    });
    // Nameplate billboarding handled in map.js
  }

  updateHealth(hp){
    const bar=document.getElementById('hp-bar');
    const num=document.getElementById('hp-num');
    if(!bar||!num) return;
    const pct=Math.max(0,hp)/100;
    bar.style.width=(pct*100)+'%';
    num.textContent=Math.max(0,Math.round(hp));
    bar.classList.remove('medium','low');
    if(pct<0.25) bar.classList.add('low');
    else if(pct<0.5) bar.classList.add('medium');
    this.state.health=hp;
  }

  updateArmor(armor){
    const bar=document.getElementById('armor-bar');
    const num=document.getElementById('armor-num');
    if(!bar||!num) return;
    bar.style.width=(Math.max(0,armor)/100*100)+'%';
    num.textContent=Math.max(0,Math.round(armor));
  }

  updateAmmo(mag,reserve){
    const m=document.getElementById('ammo-mag');
    const r=document.getElementById('ammo-reserve');
    if(!m||!r) return;
    m.textContent=mag; r.textContent=reserve;
    m.classList.toggle('empty',mag===0);
  }

  updateWeapon(key,mag,reserve){
    const icons={glock:'GLOCK',deagle:'DEagle',mp5:'MP5',ak47:'AK-47',m4a1:'M4A1',awp:'AWP'};
    const el=document.getElementById('weapon-icon');
    if(el) el.textContent=icons[key]||key.toUpperCase();
    this.updateAmmo(mag,reserve);
  }

  updateMoney(amount){
    this.state.money=amount;
    const el=document.getElementById('money-display');
    if(el) el.textContent='$'+amount;
  }

  updateScores(ct,t){
    const ce=document.getElementById('score-ct-num');
    const te=document.getElementById('score-t-num');
    if(ce) ce.textContent=ct;
    if(te) te.textContent=t;
    this.state.scores={CT:ct,T:t};
  }

  updateTimer(seconds){
    const el=document.getElementById('round-timer');
    if(!el) return;
    const m=Math.floor(seconds/60);
    const s=Math.floor(seconds%60);
    el.textContent=`${m}:${s.toString().padStart(2,'0')}`;
    el.classList.toggle('urgent',seconds<=20);
  }

  updateRoundNum(num){
    const el=document.getElementById('round-num');
    if(el) el.textContent='ROUND '+num;
  }

  addKillFeed({killerName,victimName,weapon,headshot,killerTeam}){
    const feed=document.getElementById('killfeed');
    if(!feed) return;
    const el=document.createElement('div');
    el.className=`kf-entry${headshot?' headshot':''} ${killerTeam==='CT'?'ct-kill':'t-kill'}`;
    el.innerHTML=`<span class="kf-killer">${killerName}</span><span class="kf-weapon">[${weapon.toUpperCase()}]</span><span class="kf-victim">${victimName}</span>${headshot?'<span class="kf-hs">HS💀</span>':''}`;
    feed.appendChild(el);
    this.killFeedEntries.push({el,time:Date.now()});
    while(this.killFeedEntries.length>5){const old=this.killFeedEntries.shift();old.el?.remove();}
  }

  showHitIndicator(headshot=false){
    const el=document.getElementById('hit-indicator');
    if(el){el.classList.add('active');el.classList.toggle('headshot-hit',headshot);}
    this.hitIndicatorTimer=headshot?0.3:0.15;
  }

  updateScoreboard(players,myId){
    const ct=document.getElementById('sb-ct');
    const t=document.getElementById('sb-t');
    if(!ct||!t) return;
    const render=(el,team)=>{
      el.innerHTML='';
      Object.entries(players).filter(([,p])=>p.team===team)
        .sort(([,a],[,b])=>(b.kills??0)-(a.kills??0))
        .forEach(([id,p])=>{
          const row=document.createElement('div');
          row.className='sb-row'+(id===myId?' me':'');
          row.innerHTML=`<span>${p.username??id.slice(0,8)}</span><span>${p.kills??0}</span><span>${p.deaths??0}</span><span>${p.assists??0}</span>`;
          el.appendChild(row);
        });
    };
    render(ct,'CT'); render(t,'T');
  }

  updateMinimap(players,myId){
    const ctx=this.minimapCtx;
    if(!ctx) return;
    const size=150,scale=size/120,cx=size/2,cy=size/2;
    ctx.clearRect(0,0,size,size);
    ctx.fillStyle='rgba(0,0,0,0.75)';
    ctx.fillRect(0,0,size,size);
    // Grid
    ctx.strokeStyle='rgba(255,255,255,0.04)'; ctx.lineWidth=0.5;
    for(let i=0;i<=120;i+=12){const p=i*scale;ctx.beginPath();ctx.moveTo(p,0);ctx.lineTo(p,size);ctx.stroke();ctx.beginPath();ctx.moveTo(0,p);ctx.lineTo(size,p);ctx.stroke();}
    // Players
    for(const [id,p] of Object.entries(players)){
      if(!p.position||!p.alive) continue;
      const px=cx+p.position.x*scale, py=cy+p.position.z*scale;
      ctx.beginPath(); ctx.arc(px,py,id===myId?4.5:3,0,Math.PI*2);
      ctx.fillStyle=id===myId?'#ffcc00':(p.team==='CT'?'#6090ff':'#ff6040');
      ctx.fill();
      if(id===myId){
        const yaw=this.state.yaw;
        ctx.beginPath(); ctx.moveTo(px,py);
        ctx.lineTo(px-Math.sin(yaw)*8,py-Math.cos(yaw)*8);
        ctx.strokeStyle='#ffcc00'; ctx.lineWidth=1.5; ctx.stroke();
      }
    }
    ctx.strokeStyle='rgba(200,160,80,0.3)'; ctx.lineWidth=1;
    ctx.strokeRect(0,0,size,size);
  }

  showRoundEnd(winner){
    const el=document.getElementById('round-end');
    const w=document.getElementById('round-end-winner');
    if(!el) return;
    el.classList.remove('hidden');
    if(w){w.textContent=winner==='CT'?'COUNTER-TERRORISTS WIN':'TERRORISTS WIN';w.className='round-end-winner '+winner.toLowerCase();}
  }

  hideRoundEnd(){ document.getElementById('round-end')?.classList.add('hidden'); }

  showMatchEnd(winner,scores){
    const el=document.getElementById('match-end');
    if(!el) return;
    el.classList.remove('hidden');
    document.exitPointerLock();
    const t=document.getElementById('match-title');
    const s=document.getElementById('match-score');
    if(t) t.textContent=winner==='CT'?'🏆 CT WIN!':'🏆 T WIN!';
    if(s) s.textContent=`CT ${scores.CT} — ${scores.T} T`;
  }

  // ── BUY MENU ──
  _buildBuyMenu(){
    if(document.getElementById('buy-menu')) return;
    const WEAPONS_SHOP=[
      {id:'glock', name:'Glock-18',    price:0,    team:'T',   dmg:18,  cat:'pistol'},
      {id:'deagle',name:'Desert Eagle',price:700,  team:'both',dmg:63,  cat:'pistol'},
      {id:'mp5',   name:'MP5-SD',      price:1500, team:'both',dmg:20,  cat:'smg'},
      {id:'ak47',  name:'AK-47',       price:2700, team:'T',   dmg:36,  cat:'rifle'},
      {id:'m4a1',  name:'M4A1-S',      price:3100, team:'CT',  dmg:29,  cat:'rifle'},
      {id:'awp',   name:'AWP',         price:4750, team:'both',dmg:115, cat:'sniper'},
    ];

    const overlay=document.createElement('div');
    overlay.id='buy-menu';
    overlay.className='buy-menu hidden';
    overlay.innerHTML=`
      <div class="buy-panel">
        <div class="buy-header">
          <div class="buy-title">BUY MENU <span class="buy-key">[B]</span></div>
          <div class="buy-money-row">MONEY: <span id="buy-money">$800</span></div>
          <div class="buy-timer-row">BUY TIME: <span id="buy-time-left">15</span>s</div>
        </div>
        <div class="buy-categories">
          <button class="buy-cat active" data-cat="all">ALL</button>
          <button class="buy-cat" data-cat="pistol">PISTOLS</button>
          <button class="buy-cat" data-cat="smg">SMG</button>
          <button class="buy-cat" data-cat="rifle">RIFLES</button>
          <button class="buy-cat" data-cat="sniper">SNIPERS</button>
        </div>
        <div class="buy-grid" id="buy-grid"></div>
        <div class="buy-footer">
          <button class="buy-close-btn" onclick="window.closeBuyMenu()">CLOSE [ESC]</button>
        </div>
      </div>
    `;
    document.getElementById('hud').appendChild(overlay);
    overlay.style.pointerEvents='all';

    // Category filter buttons
    overlay.querySelectorAll('.buy-cat').forEach(btn=>{
      btn.addEventListener('click',()=>{
        overlay.querySelectorAll('.buy-cat').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        this._renderBuyGrid(WEAPONS_SHOP, btn.dataset.cat);
      });
    });

    this._weaponsShop=WEAPONS_SHOP;
    this._renderBuyGrid(WEAPONS_SHOP,'all');

    window.closeBuyMenu=()=>this.hideBuyMenu();
    window.buyWeapon=(id)=>this._buyWeapon(id);
  }

  _renderBuyGrid(weapons, cat){
    const grid=document.getElementById('buy-grid');
    if(!grid) return;
    const team=this.state.team;
    const money=this.state.money||0;
    grid.innerHTML='';
    weapons
      .filter(w=>cat==='all'||w.cat===cat)
      .filter(w=>w.team==='both'||w.team===team)
      .forEach(w=>{
        const canAfford=money>=w.price;
        const card=document.createElement('div');
        card.className='buy-card'+(canAfford?'':' cant-afford');
        card.innerHTML=`
          <div class="buy-card-name">${w.name}</div>
          <div class="buy-card-gun">${this._weaponSVG(w.id)}</div>
          <div class="buy-card-stats">
            <span class="buy-stat">DMG ${w.dmg}</span>
          </div>
          <div class="buy-card-price ${canAfford?'affordable':''}">$${w.price===0?'FREE':w.price}</div>
          <button class="buy-btn" onclick="buyWeapon('${w.id}')" ${canAfford?'':'disabled'}>
            ${canAfford?'BUY':'NO FUNDS'}
          </button>
        `;
        grid.appendChild(card);
      });
  }

  _weaponSVG(id){
    // Simple ASCII-art style weapon silhouettes
    const svgs={
      glock: `<svg viewBox="0 0 80 30" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="5" y="8" width="55" height="12" rx="2" fill="currentColor" opacity="0.7"/>
        <rect x="50" y="8" width="20" height="5" rx="1" fill="currentColor" opacity="0.9"/>
        <rect x="25" y="20" width="12" height="8" rx="2" fill="currentColor" opacity="0.6"/>
        <rect x="8" y="10" width="20" height="4" rx="1" fill="currentColor" opacity="0.4"/>
      </svg>`,
      deagle:`<svg viewBox="0 0 80 30" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="5" y="7" width="58" height="14" rx="2" fill="currentColor" opacity="0.7"/>
        <rect x="52" y="7" width="22" height="6" rx="1" fill="currentColor" opacity="0.9"/>
        <rect x="22" y="21" width="14" height="8" rx="2" fill="currentColor" opacity="0.6"/>
        <rect x="6" y="9" width="18" height="5" rx="1" fill="currentColor" opacity="0.3"/>
      </svg>`,
      mp5:  `<svg viewBox="0 0 80 30" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="9" width="65" height="10" rx="2" fill="currentColor" opacity="0.7"/>
        <rect x="58" y="9" width="18" height="6" rx="3" fill="currentColor" opacity="0.8"/>
        <rect x="30" y="19" width="10" height="9" rx="2" fill="currentColor" opacity="0.6"/>
        <rect x="5" y="10" width="25" height="4" rx="1" fill="currentColor" opacity="0.4"/>
        <rect x="2" y="11" width="6" height="3" rx="1" fill="currentColor" opacity="0.9"/>
      </svg>`,
      ak47: `<svg viewBox="0 0 80 30" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="9" width="68" height="10" rx="2" fill="currentColor" opacity="0.7"/>
        <rect x="62" y="9" width="16" height="5" rx="1" fill="currentColor" opacity="0.9"/>
        <rect x="28" y="18" width="11" height="10" rx="1" fill="currentColor" opacity="0.7" transform="rotate(8 28 18)"/>
        <rect x="4" y="10" width="22" height="5" rx="1" fill="currentColor" opacity="0.5"/>
        <rect x="2" y="14" width="8" height="3" rx="1" fill="currentColor" opacity="0.9"/>
      </svg>`,
      m4a1: `<svg viewBox="0 0 80 30" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="9" width="65" height="10" rx="2" fill="currentColor" opacity="0.7"/>
        <rect x="58" y="9" width="20" height="5" rx="3" fill="currentColor" opacity="0.8"/>
        <rect x="28" y="19" width="10" height="9" rx="2" fill="currentColor" opacity="0.6"/>
        <rect x="4" y="10" width="24" height="4" rx="1" fill="currentColor" opacity="0.4"/>
        <rect x="20" y="7" width="18" height="3" rx="1" fill="currentColor" opacity="0.6"/>
      </svg>`,
      awp:  `<svg viewBox="0 0 80 30" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="10" width="72" height="9" rx="2" fill="currentColor" opacity="0.7"/>
        <rect x="66" y="10" width="12" height="5" rx="1" fill="currentColor" opacity="0.9"/>
        <rect x="25" y="19" width="12" height="9" rx="2" fill="currentColor" opacity="0.6"/>
        <rect x="30" y="6" width="20" height="5" rx="3" fill="currentColor" opacity="0.8"/>
        <rect x="5" y="11" width="18" height="4" rx="1" fill="currentColor" opacity="0.5"/>
      </svg>`,
    };
    return svgs[id]||'';
  }

  _buyWeapon(id){
    this.state.network?.emit('player:buy',{weaponId:id});
    // Optimistic update
    this._renderBuyGrid(this._weaponsShop,'all');
  }

  showBuyMenu(buyTime){
    if(!document.getElementById('buy-menu')) this._buildBuyMenu();
    this.buyMenuOpen=true;
    this.buyTimeLeft=buyTime;
    document.getElementById('buy-menu').classList.remove('hidden');
    document.getElementById('click-prompt').classList.add('hidden');
    document.exitPointerLock();
    // Update money display
    const m=document.getElementById('buy-money');
    if(m) m.textContent='$'+(this.state.money||800);
    this._renderBuyGrid(this._weaponsShop,'all');
    // Countdown
    clearInterval(this._buyTimer);
    const countEl=document.getElementById('buy-time-left');
    this._buyTimer=setInterval(()=>{
      this.buyTimeLeft--;
      if(countEl) countEl.textContent=this.buyTimeLeft;
      if(this.buyTimeLeft<=0){ clearInterval(this._buyTimer); this.hideBuyMenu(); }
    },1000);
  }

  hideBuyMenu(){
    this.buyMenuOpen=false;
    clearInterval(this._buyTimer);
    document.getElementById('buy-menu')?.classList.add('hidden');
    document.body.requestPointerLock();
  }

  toggleBuyMenu(){
    if(this.buyMenuOpen) this.hideBuyMenu();
    else this.showBuyMenu(this.buyTimeLeft||15);
  }
}
