// hud.js — HUD Manager (health, ammo, killfeed, scoreboard, minimap, timer)

export class HUD {
  constructor(state) {
    this.state = state;
    this.killFeedEntries = [];
    this.hitIndicatorTimer = 0;
    this.minimapCtx = null;
    this.roundEndTimer = 0;
  }

  init() {
    const mm = document.getElementById('minimap');
    if (mm) this.minimapCtx = mm.getContext('2d');

    // Sync settings sliders to current state
    const sensSlider = document.getElementById('sens-slider');
    if (sensSlider) {
      sensSlider.value = this.state.sensitivity;
      document.getElementById('sens-val').textContent = this.state.sensitivity.toFixed(4);
    }
    const fovSlider = document.getElementById('fov-slider');
    if (fovSlider) {
      fovSlider.value = this.state.fov;
      document.getElementById('fov-val').textContent = this.state.fov + '°';
    }
  }

  update(dt) {
    // Hit indicator fade
    if (this.hitIndicatorTimer > 0) {
      this.hitIndicatorTimer -= dt;
      if (this.hitIndicatorTimer <= 0) {
        document.getElementById('hit-indicator')?.classList.remove('active');
      }
    }

    // Kill feed entries expiry
    const now = Date.now();
    this.killFeedEntries = this.killFeedEntries.filter(e => {
      if (now - e.time > 4000) {
        e.el?.remove();
        return false;
      }
      // Fade last 500ms
      const remaining = 4000 - (now - e.time);
      if (remaining < 500 && e.el) {
        e.el.style.opacity = (remaining / 500).toFixed(2);
      }
      return true;
    });
  }

  // ── HEALTH ──
  updateHealth(hp) {
    const bar = document.getElementById('hp-bar');
    const num = document.getElementById('hp-num');
    if (!bar || !num) return;

    const pct = Math.max(0, hp) / 100;
    bar.style.width = (pct * 100) + '%';
    num.textContent = Math.max(0, Math.round(hp));

    bar.classList.remove('medium', 'low');
    if (pct < 0.25) bar.classList.add('low');
    else if (pct < 0.5) bar.classList.add('medium');
  }

  updateArmor(armor) {
    const bar = document.getElementById('armor-bar');
    const num = document.getElementById('armor-num');
    if (!bar || !num) return;
    const pct = Math.max(0, armor) / 100;
    bar.style.width = (pct * 100) + '%';
    num.textContent = Math.max(0, Math.round(armor));
  }

  // ── AMMO ──
  updateAmmo(mag, reserve) {
    const magEl  = document.getElementById('ammo-mag');
    const resEl  = document.getElementById('ammo-reserve');
    if (!magEl || !resEl) return;
    magEl.textContent = mag;
    resEl.textContent = reserve;
    magEl.classList.toggle('empty', mag === 0);
  }

  updateWeapon(weaponKey, mag, reserve) {
    const icons = { ak47: 'AK-47', m4a1: 'M4A1', deagle: 'DEagle' };
    const iconEl = document.getElementById('weapon-icon');
    if (iconEl) iconEl.textContent = icons[weaponKey] || weaponKey.toUpperCase();
    this.updateAmmo(mag, reserve);
  }

  // ── SCORES ──
  updateScores(ct, t) {
    const ctEl = document.getElementById('score-ct-num');
    const tEl  = document.getElementById('score-t-num');
    if (ctEl) ctEl.textContent = ct;
    if (tEl)  tEl.textContent  = t;
    this.state.scores = { CT: ct, T: t };
  }

  // ── TIMER ──
  updateTimer(seconds) {
    const el = document.getElementById('round-timer');
    if (!el) return;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    el.classList.toggle('urgent', seconds <= 20);
    this.state.roundTimer = seconds;
  }

  updateRoundNum(num) {
    const el = document.getElementById('round-num');
    if (el) el.textContent = `ROUND ${num}`;
    this.state.roundNum = num;
  }

  // ── KILL FEED ──
  addKillFeed({ killerName, victimName, weapon, headshot, killerTeam }) {
    const feed = document.getElementById('killfeed');
    if (!feed) return;

    const el = document.createElement('div');
    el.className = `kf-entry${headshot ? ' headshot' : ''} ${killerTeam === 'CT' ? 'ct-kill' : 't-kill'}`;
    el.innerHTML = `
      <span class="kf-killer">${killerName}</span>
      <span class="kf-weapon">[${weapon}]</span>
      <span class="kf-victim">${victimName}</span>
      ${headshot ? '<span class="kf-hs">HS</span>' : ''}
    `;

    feed.appendChild(el);
    const entry = { el, time: Date.now() };
    this.killFeedEntries.push(entry);

    // Keep max 5 visible
    while (this.killFeedEntries.length > 5) {
      const old = this.killFeedEntries.shift();
      old.el?.remove();
    }
  }

