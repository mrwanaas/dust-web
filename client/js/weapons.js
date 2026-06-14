// weapons.js — v2: Detailed weapon models, improved recoil, buy menu integration
import * as THREE from 'three';

const WEAPONS = {
  glock: {
    id:'glock', name:'Glock-18', damage:18, headshotMult:4,
    magSize:20, reserveAmmo:120, fireRate:400, reloadTime:2.2,
    spread:0.01, sprayIncrement:0.006, maxSpray:0.07, auto:true,
    icon:'GLOCK', price:0, color:0x2a2a2a,
  },
  deagle: {
    id:'deagle', name:'Desert Eagle', damage:63, headshotMult:4,
    magSize:7, reserveAmmo:35, fireRate:267, reloadTime:2.0,
    spread:0.005, sprayIncrement:0.045, maxSpray:0.14, auto:false,
    icon:'DEagle', price:700, color:0x7a6a50,
  },
  mp5: {
    id:'mp5', name:'MP5-SD', damage:20, headshotMult:4,
    magSize:30, reserveAmmo:120, fireRate:800, reloadTime:2.1,
    spread:0.01, sprayIncrement:0.004, maxSpray:0.055, auto:true,
    icon:'MP5', price:1500, color:0x1a1a1a,
  },
  ak47: {
    id:'ak47', name:'AK-47', damage:36, headshotMult:4,
    magSize:30, reserveAmmo:90, fireRate:600, reloadTime:2.5,
    spread:0.012, sprayIncrement:0.008, maxSpray:0.09, auto:true,
    icon:'AK-47', price:2700, color:0x8a5020,
  },
  m4a1: {
    id:'m4a1', name:'M4A1-S', damage:29, headshotMult:4,
    magSize:25, reserveAmmo:75, fireRate:800, reloadTime:2.1,
    spread:0.008, sprayIncrement:0.005, maxSpray:0.06, auto:true,
    icon:'M4A1', price:3100, color:0x303030,
  },
  awp: {
    id:'awp', name:'AWP', damage:115, headshotMult:4,
    magSize:10, reserveAmmo:30, fireRate:67, reloadTime:3.7,
    spread:0.002, sprayIncrement:0.08, maxSpray:0.15, auto:false,
    icon:'AWP', price:4750, color:0x1a3a1a,
  },
};

const WEAPON_ORDER = ['glock','deagle','mp5','ak47','m4a1','awp'];

export class WeaponSystem {
  constructor(state) {
    this.state   = state;
    this.scene   = state.renderer.scene;
    this.camera  = state.renderer.camera;
    this.pivot   = state.renderer.weaponPivot;

    this.currentIndex  = 0;
    this.currentWeapon = null;
    this.ammo    = {};
    this.reserve = {};

    this.isFiring    = false;
    this.isReloading = false;
    this.reloadTimer = 0;
    this.fireTimer   = 0;
    this.sprayLevel  = 0;

    this.weaponMeshes = {};
    this.muzzleFlashMesh = null;
    this.muzzleFlashTimer = 0;
    this.recoilOffset = new THREE.Vector3();

    // Sway
    this.swayX = 0; this.swayY = 0;
    this.swayTargetX = 0; this.swayTargetY = 0;
  }

  init() {
    for(const key of WEAPON_ORDER){
      this.ammo[key]    = WEAPONS[key].magSize;
      this.reserve[key] = WEAPONS[key].reserveAmmo;
    }
    this._buildWeaponModels();
    this.switchTo(0);
  }

  _buildWeaponModels() {
    for(const key of WEAPON_ORDER){
      const def=WEAPONS[key];
      const group=new THREE.Group();
      group.userData.isWeapon=true;

      const mat=(c,r=0.5,m=0.7)=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m});
      const mainMat=mat(def.color,0.5,0.7);
      const darkMat=mat(0x111111,0.6,0.8);
      const woodMat=mat(0x6b3a1f,0.9,0.05);
      const gripMat=mat(0x1a1a1a,0.95,0.05);

