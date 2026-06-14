// map.js — DUST_WEB v2 — Structured Dust2-inspired map with real architecture
import * as THREE from 'three';

export const SPAWN_CT = [
  {x:0,y:0,z:-42,yaw:Math.PI},{x:-6,y:0,z:-44,yaw:Math.PI},
  {x:6,y:0,z:-44,yaw:Math.PI},{x:-12,y:0,z:-42,yaw:Math.PI},
  {x:12,y:0,z:-42,yaw:Math.PI},
];
export const SPAWN_T = [
  {x:0,y:0,z:42,yaw:0},{x:-6,y:0,z:44,yaw:0},
  {x:6,y:0,z:44,yaw:0},{x:-12,y:0,z:42,yaw:0},
  {x:12,y:0,z:42,yaw:0},
];

export class GameMap {
  constructor(scene, renderer) {
    this.scene     = scene;
    this.renderer  = renderer;
    this.colliders = [];
    this.remotePlayers = {};
    this._mats = this._buildMaterials();
    this._build();
  }

  _buildMaterials() {
    // Procedural textures for variety
    const makeTex = (fn, size=256) => {
      const c=document.createElement('canvas'); c.width=c.height=size;
      const ctx=c.getContext('2d'); fn(ctx,size);
      const t=new THREE.CanvasTexture(c);
      t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
    };

    // Sand/dirt texture
    const sandTex = makeTex((ctx,s)=>{
      ctx.fillStyle='#c8a060'; ctx.fillRect(0,0,s,s);
      for(let i=0;i<3000;i++){
        const g=Math.random()*40-20;
        ctx.fillStyle=`rgba(${g>0?255:0},${g>0?200:0},0,${Math.abs(g)/80})`;
        ctx.fillRect(Math.random()*s,Math.random()*s,Math.random()*3+1,Math.random()*3+1);
      }
    },512);
    sandTex.repeat.set(4,4);

    // Concrete texture
    const concTex = makeTex((ctx,s)=>{
      ctx.fillStyle='#b0a090'; ctx.fillRect(0,0,s,s);
      for(let i=0;i<2000;i++){
        const v=Math.random()*30-15;
        ctx.fillStyle=`rgba(${128+v},${118+v},${108+v},0.4)`;
        ctx.fillRect(Math.random()*s,Math.random()*s,Math.random()*4+1,Math.random()*2+1);
      }
      // Mortar lines
      ctx.strokeStyle='rgba(80,70,60,0.3)'; ctx.lineWidth=1;
      for(let y=0;y<s;y+=24){ ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(s,y);ctx.stroke(); }
      for(let x=0;x<s;x+=48){ ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,s);ctx.stroke(); }
    },512);
    concTex.repeat.set(2,2);

    // Dark concrete
    const darkTex = makeTex((ctx,s)=>{
      ctx.fillStyle='#6a6055'; ctx.fillRect(0,0,s,s);
      for(let i=0;i<1500;i++){
        const v=Math.random()*20-10;
        ctx.fillStyle=`rgba(${80+v},${70+v},${60+v},0.5)`;
        ctx.fillRect(Math.random()*s,Math.random()*s,Math.random()*5+1,Math.random()*3+1);
      }
    },256);
    darkTex.repeat.set(3,3);