  // ── HIT INDICATOR ──
  showHitIndicator() {
    const el = document.getElementById('hit-indicator');
    if (el) el.classList.add('active');
    this.hitIndicatorTimer = 0.15;
  }

  // ── SCOREBOARD ──
  updateScoreboard(players, myId) {
    const ctList = document.getElementById('sb-ct');
    const tList  = document.getElementById('sb-t');
    if (!ctList || !tList) return;

    const renderTeam = (el, team) => {
      el.innerHTML = '';
      const teamPlayers = Object.entries(players)
        .filter(([, p]) => p.team === team)
        .sort(([, a], [, b]) => (b.kills ?? 0) - (a.kills ?? 0));

      for (const [id, p] of teamPlayers) {
        const row = document.createElement('div');
        row.className = `sb-row${id === myId ? ' me' : ''}`;
        row.innerHTML = `
          <span>${p.username ?? id.slice(0,8)}</span>
          <span>${p.kills ?? 0}</span>
          <span>${p.deaths ?? 0}</span>
          <span>${p.assists ?? 0}</span>
        `;
        el.appendChild(row);
      }
    };

    renderTeam(ctList, 'CT');
    renderTeam(tList, 'T');
  }

  // ── MINIMAP ──
  updateMinimap(players, myId) {
    const ctx = this.minimapCtx;
    if (!ctx) return;

    const size = 150;
    const scale = size / 100; // map is 100x100
    const cx = size / 2, cy = size / 2;

    ctx.clearRect(0, 0, size, size);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, size, size);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 100; i += 10) {
      const px = i * scale;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, px); ctx.lineTo(size, px); ctx.stroke();
    }

    // Map walls (rough positions matching map.js)
    ctx.fillStyle = 'rgba(180,160,100,0.3)';
    const walls = [
      [-20, -20, 8, 4], [10, -20, 8, 4], [-5, -5, 4, 8],
      [-20, 10, 6, 8],  [15, 10, 6, 8],  [-30, 0, 4, 12],
      [25, -10, 4, 12], [-10, 25, 12, 4],
    ];
    for (const [wx, wz, ww, wh] of walls) {
      const px = cx + wx * scale;
      const py = cy + wz * scale;
      ctx.fillRect(px, py, ww * scale, wh * scale);
    }

    // Players
    for (const [id, p] of Object.entries(players)) {
      if (!p.position || !p.alive) continue;
      const px = cx + p.position.x * scale;
      const py = cy + p.position.z * scale;

      ctx.beginPath();
      ctx.arc(px, py, id === myId ? 4 : 3, 0, Math.PI * 2);
      ctx.fillStyle = id === myId ? '#ffcc00' : (p.team === 'CT' ? '#6090ff' : '#ff6040');
      ctx.fill();

      // Direction arrow for self
      if (id === myId && this.state.yaw !== undefined) {
        const yaw = this.state.yaw;
        const arrowLen = 7;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - Math.sin(yaw) * arrowLen, py - Math.cos(yaw) * arrowLen);
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Border
    ctx.strokeStyle = 'rgba(200,160,80,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, size, size);
  }

  // ── ROUND END ──
  showRoundEnd(winner) {
    const el = document.getElementById('round-end');
    const titleEl = document.getElementById('round-end-title');
    const winEl   = document.getElementById('round-end-winner');
    if (!el) return;

    el.classList.remove('hidden');
    if (titleEl) titleEl.textContent = 'ROUND OVER';
    if (winEl) {
      winEl.textContent = winner === 'CT' ? 'COUNTER-TERRORISTS WIN' : 'TERRORISTS WIN';
      winEl.className = 'round-end-winner ' + winner.toLowerCase();
    }
  }

  hideRoundEnd() {
    document.getElementById('round-end')?.classList.add('hidden');
  }

  // ── MATCH END ──
  showMatchEnd(winner, scores) {
    const el = document.getElementById('match-end');
    const title  = document.getElementById('match-title');
    const score  = document.getElementById('match-score');
    if (!el) return;

    el.classList.remove('hidden');
    document.exitPointerLock();

    if (title) title.textContent = winner === 'CT' ? 'CT WIN!' : 'T WIN!';
    if (score) score.textContent = `CT ${scores.CT} — ${scores.T} T`;
  }
}
