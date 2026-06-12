// weapons.js — Weapon System (AK-47, M4A1, Desert Eagle)
import * as THREE from 'three';

const WEAPONS = {
  ak47: {
    id: 'ak47', name: 'AK-47',
    damage: 36, headshotMult: 4,
    magSize: 30, reserveAmmo: 90,
    fireRate: 600,        // RPM
    reloadTime: 2.5,      // seconds
    spread: 0.012,        // base inaccuracy
    sprayIncrement: 0.008,
    maxSpray: 0.09,
    auto: true,
    icon: 'AK47',
    color: 0xc47a30,
    barrelOffset: new THREE.Vector3(0.12, -0.12, -0.55),
  },
  m4a1: {
    id: 'm4a1', name: 'M4A1',
    damage: 29, headshotMult: 4,
    magSize: 30, reserveAmmo: 90,
    fireRate: 800,
    reloadTime: 2.1,
    spread: 0.008,
    sprayIncrement: 0.005,
    maxSpray: 0.06,
    auto: true,
    icon: 'M4A1',
    color: 0x4a4a4a,
    barrelOffset: new THREE.Vector3(0.12, -0.12, -0.58),
  },
  deagle: {
    id: 'deagle', name: 'Desert Eagle',
    damage: 63, headshotMult: 4,
    magSize: 7, reserveAmmo: 35,
    fireRate: 267,
    reloadTime: 2.0,
    spread: 0.005,
    sprayIncrement: 0.04,
    maxSpray: 0.12,
    auto: false,
    icon: 'DEagle',
    color: 0x8a7a60,
    barrelOffset: new THREE.Vector3(0.1, -0.13, -0.45),
  },
};

const WEAPON_ORDER = ['ak47', 'm4a1', 'deagle'];

export class WeaponSystem {
  constructor(state) {
    this.state   = state;
    this.scene   = state.renderer.scene;
    this.camera  = state.renderer.camera;
    this.pivot   = state.renderer.weaponPivot;

    this.currentIndex = 0;
    this.currentWeapon = null;
    this.ammo = {};
    this.reserve = {};

    this.isFiring   = false;
    this.isReloading = false;
    this.reloadTimer = 0;
    this.fireTimer   = 0;
    this.sprayLevel  = 0;
    this.sprayDecay  = 0;

    this.weaponMeshes = {};
    this.muzzleFlashMesh = null;
    this.muzzleFlashTimer = 0;

    // Recoil animation
    this.recoilOffset = new THREE.Vector3();
    this.recoilTarget = new THREE.Vector3();
  }

  init() {
    // Init ammo for all weapons
    for (const key of WEAPON_ORDER) {
      this.ammo[key]    = WEAPONS[key].magSize;
      this.reserve[key] = WEAPONS[key].reserveAmmo;
    }

    // Build simple weapon models (BoxGeometry stand-ins)
    this._buildWeaponModels();
    this.switchTo(0);
  }