    return {
      ground:  new THREE.MeshStandardMaterial({map:sandTex, roughness:0.95, metalness:0}),
      wall:    new THREE.MeshStandardMaterial({map:concTex, roughness:0.85, metalness:0.02}),
      dark:    new THREE.MeshStandardMaterial({map:darkTex, roughness:0.9,  metalness:0.05}),
      trim:    new THREE.MeshStandardMaterial({color:0x8a7a60, roughness:0.7}),
      wood:    new THREE.MeshStandardMaterial({color:0x8B5E3C, roughness:0.9}),
      metal:   new THREE.MeshStandardMaterial({color:0x607080, roughness:0.4, metalness:0.8}),
      spawn_ct:new THREE.MeshBasicMaterial({color:0x2244cc, transparent:true, opacity:0.15, side:THREE.DoubleSide}),
      spawn_t: new THREE.MeshBasicMaterial({color:0xcc4422, transparent:true, opacity:0.15, side:THREE.DoubleSide}),
    };
  }

  _build() {
    this._buildGround();
    this._buildSky();
    this._buildArchitecture();
    this._buildBoundaries();
    this._buildProps();
    this._buildLights();
    this._buildSpawnZones();
  }

  _box(x,y,z, w,h,d, mat, shadow=true) {
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
    m.position.set(x,y+h/2,z);
    if(shadow){m.castShadow=true;m.receiveShadow=true;}
    this.scene.add(m);
    this.colliders.push({
      min:new THREE.Vector3(x-w/2,y,z-d/2),
      max:new THREE.Vector3(x+w/2,y+h,z+d/2)
    });
    return m;
  }

  _boxNC(x,y,z, w,h,d, mat) { // no collider
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
    m.position.set(x,y+h/2,z);
    m.castShadow=true; m.receiveShadow=true;
    this.scene.add(m); return m;
  }

  _buildGround() {
    // Main ground
    const g=new THREE.Mesh(new THREE.PlaneGeometry(120,120,32,32), this._mats.ground);
    g.rotation.x=-Math.PI/2; g.receiveShadow=true;
    this.scene.add(g);

    // Raised platform areas (bombsites feel)
    this._boxNC(-30,0,-30, 20,0.12,20, this._mats.dark);  // A site
    this._boxNC( 30,0, 30, 20,0.12,20, this._mats.dark);  // B site
  }

  _buildSky() {
    // Gradient sky dome
    const geo=new THREE.SphereGeometry(260,32,16);
    const canvas=document.createElement('canvas');
    canvas.width=4; canvas.height=512;
    const ctx=canvas.getContext('2d');
    const grad=ctx.createLinearGradient(0,0,0,512);
    grad.addColorStop(0,   '#3a70b0');
    grad.addColorStop(0.3, '#7aaad0');
    grad.addColorStop(0.6, '#d0b878');
    grad.addColorStop(0.8, '#c09050');
    grad.addColorStop(1,   '#a07030');
    ctx.fillStyle=grad; ctx.fillRect(0,0,4,512);
    const t=new THREE.CanvasTexture(canvas);
    this.scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({map:t,side:THREE.BackSide})));

    // Sun disc
    const sunGeo=new THREE.CircleGeometry(8,16);
    const sun=new THREE.Mesh(sunGeo, new THREE.MeshBasicMaterial({color:0xfff0c0}));
    sun.position.set(80,120,-80); sun.lookAt(0,0,0);
    this.scene.add(sun);
  }

  _buildArchitecture() {
    const W=this._mats.wall, D=this._mats.dark, T=this._mats.trim;

    // ── CT SPAWN AREA (south, z=-42 to -35) ──
    // Back wall
    this._box( 0, 0,-48, 30,4,1, W);
    // Side walls
    this._box(-15,0,-44,  1,4,8, W);
    this._box( 15,0,-44,  1,4,8, W);
    // Roof overhang above spawn
    this._boxNC(0,4,-44, 30,0.3,10, D);

    // ── T SPAWN AREA (north) ──
    this._box( 0,0, 48, 30,4,1, W);
    this._box(-15,0,44,  1,4,8, W);
    this._box( 15,0,44,  1,4,8, W);
    this._boxNC(0,4,44, 30,0.3,10, D);

    // ── LONG A CORRIDOR (left side, z from -38 to -5) ──
    this._box(-22,0,-22, 1,4,34, W);  // outer wall
    this._box(-14,0,-22, 1,4,34, W);  // inner wall
    // Roof
    this._boxNC(-18,4,-22, 8,0.3,34, D);
    // Mid-corridor box covers
    this._box(-20,0,-15, 3,1.2,2, W);
    this._box(-20,0,-8,  3,1.2,2, W);

    // ── A SITE (top left) ──
    // Main wall
    this._box(-28,0,-5, 1,4,16, W);
    this._box(-28,0, 8, 12,4,1, W);
    // Platform/ramp
    this._buildRamp(-22,0,-2, 5,1.2,6, W, 0);
    // Big cover box
    this._box(-26,0,2, 4,2.0,4, D);
    // Small box
    this._box(-20,0,5, 2,1.2,2, W);
    // Bombsite A crates
    this._buildCrateStack(-30,0,2);
    // Corner wall
    this._box(-20,0,-4, 1,4,4, W);

    // ── MID (center corridor) ──
    // Left mid wall
    this._box(-8,0,-10, 1,3,16, W);
    // Right mid wall
    this._box( 8,0,-10, 1,3,16, W);
    // Mid door/gap (open - no wall at center)
    this._box(-8,0, 5, 1,3,6, W);
    this._box( 8,0, 5, 1,3,6, W);
    // Mid platform box
    this._box( 0,0,-2, 3,1.0,3, D);
    // Roof over mid
    this._boxNC(0,3.5,-8, 16,0.3,24, D);
    // Arch supports
    this._box(-8,0,-10, 0.5,3.5,1, D);
    this._box( 8,0,-10, 0.5,3.5,1, D);

    // ── B TUNNELS (right side) ──
    this._box( 14,0,10, 1,4,30, W);
    this._box( 22,0,10, 1,4,30, W);
    this._boxNC(18,4,10, 8,0.3,30, D);
    // Tunnel cover boxes
    this._box( 18,0,5,  3,1.2,2, W);
    this._box( 18,0,15, 3,1.2,2, W);

    // ── B SITE (top right) ──
    this._box( 28,0,5, 1,4,16, W);
    this._box( 16,0,12, 12,4,1, W);
    // Platform
    this._buildRamp(22,0,8, 5,1.2,6, W, Math.PI);
    // Big box
    this._box( 26,0,2, 4,2.0,4, D);
    // Crates
    this._buildCrateStack(30,0,2);
    this._box( 20,0,4, 2,1.2,2, W);

    // ── CATWALK / HIGH GROUND (connects mid to A) ──
    this._box(-12,2,-2, 6,0.3,8, W);
    this._box(-9,0,-2, 1,2,8, D);  // support
    // Rail
    this._box(-12,2.8,-6, 6,0.8,0.15, D);

    // ── EXTRA COVER across mid ──
    this._box( 0,0,-20, 2,2,2, D);
    this._box(-4,0, 20, 2,2,2, D);
    this._box( 4,0,-28, 2,2,2, D);
    this._box( 0,0, 28, 3,1.2,3, W);

    // ── CONNECTOR rooms ──
    // CT → Mid connector
    this._box(-4,0,-32, 1,3,8, W);
    this._box( 4,0,-32, 1,3,8, W);
    this._boxNC(0,3,-32, 8,0.3,8, D);

    // T → Mid connector  
    this._box(-4,0,32, 1,3,8, W);
    this._box( 4,0,32, 1,3,8, W);
    this._boxNC(0,3,32, 8,0.3,8, D);

    // ── WINDOW ROOM (left mid) ──
    this._box(-8,1.2,-4, 3,0.3,2, D); // window ledge
    // Window frame
    this._boxNC(-8,2.4,-4, 3,0.5,0.15, D);
  }

  _buildRamp(x,y,z, w,h,d, mat, rotY=0) {
    const geo=new THREE.BoxGeometry(w,h,d);
    const m=new THREE.Mesh(geo,mat);
    m.position.set(x,y+h/2,z);
    m.rotation.y=rotY;
    m.castShadow=true; m.receiveShadow=true;
    this.scene.add(m);
    // Simplified flat collider for ramp
    this.colliders.push({
      min:new THREE.Vector3(x-w/2,y,z-d/2),
      max:new THREE.Vector3(x+w/2,y+h,z+d/2)
    });
  }

  _buildCrateStack(x,y,z) {
    const W=this._mats.wood;
    const D=this._mats.dark;
    // Bottom crate
    this._box(x,y,z, 2.4,1.2,2.4, W);
    // Top crate (offset)
    this._box(x+0.3,y+1.2,z-0.3, 1.8,1.2,1.8, D);
    // Small crate beside
    this._box(x-1.5,y,z+0.5, 1.4,0.8,1.4, W);
  }

  _buildBoundaries() {
    const W=this._mats.wall;
    this._box( 0,0,-60, 130,5,1, W);
    this._box( 0,0, 60, 130,5,1, W);
    this._box( 60,0,0,  1,5,130, W);
    this._box(-60,0,0,  1,5,130, W);
  }

  _buildProps() {
    // Barrels
    const barrelMat=this._mats.metal;
    const positions=[[5,-2,10],[18,3,-15],[-18,5,15],[-5,3,25],[10,-5,-30]];
    for(const [bx,bz,bz2] of positions){
      const geo=new THREE.CylinderGeometry(0.4,0.4,1.0,12);
      const m=new THREE.Mesh(geo,barrelMat);
      m.position.set(bx,0.5,bz);
      m.castShadow=true;
      this.scene.add(m);
      this.colliders.push({
        min:new THREE.Vector3(bx-0.4,0,bz-0.4),
        max:new THREE.Vector3(bx+0.4,1.0,bz+0.4),
      });
    }

    // Ground detail — scattered rocks
    const rockMat=new THREE.MeshStandardMaterial({color:0x887060,roughness:0.95});
    for(let i=0;i<40;i++){
      const s=0.15+Math.random()*0.45;
      const m=new THREE.Mesh(new THREE.DodecahedronGeometry(s,0),rockMat);
      m.position.set((Math.random()-0.5)*110,(s*0.3),(Math.random()-0.5)*110);
      m.rotation.set(Math.random()*Math.PI,Math.random()*Math.PI,Math.random()*Math.PI);
      m.castShadow=true;
      this.scene.add(m);
    }

    // Bombsite signs (A and B)
    this._makeBombsiteSign(-28,2.5,0,'A');
    this._makeBombsiteSign(28,2.5,8,'B');
  }

  _makeBombsiteSign(x,y,z,label){
    const canvas=document.createElement('canvas');
    canvas.width=128; canvas.height=128;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#ff8800';
    ctx.fillRect(0,0,128,128);
    ctx.fillStyle='#000';
    ctx.font='bold 90px monospace';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillText(label,64,64);
    const tex=new THREE.CanvasTexture(canvas);
    const m=new THREE.Mesh(
      new THREE.PlaneGeometry(1.5,1.5),
      new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide})
    );
    m.position.set(x,y,z);
    this.scene.add(m);
  }

  _buildLights() {
    // Ambient
    this.scene.add(new THREE.AmbientLight(0xffd090,0.5));
    // Sun
    const sun=new THREE.DirectionalLight(0xfff0d0,2.5);
    sun.position.set(50,100,40);
    sun.castShadow=true;
    sun.shadow.mapSize.width=4096;
    sun.shadow.mapSize.height=4096;
    sun.shadow.camera.near=1;
    sun.shadow.camera.far=400;
    sun.shadow.camera.left=-80;
    sun.shadow.camera.right=80;
    sun.shadow.camera.top=80;
    sun.shadow.camera.bottom=-80;
    sun.shadow.bias=-0.0005;
    this.scene.add(sun);
    // Fill
    const fill=new THREE.DirectionalLight(0x8090b0,0.4);
    fill.position.set(-30,40,-20);
    this.scene.add(fill);
    // Hemi
    this.scene.add(new THREE.HemisphereLight(0x80aacc,0xc0a060,0.25));
    // Interior point lights
    const pts=[[-18,3,-22],[-18,3,-8],[18,3,10],[18,3,20]];
    for(const [lx,ly,lz] of pts){
      const p=new THREE.PointLight(0xffe0a0,0.8,18);
      p.position.set(lx,ly,lz);
      this.scene.add(p);
    }
  }

  _buildSpawnZones() {
    const gCT=new THREE.Mesh(new THREE.PlaneGeometry(28,8),this._mats.spawn_ct);
    gCT.rotation.x=-Math.PI/2; gCT.position.set(0,0.01,-43);
    this.scene.add(gCT);
    const gT=new THREE.Mesh(new THREE.PlaneGeometry(28,8),this._mats.spawn_t);
    gT.rotation.x=-Math.PI/2; gT.position.set(0,0.01,43);
    this.scene.add(gT);
  }

  // ── REMOTE PLAYERS (humanoid characters) ──
  updateRemotePlayers(players, myId, myTeam) {
    const present=new Set(Object.keys(players));
    for(const id of Object.keys(this.remotePlayers)){
      if(!present.has(id)){ this.scene.remove(this.remotePlayers[id].group); delete this.remotePlayers[id]; }
    }
    for(const [id,p] of Object.entries(players)){
      if(id===myId||!p.position) continue;
      if(!this.remotePlayers[id]) this._createCharacter(id,p.team);
      const rp=this.remotePlayers[id];
      rp.group.visible=p.alive??true;
      const targetPos=new THREE.Vector3(p.position.x,p.position.y??0,p.position.z);
      rp.group.position.lerp(targetPos,0.3);
      if(p.yaw!==undefined) rp.group.rotation.y=p.yaw;
      // Weapon label update
      if(rp.weaponLabel&&p.weapon) rp.weaponLabel.userData.weapon=p.weapon;
    }
  }

  _createCharacter(id, team) {
    const isCT = team==='CT';
    const group = new THREE.Group();

    // Color palette
    const bodyColor  = isCT ? 0x2a4a8a : 0x6a2010;
    const armorColor = isCT ? 0x1a2a4a : 0x3a1008;
    const skinColor  = 0xd4a478;
    const gearColor  = 0x2a2a2a;

    const mat = (c,r=0.8,m=0.1)=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m});

    // ── TORSO ──
    const torso=new THREE.Mesh(new THREE.BoxGeometry(0.55,0.65,0.3),mat(bodyColor));
    torso.position.y=0.9; torso.castShadow=true;
    torso.userData.playerId=id; torso.userData.hitzone='body';
    group.add(torso);

    // Armor vest
    const vest=new THREE.Mesh(new THREE.BoxGeometry(0.58,0.5,0.28),mat(armorColor,0.9,0.15));
    vest.position.y=0.92; vest.castShadow=true;
    vest.userData.playerId=id; vest.userData.hitzone='body';
    group.add(vest);

    // Pouches on vest
    for(let i=-1;i<=1;i+=2){
      const pouch=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.12,0.06),mat(gearColor));
      pouch.position.set(i*0.18,0.88,0.17);
      group.add(pouch);
    }

    // ── HEAD ──
    const head=new THREE.Mesh(new THREE.BoxGeometry(0.38,0.38,0.36),mat(skinColor,0.9));
    head.position.y=1.42; head.castShadow=true;
    head.userData.playerId=id; head.userData.hitzone='head';
    group.add(head);

    // Helmet
    const helmetGeo=new THREE.SphereGeometry(0.22,12,8,0,Math.PI*2,0,Math.PI*0.6);
    const helmet=new THREE.Mesh(helmetGeo,mat(armorColor,0.7,0.2));
    helmet.position.y=1.52;
    group.add(helmet);

    // Visor/goggles
    const visor=new THREE.Mesh(new THREE.BoxGeometry(0.32,0.08,0.06),mat(0x1a3a6a,0.2,0.5));
    visor.position.set(0,1.47,0.19);
    group.add(visor);

    // Ears/ear protection
    for(let i=-1;i<=1;i+=2){
      const ear=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,0.04,8),mat(gearColor));
      ear.rotation.z=Math.PI/2;
      ear.position.set(i*0.22,1.44,0);
      group.add(ear);
    }

    // Face details
    const leftEye=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.04,0.02),mat(0x222244,0.3));
    leftEye.position.set(-0.08,1.45,0.19);
    group.add(leftEye);
    const rightEye=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.04,0.02),mat(0x222244,0.3));
    rightEye.position.set(0.08,1.45,0.19);
    group.add(rightEye);

    // ── ARMS ──
    for(let side=-1;side<=1;side+=2){
      // Upper arm
      const uArm=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.085,0.35,8),mat(bodyColor));
      uArm.position.set(side*0.35,0.98,0);
      uArm.castShadow=true;
      uArm.userData.playerId=id; uArm.userData.hitzone='body';
      group.add(uArm);
      // Lower arm
      const lArm=new THREE.Mesh(new THREE.CylinderGeometry(0.075,0.07,0.3,8),mat(skinColor));
      lArm.position.set(side*0.35,0.65,0.06);
      lArm.rotation.x=0.3;
      lArm.castShadow=true;
      group.add(lArm);
      // Hand
      const hand=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.1,0.12),mat(skinColor));
      hand.position.set(side*0.35,0.5,0.14);
      group.add(hand);
    }

    // ── LEGS ──
    for(let side=-1;side<=1;side+=2){
      const pantsColor=isCT?0x1a2a3a:0x2a1808;
      // Upper leg
      const uLeg=new THREE.Mesh(new THREE.CylinderGeometry(0.13,0.11,0.45,8),mat(pantsColor));
      uLeg.position.set(side*0.14,0.37,0);
      uLeg.castShadow=true;
      uLeg.userData.playerId=id; uLeg.userData.hitzone='legs';
      group.add(uLeg);
      // Lower leg
      const lLeg=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.09,0.4,8),mat(pantsColor));
      lLeg.position.set(side*0.14,0.0,0);
      lLeg.castShadow=true;
      lLeg.userData.playerId=id; lLeg.userData.hitzone='legs';
      group.add(lLeg);
      // Boot
      const boot=new THREE.Mesh(new THREE.BoxGeometry(0.14,0.12,0.24),mat(gearColor,0.9));
      boot.position.set(side*0.14,-0.2,0.04);
      group.add(boot);
    }

    // ── NAME TAG (sprite-like) ──
    const nameCanvas=document.createElement('canvas');
    nameCanvas.width=256; nameCanvas.height=64;
    const nCtx=nameCanvas.getContext('2d');
    nCtx.fillStyle=isCT?'rgba(40,80,200,0.85)':'rgba(200,50,20,0.85)';
    nCtx.roundRect(4,4,248,56,8);
    nCtx.fill();
    nCtx.fillStyle='#fff';
    nCtx.font='bold 28px monospace';
    nCtx.textAlign='center';
    nCtx.textBaseline='middle';
    nCtx.fillText(id.slice(0,8),128,32);
    const nameTex=new THREE.CanvasTexture(nameCanvas);
    const nameSprite=new THREE.Mesh(
      new THREE.PlaneGeometry(1.2,0.3),
      new THREE.MeshBasicMaterial({map:nameTex,transparent:true,depthTest:false})
    );
    nameSprite.position.y=1.9;
    nameSprite.renderOrder=999;
    group.add(nameSprite);

    group.position.set(0,0,0);
    this.scene.add(group);
    this.remotePlayers[id]={group,nameSprite};
  }

  getColliders() { return this.colliders; }
  getSpawnForTeam(team,index=0){
    const s=team==='CT'?SPAWN_CT:SPAWN_T;
    return s[index%s.length];
  }
}
