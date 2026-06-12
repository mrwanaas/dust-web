// map.js — DUST_WEB Map Geometry + Remote Player Meshes
import * as THREE from 'three';

// Spawn points
export const SPAWN_CT = [
  { x:  0, y: 0, z: -40, yaw: Math.PI },
  { x: -5, y: 0, z: -42, yaw: Math.PI },
  { x:  5, y: 0, z: -42, yaw: Math.PI },
  { x:-10, y: 0, z: -40, yaw: Math.PI },
  { x: 10, y: 0, z: -40, yaw: Math.PI },
];
export const SPAWN_T = [
  { x:  0, y: 0, z:  40, yaw: 0 },
  { x: -5, y: 0, z:  42, yaw: 0 },
  { x:  5, y: 0, z:  42, yaw: 0 },
  { x:-10, y: 0, z:  40, yaw: 0 },
  { x: 10, y: 0, z:  40, yaw: 0 },
];

// Wall definitions: [cx, cz, width, height, depth]
const WALL_DEFS = [
  // Central cover boxes
  [-20, -20,  8, 2.5, 4],
  [ 20, -20,  8, 2.5, 4],
  [ -5, -5,   4, 2.5, 8],
  [  5,  5,   4, 2.5, 8],
  [-20,  10,  6, 2.5, 8],
  [ 20,  10,  6, 2.5, 8],
  [-30,   0,  4, 2.5,12],
  [ 30,   0,  4, 2.5,12],
  [-10,  25, 12, 2.5, 4],
  [ 10, -25, 12, 2.5, 4],
  // Low walls (half-height)
  [  0,  15,  6, 1.2, 1],
  [  0, -15,  6, 1.2, 1],
  [-15,   0,  1, 1.2, 6],
  [ 15,   0,  1, 1.2, 6],
];

// Boundary walls
const BOUNDARY_WALLS = [
  // North, South, East, West
  [   0, -50, 100, 4, 1],
  [   0,  50, 100, 4, 1],
  [ 50,   0,   1, 4,100],
  [-50,   0,   1, 4,100],
];

export class GameMap {
  constructor(scene, renderer) {
    this.scene    = scene;
    this.renderer = renderer;
    this.colliders = []; // AABB list for PlayerController
    this.remotePlayers = {}; // id → { group, head, body, nameTag }

    this._buildGround();
    this._buildSkybox();
    this._buildWalls();
    this._buildBoundaries();
    this._buildDecor();
  }

