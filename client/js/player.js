// player.js — Local Player Controller
import * as THREE from 'three';

const WALK_SPEED   = 3.0;
const RUN_SPEED    = 5.5;
const CROUCH_SPEED = 2.0;
const JUMP_FORCE   = 5.5;
const GRAVITY      = -18;
const EYE_HEIGHT   = 1.7;
const CROUCH_HEIGHT = 1.1;
const GROUND_Y     = 0;

export class PlayerController {
  constructor(state, spawnPos) {
    this.state = state;
    this.camera = state.renderer.camera;
    this.scene  = state.renderer.scene;

    // Physics
    this.velocity = new THREE.Vector3();
    this.onGround = true;
    this.isCrouching = false;
    this.isWalking = false;

    // Camera bob
    this.bobTime = 0;
    this.bobAmount = 0;
    this.targetBob = 0;

    // Smooth pitch/yaw
    this.smoothPitch = 0;
    this.smoothYaw   = 0;

    // Hitbox (for server)
    this.hitbox = { head: null, body: null };

    // Colliders (map walls) — filled by map.js
    this.colliders = [];

    this.spawn(spawnPos);
  }

  spawn(pos) {
    this.camera.position.set(pos.x, pos.y ?? EYE_HEIGHT, pos.z);
    this.state.yaw   = pos.yaw   ?? Math.PI;
    this.state.pitch = pos.pitch ?? 0;
    this.velocity.set(0, 0, 0);
    this.onGround = true;
  }

  teleport(pos) { this.spawn(pos); }

  // Called by map.js once geometry is built
  setColliders(aabbs) {
    this.colliders = aabbs; // [{min: Vector3, max: Vector3}]
  }