      if(key==='glock'){
        // Slide
        const slide=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.055,0.28),mainMat);
        slide.position.set(0,0.01,0); group.add(slide);
        // Frame
        const frame=new THREE.Mesh(new THREE.BoxGeometry(0.045,0.04,0.22),darkMat);
        frame.position.set(0,-0.015,0.01); group.add(frame);
        // Grip
        const grip=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.11,0.07),gripMat);
        grip.position.set(0,-0.07,0.1); grip.rotation.x=-0.12; group.add(grip);
        // Barrel
        const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.009,0.009,0.06,8),darkMat);
        barrel.rotation.z=Math.PI/2; barrel.position.set(0,0.005,-0.17); group.add(barrel);
        // Trigger guard
        const tg=new THREE.Mesh(new THREE.TorusGeometry(0.018,0.005,6,8,Math.PI),darkMat);
        tg.rotation.x=Math.PI/2; tg.position.set(0,-0.025,0.06); group.add(tg);
        // Sight
        const sight=new THREE.Mesh(new THREE.BoxGeometry(0.008,0.015,0.02),darkMat);
        sight.position.set(0,0.04,-0.08); group.add(sight);

      } else if(key==='deagle'){
        // Main body
        const body=new THREE.Mesh(new THREE.BoxGeometry(0.065,0.07,0.32),mainMat);
        group.add(body);
        // Barrel extension
        const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.014,0.014,0.1,10),darkMat);
        barrel.rotation.z=Math.PI/2; barrel.position.set(0,0.01,-0.21); group.add(barrel);
        // Muzzle
        const muzzle=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.016,0.03,10),darkMat);
        muzzle.rotation.z=Math.PI/2; muzzle.position.set(0,0.01,-0.265); group.add(muzzle);
        // Grip
        const grip=new THREE.Mesh(new THREE.BoxGeometry(0.055,0.14,0.085),gripMat);
        grip.position.set(0,-0.1,0.1); grip.rotation.x=-0.15; group.add(grip);
        // Hammer
        const hammer=new THREE.Mesh(new THREE.BoxGeometry(0.015,0.03,0.02),darkMat);
        hammer.position.set(0,0.05,0.13); group.add(hammer);
        // Trigger
        const trigger=new THREE.Mesh(new THREE.BoxGeometry(0.01,0.035,0.01),darkMat);
        trigger.position.set(0,-0.01,0.06); group.add(trigger);
        // Sights
        const rs=new THREE.Mesh(new THREE.BoxGeometry(0.012,0.02,0.025),darkMat);
        rs.position.set(0,0.048,-0.06); group.add(rs);

      } else if(key==='mp5'){
        // Receiver
        const recv=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.065,0.44),darkMat);
        group.add(recv);
        // Handguard
        const hg=new THREE.Mesh(new THREE.BoxGeometry(0.055,0.055,0.18),mat(0x222222,0.8));
        hg.position.set(0,0,-0.1); group.add(hg);
        // Suppressor
        const supp=new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.022,0.2,12),mat(0x333333,0.7,0.5));
        supp.rotation.z=Math.PI/2; supp.position.set(0,0.002,-0.32); group.add(supp);
        // Stock (folded)
        const stock=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.04,0.14),darkMat);
        stock.position.set(0,-0.02,0.29); group.add(stock);
        // Mag (curved)
        const mag=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.18,0.055),mat(0x1a1a1a,0.8));
        mag.position.set(0,-0.11,0.06); mag.rotation.x=0.18; group.add(mag);
        // Grip
        const grip=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.11,0.065),gripMat);
        grip.position.set(0,-0.08,0.18); group.add(grip);

      } else if(key==='ak47'){
        // Receiver
        const recv=new THREE.Mesh(new THREE.BoxGeometry(0.065,0.065,0.5),mainMat);
        group.add(recv);
        // Gas tube
        const gas=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.28,8),darkMat);
        gas.rotation.z=Math.PI/2; gas.position.set(0,0.04,-0.12); group.add(gas);
        // Barrel
        const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.013,0.013,0.3,10),darkMat);
        barrel.rotation.z=Math.PI/2; barrel.position.set(0,0.003,-0.37); group.add(barrel);
        // Muzzle brake
        const muzzle=new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.018,0.05,10),darkMat);
        muzzle.rotation.z=Math.PI/2; muzzle.position.set(0,0.003,-0.5); group.add(muzzle);
        // Curved magazine (iconic AK)
        const mag=new THREE.Mesh(new THREE.BoxGeometry(0.048,0.22,0.068),mat(0x1a1a1a,0.85));
        mag.position.set(0,-0.12,0.04); mag.rotation.x=0.22; group.add(mag);
        // Stock
        const stock=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.05,0.24),woodMat);
        stock.position.set(0,-0.01,0.32); group.add(stock);
        // Handguard (wood)
        const hg=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.045,0.2),woodMat);
        hg.position.set(0,-0.01,-0.1); group.add(hg);
        // Pistol grip
        const grip=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.12,0.07),woodMat);
        grip.position.set(0,-0.09,0.16); grip.rotation.x=-0.12; group.add(grip);
        // Sight
        const sight=new THREE.Mesh(new THREE.BoxGeometry(0.01,0.022,0.14),darkMat);
        sight.position.set(0,0.05,0); group.add(sight);
        // Front sight post
        const fsp=new THREE.Mesh(new THREE.BoxGeometry(0.01,0.035,0.01),darkMat);
        fsp.position.set(0,0.055,-0.2); group.add(fsp);

      } else if(key==='m4a1'){
        // Receiver
        const recv=new THREE.Mesh(new THREE.BoxGeometry(0.062,0.062,0.46),darkMat);
        group.add(recv);
        // Suppressor
        const supp=new THREE.Mesh(new THREE.CylinderGeometry(0.024,0.024,0.22,12),mat(0x2a2a2a,0.6,0.5));
        supp.rotation.z=Math.PI/2; supp.position.set(0,0.002,-0.34); group.add(supp);
        // Rail system
        const rail=new THREE.Mesh(new THREE.BoxGeometry(0.058,0.06,0.2),mat(0x222222,0.7));
        rail.position.set(0,-0.005,-0.08); group.add(rail);
        // Rail top
        const railT=new THREE.Mesh(new THREE.BoxGeometry(0.015,0.01,0.3),mat(0x444444,0.5,0.5));
        railT.position.set(0,0.035,-0.02); group.add(railT);
        // Mag (straight)
        const mag=new THREE.Mesh(new THREE.BoxGeometry(0.044,0.19,0.06),mat(0x1a1a1a,0.85));
        mag.position.set(0,-0.115,0.06); group.add(mag);
        // Stock (telescoping)
        const stock=new THREE.Mesh(new THREE.BoxGeometry(0.055,0.045,0.2),darkMat);
        stock.position.set(0,-0.005,0.3); group.add(stock);
        // Grip
        const grip=new THREE.Mesh(new THREE.BoxGeometry(0.048,0.12,0.065),gripMat);
        grip.position.set(0,-0.09,0.15); group.add(grip);
        // Red dot sight
        const rdot=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.04,0.06),mat(0x111111,0.4,0.5));
        rdot.position.set(0,0.055,0.06); group.add(rdot);
        // Dot lens
        const lens=new THREE.Mesh(new THREE.CircleGeometry(0.012,8),mat(0xff2200,0.1,0.1));
        lens.position.set(0,0.058,-0.06); group.add(lens);

      } else if(key==='awp'){
        // Body
        const body=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.072,0.65),mainMat);
        group.add(body);
        // Long barrel
        const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.015,0.35,10),darkMat);
        barrel.rotation.z=Math.PI/2; barrel.position.set(0,0.005,-0.5); group.add(barrel);
        // Muzzle
        const muzzle=new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.018,0.04,10),darkMat);
        muzzle.rotation.z=Math.PI/2; muzzle.position.set(0,0.005,-0.67); group.add(muzzle);
        // Scope (iconic AWP)
        const scope=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.28,12),mat(0x111111,0.3,0.7));
        scope.rotation.z=Math.PI/2; scope.position.set(0,0.065,-0.02); group.add(scope);
        // Scope mounts
        for(const sx of[-0.08,0.08]){
          const mount=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.04,0.06),darkMat);
          mount.position.set(0,0.04,sx); group.add(mount);
        }
        // Scope lens
        const lens=new THREE.Mesh(new THREE.CircleGeometry(0.025,12),mat(0x1a3a6a,0.1,0.3));
        lens.rotation.z=Math.PI/2; lens.position.set(0.06,0.065,-0.02); group.add(lens);
        // Stock (green/black)
        const stock=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.065,0.22),mat(0x1a2a10,0.9));
        stock.position.set(0,-0.002,0.38); group.add(stock);
        // Cheek rest
        const cheek=new THREE.Mesh(new THREE.BoxGeometry(0.055,0.04,0.12),mat(0x1a2a10,0.9));
        cheek.position.set(0,0.05,0.32); group.add(cheek);
        // Mag
        const mag=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.14,0.065),mat(0x222222,0.85));
        mag.position.set(0,-0.1,0.08); group.add(mag);
        // Grip
        const grip=new THREE.Mesh(new THREE.BoxGeometry(0.055,0.13,0.07),gripMat);
        grip.position.set(0,-0.1,0.2); grip.rotation.x=-0.1; group.add(grip);
        // Bipod (folded)
        for(const bx of[-0.02,0.02]){
          const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.005,0.005,0.15,6),darkMat);
          leg.position.set(bx,-0.045,-0.24); leg.rotation.x=0.8; group.add(leg);
        }
      }

      // All weapons share this muzzle flash
      group.position.set(0.22,-0.22,-0.35);
      group.visible=false;
      this.pivot.add(group);
      this.weaponMeshes[key]=group;
    }

    // Shared muzzle flash
    const flashMat=new THREE.MeshBasicMaterial({
      color:0xffaa00, transparent:true, opacity:0,
      side:THREE.DoubleSide, blending:THREE.AdditiveBlending, depthWrite:false,
    });
    this.muzzleFlashMesh=new THREE.Mesh(new THREE.PlaneGeometry(0.18,0.18),flashMat);
    this.muzzleFlashMesh.position.set(0.22,-0.17,-0.72);
    this.pivot.add(this.muzzleFlashMesh);

    // Ambient hand (left visible arm)
    const handMat=new THREE.MeshStandardMaterial({color:0xd4a478,roughness:0.9});
    const leftHand=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.1,0.14),handMat);
    leftHand.position.set(-0.06,-0.22,-0.28);
    leftHand.userData.isWeapon=true;
    this.pivot.add(leftHand);

    const leftForearm=new THREE.Mesh(new THREE.CylinderGeometry(0.038,0.035,0.22,8),
      new THREE.MeshStandardMaterial({color:0x2a2a3a,roughness:0.8}));
    leftForearm.position.set(-0.07,-0.13,-0.18);
    leftForearm.userData.isWeapon=true;
    this.pivot.add(leftForearm);
  }

  switchTo(index) {
    const newKey=WEAPON_ORDER[index];
    if(!newKey||this.isReloading) return;
    for(const key of WEAPON_ORDER)
      if(this.weaponMeshes[key]) this.weaponMeshes[key].visible=false;
    this.currentIndex  = index;
    this.currentWeapon = WEAPONS[newKey];
    this.sprayLevel    = 0;
    this.isReloading   = false;
    this.reloadTimer   = 0;
    this.fireTimer     = 0;
    if(this.weaponMeshes[newKey]) this.weaponMeshes[newKey].visible=true;
    this.state.hud?.updateWeapon(newKey, this.ammo[newKey], this.reserve[newKey]);
  }

  switchToWeapon(weaponId) {
    const idx=WEAPON_ORDER.indexOf(weaponId);
    if(idx>=0) this.switchTo(idx);
  }

  scrollSwitch(dir) {
    const next=((this.currentIndex+dir)+WEAPON_ORDER.length)%WEAPON_ORDER.length;
    this.switchTo(next);
  }

  startFiring()  { this.isFiring=true; }
  stopFiring()   { this.isFiring=false; }

  startReload() {
    if(this.isReloading) return;
    const key=WEAPON_ORDER[this.currentIndex];
    if(this.ammo[key]>=this.currentWeapon.magSize) return;
    if(this.reserve[key]<=0) return;
    this.isReloading=true;
    this.reloadTimer=this.currentWeapon.reloadTime;
    this.isFiring=false;
    document.getElementById('reload-indicator').classList.remove('hidden');
    this.state.audio?.play('reload_start');
  }

  resetAmmo() {
    for(const key of WEAPON_ORDER){
      this.ammo[key]    = WEAPONS[key].magSize;
      this.reserve[key] = WEAPONS[key].reserveAmmo;
    }
    this.isReloading=false;
    this.reloadTimer=0;
    const key=WEAPON_ORDER[this.currentIndex];
    this.state.hud?.updateAmmo(this.ammo[key],this.reserve[key]);
  }

  update(dt) {
    if(!this.currentWeapon) return;
    const key=WEAPON_ORDER[this.currentIndex];

    // Sway
    this.swayTargetX = this.state.mouseDX * 0.0008;
    this.swayTargetY = this.state.mouseDY * 0.0005;
    this.swayX += (this.swayTargetX - this.swayX) * Math.min(dt*6,1);
    this.swayY += (this.swayTargetY - this.swayY) * Math.min(dt*6,1);
    if(this.weaponMeshes[key]){
      this.weaponMeshes[key].rotation.y = this.swayX * 0.3;
      this.weaponMeshes[key].rotation.x = this.swayY * 0.2 + this.recoilOffset.y;
      this.weaponMeshes[key].position.z = -0.35 + this.recoilOffset.z;
    }

    // Reload
    if(this.isReloading){
      this.reloadTimer-=dt;
      if(this.reloadTimer<=0){
        this.isReloading=false;
        document.getElementById('reload-indicator').classList.add('hidden');
        const needed=this.currentWeapon.magSize-this.ammo[key];
        const given=Math.min(needed,this.reserve[key]);
        this.ammo[key]+=given;
        this.reserve[key]-=given;
        this.state.audio?.play('reload_end');
        this.state.hud?.updateAmmo(this.ammo[key],this.reserve[key]);
      }
      return;
    }

    const fireInterval=60/this.currentWeapon.fireRate;
    this.fireTimer=Math.max(0,this.fireTimer-dt);

    if(this.isFiring&&this.fireTimer<=0&&!this.isReloading){
      if(this.ammo[key]>0){
        this._fire(key);
        this.fireTimer=fireInterval;
        if(!this.currentWeapon.auto) this.isFiring=false;
      } else {
        if(this.fireTimer<=0){
          this.state.audio?.play('empty');
          this.fireTimer=0.25;
          this.startReload();
        }
      }
    }

    this.sprayLevel=Math.max(0,this.sprayLevel-(this.isFiring?2:20)*dt);
    this.recoilOffset.lerp(new THREE.Vector3(0,0,0), Math.min(dt*8,1));

    // Muzzle flash
    if(this.muzzleFlashTimer>0){
      this.muzzleFlashTimer-=dt;
      const t=this.muzzleFlashTimer/0.05;
      this.muzzleFlashMesh.material.opacity=t*0.95;
      const s=0.7+t*0.6;
      this.muzzleFlashMesh.scale.set(s,s,1);
      this.muzzleFlashMesh.rotation.z=Math.random()*Math.PI*2;
    } else {
      this.muzzleFlashMesh.material.opacity=0;
    }
  }

  _fire(key) {
    const def=this.currentWeapon;
    const spreadTotal=def.spread+this.sprayLevel;
    const bx=(Math.random()-0.5)*spreadTotal;
    const by=(Math.random()-0.5)*spreadTotal - this.sprayLevel*0.4;

    const camera=this.state.renderer.camera;
    const dir=new THREE.Vector3(bx,by,-1).applyQuaternion(camera.quaternion).normalize();
    const origin=camera.position.clone();

    const raycaster=new THREE.Raycaster(origin,dir,0.1,200);
    const meshes=[];
    this.state.renderer.scene.traverse(obj=>{ if(obj.isMesh&&!obj.userData.isWeapon) meshes.push(obj); });
    const hits=raycaster.intersectObjects(meshes,false);

    let hitPlayer=null, hitPoint=null, hitNormal=null;
    for(const hit of hits){
      if(hit.object.userData.isWeapon) continue;
      hitPoint=hit.point;
      hitNormal=hit.face?.normal??new THREE.Vector3(0,1,0);
      if(hit.object.userData.playerId){
        hitPlayer={ id:hit.object.userData.playerId, zone:hit.object.userData.hitzone??'body', point:hit.point };
      }
      break;
    }

    this.ammo[key]--;
    this.sprayLevel=Math.min(def.maxSpray,this.sprayLevel+def.sprayIncrement);
    this.recoilOffset.set((Math.random()-0.5)*0.008, def.sprayIncrement*0.6, 0.06);
    this.muzzleFlashTimer=0.05;

    // Sounds
    this.state.audio?.play(key+'_shot',{volume:0.9});

    // Particles
    const flashPos=new THREE.Vector3();
    this.muzzleFlashMesh.getWorldPosition(flashPos);
    this.state.particles?.muzzleFlash(flashPos,dir);

    if(hitPoint){
      if(!hitPlayer){ this.state.particles?.bulletImpact(hitPoint,hitNormal); }
      this.state.particles?.shellCasing(origin,dir);
    }

    this.state.network?.emit('player:shoot',{
      origin:{x:origin.x,y:origin.y,z:origin.z},
      direction:{x:dir.x,y:dir.y,z:dir.z},
      weaponId:key,
    });

    if(hitPlayer){
      this.state.hud?.showHitIndicator(hitPlayer.zone==='head');
      this.state.particles?.bloodSplatter(hitPlayer.point);
    }

    this.state.hud?.updateAmmo(this.ammo[key],this.reserve[key]);
    if(this.ammo[key]===0) setTimeout(()=>this.startReload(),100);
  }

  getCurrentKey() { return WEAPON_ORDER[this.currentIndex]; }
  getWeaponData() { return WEAPONS; }
  getWeaponOrder(){ return WEAPON_ORDER; }
}