  _mat(color, roughness = 0.85, metalness = 0.05) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
  }

  _buildGround() {
    // Main ground plane
    const geo = new THREE.PlaneGeometry(100, 100, 20, 20);
    const mat = this._mat(0xc8a060);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    mesh.userData.isGround = true;
    this.scene.add(mesh);

    // Sandy texture variation
    const geo2 = new THREE.PlaneGeometry(100, 100);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    for (let i = 0; i < 4000; i++) {
      ctx.fillStyle = `rgba(${150 + Math.random()*60},${100+Math.random()*40},${30+Math.random()*20},${Math.random()*0.3})`;
      ctx.beginPath();
      ctx.arc(Math.random()*512, Math.random()*512, Math.random()*3+1, 0, Math.PI*2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 8);
    const mat2 = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.35 });
    const mesh2 = new THREE.Mesh(geo2, mat2);
    mesh2.rotation.x = -Math.PI / 2;
    mesh2.position.y = 0.001;
    this.scene.add(mesh2);
  }

  _buildSkybox() {
    // Procedural desert sky gradient sphere
    const geo = new THREE.SphereGeometry(250, 16, 16);
    const canvas = document.createElement('canvas');
    canvas.width = 4; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0,    '#5090d0');
    grad.addColorStop(0.4,  '#a0c0e0');
    grad.addColorStop(0.75, '#e0c880');
    grad.addColorStop(1,    '#c8a060');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide });
    this.scene.add(new THREE.Mesh(geo, mat));
  }

  _buildWalls() {
    const colors = [0xd4b882, 0xc8a870, 0xbfa060, 0xd8c090];

    for (const [cx, cz, w, h, d] of WALL_DEFS) {
      const color = colors[Math.floor(Math.random() * colors.length)];
      const geo   = new THREE.BoxGeometry(w, h, d);
      const mat   = this._mat(color);

      const mesh  = new THREE.Mesh(geo, mat);
      mesh.position.set(cx, h / 2, cz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);

      // AABB collider
      this.colliders.push({
        min: new THREE.Vector3(cx - w/2, 0,       cz - d/2),
        max: new THREE.Vector3(cx + w/2, h,       cz + d/2),
      });

      // Edge trim (dark line on top)
      const trimGeo = new THREE.BoxGeometry(w + 0.05, 0.08, d + 0.05);
      const trimMat = this._mat(0x8a7040, 0.9);
      const trim = new THREE.Mesh(trimGeo, trimMat);
      trim.position.set(cx, h + 0.04, cz);
      this.scene.add(trim);
    }
  }

  _buildBoundaries() {
    const mat = this._mat(0xa08050, 0.9);
    for (const [cx, cz, w, h, d] of BOUNDARY_WALLS) {
      const geo  = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(cx, h / 2, cz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);

      this.colliders.push({
        min: new THREE.Vector3(cx - w/2, 0, cz - d/2),
        max: new THREE.Vector3(cx + w/2, h, cz + d/2),
      });
    }
  }

  _buildDecor() {
    // Spawn zone markers
    this._spawnZoneMarker(0, -40, 0x3060ff, 'CT');
    this._spawnZoneMarker(0,  40, 0xff4020, 'T');

    // Scattered rocks/debris
    const rockMat = this._mat(0x887060, 0.95, 0.02);
    for (let i = 0; i < 30; i++) {
      const s   = 0.2 + Math.random() * 0.6;
      const geo = new THREE.DodecahedronGeometry(s, 0);
      const rock = new THREE.Mesh(geo, rockMat);
      rock.position.set(
        (Math.random() - 0.5) * 90,
        s * 0.3,
        (Math.random() - 0.5) * 90
      );
      rock.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
      rock.castShadow = true;
      this.scene.add(rock);
    }

    // Overhead lights (fake — point lights near key areas)
    const lightPositions = [[0, 8, 0], [-20, 8, -20], [20, 8, 20]];
    for (const [x, y, z] of lightPositions) {
      const light = new THREE.PointLight(0xffe090, 0.5, 30);
      light.position.set(x, y, z);
      this.scene.add(light);
    }
  }

  _spawnZoneMarker(x, z, color, label) {
    const geo = new THREE.PlaneGeometry(12, 6);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.01, z);
    this.scene.add(mesh);
  }

  // ── REMOTE PLAYERS ──
  updateRemotePlayers(players, myId, myTeam) {
    const presentIds = new Set(Object.keys(players));

    // Remove stale
    for (const id of Object.keys(this.remotePlayers)) {
      if (!presentIds.has(id)) {
        this.scene.remove(this.remotePlayers[id].group);
        delete this.remotePlayers[id];
      }
    }

    // Add / update
    for (const [id, p] of Object.entries(players)) {
      if (id === myId) continue;
      if (!p.position) continue;

      if (!this.remotePlayers[id]) {
        this._createRemotePlayer(id, p.team);
      }

      const rp = this.remotePlayers[id];
      rp.group.visible = p.alive ?? true;

      // Smooth position
      rp.group.position.lerp(
        new THREE.Vector3(p.position.x, p.position.y ?? 0, p.position.z),
        0.25
      );

      // Yaw rotation
      if (p.yaw !== undefined) {
        rp.group.rotation.y = p.yaw;
      }
    }
  }

  _createRemotePlayer(id, team) {
    const isEnemy = true; // simplified — could check team

    const group = new THREE.Group();

    // Body
    const bodyGeo = new THREE.BoxGeometry(0.6, 1.0, 0.3);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: team === 'CT' ? 0x2244aa : 0xaa3311,
      roughness: 0.8,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.5;
    body.castShadow = true;
    body.userData.playerId = id;
    body.userData.hitzone  = 'body';
    group.add(body);

    // Head
    const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xc8a078,
      roughness: 0.9,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.3;
    head.castShadow = true;
    head.userData.playerId = id;
    head.userData.hitzone  = 'head';
    group.add(head);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.25, 0.7, 0.25);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2a, roughness: 0.9 });

    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.15, -0.35, 0);
    legL.userData.playerId = id;
    legL.userData.hitzone  = 'legs';
    group.add(legL);

    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set( 0.15, -0.35, 0);
    legR.userData.playerId = id;
    legR.userData.hitzone  = 'legs';
    group.add(legR);

    group.position.set(0, 1.0, 0);
    this.scene.add(group);
    this.remotePlayers[id] = { group, body, head };
  }

  getColliders() {
    return this.colliders;
  }

  getSpawnForTeam(team, index = 0) {
    const spawns = team === 'CT' ? SPAWN_CT : SPAWN_T;
    return spawns[index % spawns.length];
  }
}