  _buildWeaponModels() {
    for (const key of WEAPON_ORDER) {
      const def = WEAPONS[key];
      const group = new THREE.Group();

      // Body
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.05, 0.4),
        new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.6, metalness: 0.7 })
      );
      body.castShadow = false;
      group.add(body);

      // Barrel
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.25, 8),
        new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.9 })
      );
      barrel.rotation.z = Math.PI / 2;
      barrel.position.set(0, 0.005, -0.3);
      group.add(barrel);

      // Grip
      const grip = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 0.1, 0.06),
        new THREE.MeshStandardMaterial({ color: def.color * 0.7, roughness: 0.8 })
      );
      grip.position.set(0, -0.07, 0.06);
      group.add(grip);

      // Mag
      const mag = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.12, 0.04),
        new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7 })
      );
      mag.position.set(0, -0.08, 0);
      group.add(mag);

      // Scope / sight
      const sight = new THREE.Mesh(
        new THREE.BoxGeometry(0.01, 0.025, 0.08),
        new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 1 })
      );
      sight.position.set(0, 0.04, -0.05);
      group.add(sight);

      // Position in view (bottom-right)
      group.position.set(0.22, -0.22, -0.35);
      group.visible = false;
      this.pivot.add(group);
      this.weaponMeshes[key] = group;
    }

    // Muzzle flash
    const flashGeo = new THREE.PlaneGeometry(0.15, 0.15);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.muzzleFlashMesh = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlashMesh.position.set(0.22, -0.17, -0.72);
    this.pivot.add(this.muzzleFlashMesh);
  }

  switchTo(index) {
    const newKey = WEAPON_ORDER[index];
    if (!newKey || this.isReloading) return;

    // Hide all
    for (const key of WEAPON_ORDER) {
      if (this.weaponMeshes[key]) this.weaponMeshes[key].visible = false;
    }

    this.currentIndex  = index;
    this.currentWeapon = WEAPONS[newKey];
    this.sprayLevel    = 0;
    this.isReloading   = false;
    this.reloadTimer   = 0;
    this.fireTimer     = 0;

    if (this.weaponMeshes[newKey]) this.weaponMeshes[newKey].visible = true;
    this.state.hud?.updateWeapon(newKey, this.ammo[newKey], this.reserve[newKey]);
  }

  scrollSwitch(dir) {
    const next = ((this.currentIndex + dir) + WEAPON_ORDER.length) % WEAPON_ORDER.length;
    this.switchTo(next);
  }

  startFiring() {
    this.isFiring = true;
  }

  stopFiring() {
    this.isFiring = false;
    // Spray decays faster once you stop
    this.sprayDecay = 8;
  }

  startReload() {
    if (this.isReloading) return;
    const key = WEAPON_ORDER[this.currentIndex];
    if (this.ammo[key] >= this.currentWeapon.magSize) return;
    if (this.reserve[key] <= 0) return;

    this.isReloading = true;
    this.reloadTimer = this.currentWeapon.reloadTime;
    this.isFiring    = false;

    document.getElementById('reload-indicator').classList.remove('hidden');
    this.state.audio?.play('reload_start');
  }

  resetAmmo() {
    for (const key of WEAPON_ORDER) {
      this.ammo[key]    = WEAPONS[key].magSize;
      this.reserve[key] = WEAPONS[key].reserveAmmo;
    }
    this.isReloading = false;
    this.reloadTimer = 0;
    const key = WEAPON_ORDER[this.currentIndex];
    this.state.hud?.updateAmmo(this.ammo[key], this.reserve[key]);
  }

  update(dt) {
    if (!this.currentWeapon) return;
    const key = WEAPON_ORDER[this.currentIndex];

    // ── Reload ──
    if (this.isReloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.isReloading = false;
        document.getElementById('reload-indicator').classList.add('hidden');

        const needed = this.currentWeapon.magSize - this.ammo[key];
        const given  = Math.min(needed, this.reserve[key]);
        this.ammo[key]    += given;
        this.reserve[key] -= given;
        this.state.audio?.play('reload_end');
        this.state.hud?.updateAmmo(this.ammo[key], this.reserve[key]);
      }
      return;
    }

    // ── Fire rate timer ──
    const fireInterval = 60 / this.currentWeapon.fireRate;
    this.fireTimer = Math.max(0, this.fireTimer - dt);

    // ── Auto / semi fire ──
    const canFire = this.isFiring && this.fireTimer <= 0 && !this.isReloading;
    if (canFire) {
      if (this.ammo[key] > 0) {
        this._fire(key);
        this.fireTimer = fireInterval;

        // Semi-auto: only fire once per click
        if (!this.currentWeapon.auto) this.isFiring = false;
      } else {
        // Empty click
        if (this.fireTimer <= 0) {
          this.state.audio?.play('empty');
          this.fireTimer = 0.25;
          // Auto-reload
          this.startReload();
        }
      }
    }

    // ── Spray decay ──
    const decayRate = this.isFiring ? 2 : 18;
    this.sprayLevel = Math.max(0, this.sprayLevel - decayRate * dt);

    // ── Recoil animation smooth ──
    this.recoilOffset.lerp(new THREE.Vector3(0, 0, 0), Math.min(dt * 10, 1));
    if (this.weaponMeshes[key]) {
      this.weaponMeshes[key].position.z = -0.35 + this.recoilOffset.z;
      this.weaponMeshes[key].rotation.x = this.recoilOffset.y * 3;
    }

    // ── Muzzle flash ──
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      const t = this.muzzleFlashTimer / 0.06;
      this.muzzleFlashMesh.material.opacity = t * 0.9;
      const scale = 0.8 + t * 0.4;
      this.muzzleFlashMesh.scale.set(scale, scale, 1);
      this.muzzleFlashMesh.rotation.z = Math.random() * Math.PI;
    } else {
      this.muzzleFlashMesh.material.opacity = 0;
    }
  }

  _fire(key) {
    const def = this.currentWeapon;

    // Spray pattern deviation
    const spreadTotal = def.spread + this.sprayLevel;
    const bx = (Math.random() - 0.5) * spreadTotal;
    const by = (Math.random() - 0.5) * spreadTotal - this.sprayLevel * 0.5;

    // Get shoot direction from camera
    const camera = this.state.renderer.camera;
    const dir = new THREE.Vector3(bx, by, -1).applyQuaternion(camera.quaternion).normalize();
    const origin = camera.position.clone();

    // Raycast into scene
    const raycaster = new THREE.Raycaster(origin, dir, 0.1, 200);
    const hits = raycaster.intersectObjects(this.state.renderer.scene.children, true);

    // Classify hit
    let hitPlayer = null, hitPoint = null, hitNormal = null;
    for (const hit of hits) {
      // Skip weapon mesh / own model
      if (hit.object.userData.isWeapon) continue;

      hitPoint  = hit.point;
      hitNormal = hit.face?.normal ?? new THREE.Vector3(0, 1, 0);

      if (hit.object.userData.playerId) {
        hitPlayer = {
          id:    hit.object.userData.playerId,
          zone:  hit.object.userData.hitzone ?? 'body',
          point: hit.point,
        };
      }
      break;
    }

    // Decrement ammo
    this.ammo[key]--;

    // Spray accumulate
    this.sprayLevel = Math.min(def.maxSpray, this.sprayLevel + def.sprayIncrement);

    // Recoil kick
    this.recoilOffset.set(
      (Math.random() - 0.5) * 0.01,
      def.sprayIncrement * 0.5,
      0.05
    );

    // Muzzle flash
    this.muzzleFlashTimer = 0.06;

    // Sound
    this.state.audio?.play(key + '_shot', { volume: 0.8 });

    // Particles — muzzle
    const barrelWorld = new THREE.Vector3();
    this.muzzleFlashMesh.getWorldPosition(barrelWorld);
    this.state.particles?.muzzleFlash(barrelWorld, dir);

    if (hitPoint) {
      // Wall impact sparks
      if (!hitPlayer) {
        this.state.particles?.bulletImpact(hitPoint, hitNormal);
        this.state.audio?.playAt('impact_wall', hitPoint, { volume: 0.5 });
      }

      // Shell casing
      this.state.particles?.shellCasing(origin, dir);
    }

    // Send to server
    this.state.network?.emit('player:shoot', {
      origin: { x: origin.x, y: origin.y, z: origin.z },
      direction: { x: dir.x, y: dir.y, z: dir.z },
      weaponId: key,
    });

    // HUD ammo update
    this.state.hud?.updateAmmo(this.ammo[key], this.reserve[key]);

    // Client-side hit prediction (server authoritative)
    if (hitPlayer) {
      this.state.hud?.showHitIndicator();
      this.state.particles?.bloodSplatter(hitPoint);
    }

    // Auto-reload if empty
    if (this.ammo[key] === 0) {
      setTimeout(() => this.startReload(), 100);
    }
  }

  getCurrentKey() {
    return WEAPON_ORDER[this.currentIndex];
  }
}
