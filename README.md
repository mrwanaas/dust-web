# 🎮 DUST_WEB — CS:GO-Style Browser FPS

A full multiplayer first-person shooter that runs entirely in the browser.  
**Three.js** for 3D rendering · **Socket.io** for real-time multiplayer · No build tools required.

---

## 🚀 Quick Setup (Play with Friends)

### Step 1 — Upload to GitHub

```bash
git init
git add .
git commit -m "DUST_WEB initial commit"
git remote add origin https://github.com/YOUR_USERNAME/dust-web.git
git push -u origin main
```

Then in your repo Settings → Pages → Deploy from GitHub Actions. Your game will be live at:
`https://YOUR_USERNAME.github.io/dust-web/`

### Step 2 — Deploy the Server (Free)

1. Go to [render.com](https://render.com) → **New Web Service**
2. Connect your GitHub repo
3. Set:
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
4. Click **Create Web Service**
5. Copy your URL (e.g. `https://dust-web-server.onrender.com`)

### Step 3 — Point the Client at Your Server

Edit `client/js/network.js` line 5:

```javascript
const SERVER_URL = 'https://dust-web-server.onrender.com'; // ← paste your Render URL
```

Commit and push — GitHub Actions will redeploy automatically.

### Step 4 — Play!

1. Share `https://YOUR_USERNAME.github.io/dust-web/` with friends
2. One player clicks **CREATE ROOM** → gets a 6-letter code
3. Others click **JOIN ROOM** → enter the code
4. Mark **READY** → Host clicks **START GAME**
5. Click the canvas to lock mouse → frag away 💥

---

## 🎮 Controls

| Action | Key |
|--------|-----|
| Move | WASD |
| Jump | Space |
| Crouch | Ctrl |
| Walk (silent) | Shift |
| Shoot | Left Mouse |
| Reload | R |
| Switch Weapon | Scroll Wheel / 1-3 |
| Scoreboard | Tab |
| Settings / Pause | Esc |

---

## 🔫 Weapons

| Weapon | Damage | Headshot | Mag | Fire Rate |
|--------|--------|----------|-----|-----------|
| AK-47 | 36 | ×4 (instant kill) | 30 | 600 RPM |
| M4A1 | 29 | ×4 (instant kill) | 30 | 800 RPM |
| Desert Eagle | 63 | ×4 (instant kill) | 7 | 267 RPM |

---

## 🗺️ Map: DUST_WEB

Dust2-inspired layout with:
- 100×100 unit sandy outdoor arena
- 14 cover walls + scattered rocks
- CT spawn (north) vs T spawn (south)
- Desert atmosphere with fog + dynamic lighting

---

## 🏆 Round Rules

- **1:45** per round
- First team to **16 round wins** wins the match
- Round ends when: time expires (CT win) or all enemies eliminated
- Respawn after **3 seconds** during a round

---

## 🛠️ Local Development

```bash
# Serve the client
npx serve client/

# Run the server
cd server
npm install
node server.js
```

Then update `SERVER_URL` in `network.js` to `http://localhost:3000`.

---

## 📁 Project Structure

```
/client         → Static frontend (GitHub Pages)
  index.html    → Entry point + HUD
  css/hud.css   → All UI styles
  js/
    main.js     → Game loop + input
    renderer.js → Three.js + post-processing
    player.js   → Movement + physics
    weapons.js  → Gun logic + shooting
    network.js  → Socket.io client
    hud.js      → HUD elements
    map.js      → Level geometry
    particles.js → Visual effects
    audio.js    → Procedural sound engine

/server         → Node.js server (Render.com)
  server.js     → Socket.io + room management
  gameState.js  → Authoritative game logic
  package.json

/.github/workflows/deploy.yml → Auto-deploy to GitHub Pages
```

---

## ⚡ Tech Stack

- **Three.js r152** via CDN importmap — 3D rendering
- **Socket.io 4.x** — Real-time multiplayer
- **Web Audio API** — Procedurally synthesized sound effects
- **Pure ES Modules** — No React, no Webpack, no TypeScript
- **Node.js 18** — Game server with authoritative hit detection

---

Built by [Mrwan] · Powered by Three.js + Socket.io
