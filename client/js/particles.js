// particles.js — Particle System (muzzle flash, impact, blood, shell casings)
import * as THREE from 'three';

class Particle {
  constructor(pos, vel, color, size, life, gravity = -4) {
    this.pos      = pos.clone();
    this.vel      = vel.clone();
    this.color    = color;
    this.size     = size;
    this.life     = life;
    this.maxLife  = life;
    this.gravity  = gravity;
    this.alive    = true;
  }

  update(dt) {
    this.vel.y += this.gravity * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.life -= dt;
    if (this.life <= 0) this.alive = false;
  }

  get alpha() { return Math.max(0, this.life / this.maxLife); }
}

export class ParticleSystem {
  constructor(scene) {
    this.scene    = scene;
    this.particles = [];

    // Single shared Points object (up to 2000 particles)
    this.MAX = 2000;
    this._positions = new Float32Array(this.MAX * 3);
    this._colors    = new Float32Array(this.MAX * 3);
    this._sizes     = new Float32Array(this.MAX);

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this._positions, 3));
    this.geo.setAttribute('color',    new THREE.BufferAttribute(this._colors,    3));
    this.geo.setAttribute('size',     new THREE.BufferAttribute(this._sizes,     1));

    this.mat = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(this.geo, this.mat);
    scene.add(this.points);

    // Shell casings as separate meshes
    this.casings = [];
  }

  // ── API ──

  muzzleFlash(pos, dir) {
    const c = new THREE.Color(1, 0.7, 0.1);
    for (let i = 0; i < 12; i++) {
      const spread = 0.12;
      const vel = dir.clone().multiplyScalar(3 + Math.random() * 4)
        .add(new THREE.Vector3(
          (Math.random()-0.5)*spread,
          (Math.random()-0.5)*spread,
          (Math.random()-0.5)*spread
        ));
      this.particles.push(new Particle(pos, vel, c.clone(), 0.06 + Math.random()*0.04, 0.04 + Math.random()*0.04, 0));
    }

    // Smoke puff (grey, slow)
    const smoke = new THREE.Color(0.5, 0.5, 0.5);
    for (let i = 0; i < 5; i++) {
      const vel = dir.clone().multiplyScalar(0.5)
        .add(new THREE.Vector3((Math.random()-0.5)*0.3, 0.3+Math.random()*0.3, (Math.random()-0.5)*0.3));
      this.particles.push(new Particle(pos, vel, smoke.clone(), 0.1+Math.random()*0.08, 0.25+Math.random()*0.15, -0.5));
    }
  }

  bulletImpact(pos, normal) {
    const c = new THREE.Color(1, 0.8, 0.2); // sparks
    for (let i = 0; i < 10; i++) {
      const vel = normal.clone().multiplyScalar(1 + Math.random() * 3)
        .add(new THREE.Vector3(
          (Math.random()-0.5)*2,
          Math.random()*2,
          (Math.random()-0.5)*2
        ));
      this.particles.push(new Particle(pos, vel, c.clone(), 0.04+Math.random()*0.03, 0.2+Math.random()*0.15, -8));
    }
    // Dust
    const dust = new THREE.Color(0.7, 0.6, 0.4);
    for (let i = 0; i < 6; i++) {
      const vel = new THREE.Vector3(
        (Math.random()-0.5)*1.2,
        0.5+Math.random()*0.8,
        (Math.random()-0.5)*1.2
      );
      this.particles.push(new Particle(pos, vel, dust.clone(), 0.07+Math.random()*0.05, 0.3+Math.random()*0.2, -1));
    }
  }

  bloodSplatter(pos) {
    const c = new THREE.Color(0.7, 0.05, 0.05);
    for (let i = 0; i < 14; i++) {
      const vel = new THREE.Vector3(
        (Math.random()-0.5)*3,
        Math.random()*3,
        (Math.random()-0.5)*3
      );
      this.particles.push(new Particle(pos, vel, c.clone(), 0.05+Math.random()*0.04, 0.3+Math.random()*0.2, -6));
    }
  }

  shellCasing(origin, dir) {
    // Eject a shell casing (small box)
    const casingGeo = new THREE.BoxGeometry(0.015, 0.035, 0.015);
    const casingMat = new THREE.MeshStandardMaterial({ color: 0xd4aa30, roughness: 0.4, metalness: 0.8 });
    const casing = new THREE.Mesh(casingGeo, casingMat);
    casing.position.copy(origin).add(
      new THREE.Vector3(0.15, -0.1, 0).applyQuaternion(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), Math.atan2(dir.x, dir.z))
      )
    );

    const vel = new THREE.Vector3(
      (Math.random()-0.5)*2 + dir.z*0.5,
      1.5 + Math.random(),
      (Math.random()-0.5)*2 - dir.x*0.5
    );
    const spin = new THREE.Vector3(Math.random()*20, Math.random()*20, Math.random()*20);

    this.scene.add(casing);
    this.casings.push({ mesh: casing, vel, spin, life: 2.0 });
  }

  smokeGrenade(pos) {
    const c = new THREE.Color(0.6, 0.6, 0.6);
    for (let i = 0; i < 60; i++) {
      const vel = new THREE.Vector3(
        (Math.random()-0.5)*1.5,
        0.8+Math.random()*0.8,
        (Math.random()-0.5)*1.5
      );
      this.particles.push(new Particle(
        pos.clone().add(new THREE.Vector3((Math.random()-0.5)*0.5, 0, (Math.random()-0.5)*0.5)),
        vel, c.clone(),
        0.15+Math.random()*0.12,
        2+Math.random()*1.5,
        -0.2
      ));
    }
  }

  // ── UPDATE ──
  update(dt) {
    // Update particles
    let alive = this.particles.filter(p => {
      p.update(dt);
      return p.alive;
    });
    this.particles = alive;

    // Upload to GPU
    const n = Math.min(this.particles.length, this.MAX);
    for (let i = 0; i < n; i++) {
      const p = this.particles[i];
      this._positions[i*3]   = p.pos.x;
      this._positions[i*3+1] = p.pos.y;
      this._positions[i*3+2] = p.pos.z;
      this._colors[i*3]   = p.color.r * p.alpha;
      this._colors[i*3+1] = p.color.g * p.alpha;
      this._colors[i*3+2] = p.color.b * p.alpha;
      this._sizes[i] = p.size;
    }
    // Zero out rest
    for (let i = n; i < this.MAX; i++) {
      this._positions[i*3] = this._positions[i*3+1] = this._positions[i*3+2] = 0;
      this._sizes[i] = 0;
    }

    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate    = true;
    this.geo.attributes.size.needsUpdate     = true;
    this.geo.setDrawRange(0, n);

    // Shell casings physics
    this.casings = this.casings.filter(c => {
      c.vel.y -= 9 * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.y += c.spin.y * dt;
      c.mesh.rotation.z += c.spin.z * dt;

      // Bounce
      if (c.mesh.position.y < 0.02) {
        c.mesh.position.y = 0.02;
        c.vel.y *= -0.35;
        c.vel.x *= 0.6;
        c.vel.z *= 0.6;
        c.spin.multiplyScalar(0.5);
      }

      c.life -= dt;
      if (c.life <= 0) {
        this.scene.remove(c.mesh);
        return false;
      }
      return true;
    });
  }
}