  update(dt) {
    const S = this.state;
    const keys = S.keys;

    // ── Consume mouse delta ──
    const dx = S.mouseDX * S.sensitivity;
    const dy = S.mouseDY * S.sensitivity;
    S.mouseDX = 0;
    S.mouseDY = 0;

    S.yaw   -= dx;
    S.pitch -= dy;
    S.pitch  = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, S.pitch));

    // ── Crouch / Walk flags ──
    this.isCrouching = !!keys['ControlLeft'] || !!keys['ControlRight'];
    this.isWalking   = !!keys['ShiftLeft']   || !!keys['ShiftRight'];

    const targetEye = this.isCrouching ? CROUCH_HEIGHT : EYE_HEIGHT;
    this.camera.position.y += (targetEye - this.camera.position.y) * Math.min(dt * 12, 1);

    // ── Movement direction ──
    const speed = this.isCrouching ? CROUCH_SPEED : (this.isWalking ? WALK_SPEED : RUN_SPEED);
    const forward = new THREE.Vector3(-Math.sin(S.yaw), 0, -Math.cos(S.yaw));
    const right   = new THREE.Vector3( Math.cos(S.yaw), 0, -Math.sin(S.yaw));

    const move = new THREE.Vector3();
    if (keys['KeyW']) move.addScaledVector(forward,  1);
    if (keys['KeyS']) move.addScaledVector(forward, -1);
    if (keys['KeyA']) move.addScaledVector(right,   -1);
    if (keys['KeyD']) move.addScaledVector(right,    1);

    const isMoving = move.lengthSq() > 0;
    if (isMoving) move.normalize();

    // Smooth acceleration
    const accel = this.onGround ? 18 : 5;
    this.velocity.x += (move.x * speed - this.velocity.x) * Math.min(accel * dt, 1);
    this.velocity.z += (move.z * speed - this.velocity.z) * Math.min(accel * dt, 1);

    // Friction
    if (!isMoving && this.onGround) {
      const friction = 14;
      this.velocity.x *= Math.max(0, 1 - friction * dt);
      this.velocity.z *= Math.max(0, 1 - friction * dt);
    }

    // ── Jump & Bunny-hop ──
    if (keys['Space'] && this.onGround) {
      // Preserve horizontal momentum (bunny-hop)
      const horizSpeed = new THREE.Vector2(this.velocity.x, this.velocity.z).length();
      this.velocity.y = JUMP_FORCE;
      this.onGround = false;
      S.audio?.play('jump');

      // Give a slight speed boost on perfect hop
      if (isMoving && horizSpeed > RUN_SPEED * 0.8) {
        this.velocity.x *= 1.05;
        this.velocity.z *= 1.05;
      }
    }

    // ── Gravity ──
    if (!this.onGround) {
      this.velocity.y += GRAVITY * dt;
    }

    // ── Apply velocity ──
    const delta = this.velocity.clone().multiplyScalar(dt);
    this.camera.position.add(delta);

    // ── Ground collision ──
    if (this.camera.position.y < targetEye) {
      this.camera.position.y = targetEye;
      this.velocity.y = 0;
      this.onGround = true;
    }

    // ── AABB wall collision ──
    this._resolveCollisions();

    // ── Camera rotation ──
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = S.yaw;
    this.camera.rotation.x = S.pitch;

    // ── View bob ──
    const horizVel = new THREE.Vector2(this.velocity.x, this.velocity.z).length();
    if (this.onGround && horizVel > 0.5) {
      const bobSpeed = this.isCrouching ? 5 : (this.isWalking ? 6 : 10);
      this.bobTime += dt * bobSpeed;
      this.targetBob = Math.sin(this.bobTime) * 0.018 * (horizVel / RUN_SPEED);
    } else {
      this.targetBob *= 0.9;
    }
    this.bobAmount += (this.targetBob - this.bobAmount) * Math.min(dt * 15, 1);

    // Apply bob to weapon pivot (not to main camera to avoid nauseating effect)
    if (S.renderer.weaponPivot) {
      S.renderer.weaponPivot.position.y = this.bobAmount;
      S.renderer.weaponPivot.position.x = Math.sin(this.bobTime * 0.5) * 0.008;
    }

    // ── Crosshair spread (movement based) ──
    const spread = Math.min(horizVel / RUN_SPEED, 1);
    const crosshair = document.getElementById('crosshair');
    if (crosshair) {
      crosshair.classList.toggle('spread', spread > 0.15 || !this.onGround);
    }

    // ── Footsteps ──
    this._handleFootsteps(dt, horizVel);
  }

  _resolveCollisions() {
    const pos = this.camera.position;
    const radius = 0.35;

    for (const box of this.colliders) {
      // Expand box by player radius
      const minX = box.min.x - radius, maxX = box.max.x + radius;
      const minZ = box.min.z - radius, maxZ = box.max.z + radius;
      const minY = box.min.y,           maxY = box.max.y + EYE_HEIGHT;

      if (pos.x > minX && pos.x < maxX &&
          pos.y > minY && pos.y < maxY &&
          pos.z > minZ && pos.z < maxZ) {

        // Find shallowest axis to push out
        const ox = Math.min(pos.x - minX, maxX - pos.x);
        const oz = Math.min(pos.z - minZ, maxZ - pos.z);

        if (ox < oz) {
          pos.x += pos.x < (minX + maxX) * 0.5 ? -ox : ox;
          this.velocity.x = 0;
        } else {
          pos.z += pos.z < (minZ + maxZ) * 0.5 ? -oz : oz;
          this.velocity.z = 0;
        }
      }
    }

    // Boundary of map (100x100)
    const BOUND = 49;
    if (pos.x >  BOUND) { pos.x =  BOUND; this.velocity.x = 0; }
    if (pos.x < -BOUND) { pos.x = -BOUND; this.velocity.x = 0; }
    if (pos.z >  BOUND) { pos.z =  BOUND; this.velocity.z = 0; }
    if (pos.z < -BOUND) { pos.z = -BOUND; this.velocity.z = 0; }
  }

  _footstepTimer = 0;
  _handleFootsteps(dt, horizVel) {
    if (!this.onGround || horizVel < 0.5) { this._footstepTimer = 0; return; }
    const interval = this.isWalking ? 0.6 : (this.isCrouching ? 0.8 : 0.4);
    this._footstepTimer += dt;
    if (this._footstepTimer >= interval) {
      this._footstepTimer = 0;
      this.state.audio?.play('footstep', { volume: this.isWalking ? 0.15 : 0.3 });
    }
  }

  // Returns position + rotation for network
  getNetworkState() {
    return {
      x: this.camera.position.x,
      y: this.camera.position.y,
      z: this.camera.position.z,
      yaw: this.state.yaw,
      pitch: this.state.pitch,
      crouching: this.isCrouching,
    };
  }

  // Raycaster origin for shooting
  getShootOrigin() {
    return {
      origin: this.camera.position.clone(),
      direction: new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion),
    };
  }
}
