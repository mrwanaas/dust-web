// audio.js — v2: More realistic procedural sounds
import * as THREE from 'three';

export class AudioEngine {
  constructor(camera) {
    this.camera=camera;
    this.ctx=null;
    this.master=null;
    this.masterVolume=0.7;
    this.buffers={};
    this._ready=false;
  }

  init() {
    const start=()=>{
      if(this._ready) return;
      this._ready=true;
      document.removeEventListener('click',start);
      this.ctx=new(window.AudioContext||window.webkitAudioContext)();
      this.master=this.ctx.createGain();
      this.master.gain.value=this.masterVolume;
      this.master.connect(this.ctx.destination);
      this._generateSounds();
    };
    document.addEventListener('click',start);
  }

  setMasterVolume(v){ this.masterVolume=v; if(this.master) this.master.gain.value=v; }

  play(name,opts={}){
    if(!this.ctx||!this.buffers[name]) return;
    const {volume=1,detune=0}=opts;
    const src=this.ctx.createBufferSource();
    src.buffer=this.buffers[name];
    src.detune.value=detune+(Math.random()-0.5)*40;
    const gain=this.ctx.createGain(); gain.gain.value=volume;
    src.connect(gain); gain.connect(this.master); src.start();
  }

  playAt(name,position,opts={}){
    if(!this.ctx||!this.buffers[name]) return;
    const {volume=1}=opts;
    const panner=this.ctx.createPanner();
    panner.panningModel='HRTF';
    panner.distanceModel='inverse';
    panner.refDistance=1; panner.maxDistance=100; panner.rolloffFactor=1.2;
    panner.positionX.value=position.x;
    panner.positionY.value=position.y;
    panner.positionZ.value=position.z;
    const src=this.ctx.createBufferSource();
    src.buffer=this.buffers[name];
    src.detune.value=(Math.random()-0.5)*60;
    const gain=this.ctx.createGain(); gain.gain.value=volume;
    src.connect(gain); gain.connect(panner); panner.connect(this.master); src.start();
  }

  updateListener(){
    if(!this.ctx||!this.camera) return;
    const pos=this.camera.position;
    const dir=new THREE.Vector3(0,0,-1).applyQuaternion(this.camera.quaternion);
    const li=this.ctx.listener;
    if(li.positionX){ li.positionX.value=pos.x; li.positionY.value=pos.y; li.positionZ.value=pos.z; li.forwardX.value=dir.x; li.forwardY.value=dir.y; li.forwardZ.value=dir.z; li.upX.value=0; li.upY.value=1; li.upZ.value=0; }
  }

  _generateSounds(){
    const sr=this.ctx.sampleRate;

    // ── GUN SHOTS ── More realistic layered synthesis
    this.buffers['glock_shot']   = this._shot(sr,0.22,80, 180,0.9, 14,0.55);
    this.buffers['deagle_shot']  = this._shot(sr,0.32,55, 120,1.0, 10,0.70);
    this.buffers['mp5_shot']     = this._shot(sr,0.18,100,220,0.75,18,0.45);
    this.buffers['ak47_shot']    = this._shot(sr,0.30,70, 150,1.0, 12,0.65);
    this.buffers['m4a1_shot']    = this._shot(sr,0.22,90, 170,0.85,15,0.55);
    this.buffers['awp_shot']     = this._shot(sr,0.45,45, 90, 1.0,  7,0.80);

    // ── IMPACTS ──
    this.buffers['impact_wall']  = this._impact(sr,0.12,0.35);
    this.buffers['impact_metal'] = this._impactMetal(sr,0.08,0.25);

    // ── FOOTSTEPS ──
    this.buffers['footstep']     = this._footstep(sr,0.14,'dirt');
    this.buffers['footstep_ct']  = this._footstep(sr,0.12,'concrete');

    // ── RELOAD ──
    this.buffers['reload_start'] = this._mechClick(sr,0.12,800, 1200);
    this.buffers['reload_end']   = this._mechClick(sr,0.08,1400,1800);
    this.buffers['empty']        = this._mechClick(sr,0.04,2200,2800);

    // ── PLAYER ──
    this.buffers['pain']         = this._pain(sr,0.18);
    this.buffers['whiz']         = this._whiz(sr,0.22);
    this.buffers['jump']         = this._mechClick(sr,0.05,350,500);
    this.buffers['land']         = this._impact(sr,0.08,0.18);

    // ── ROUND JINGLES ──
    this.buffers['round_win']    = this._jingle(sr,[523,659,784],0.5);
    this.buffers['round_lose']   = this._jingle(sr,[440,392,349],0.5);
    this.buffers['buy_beep']     = this._mechClick(sr,0.04,1000,1200);
  }

  // Realistic layered gunshot
  _shot(sr,duration,subFreq,bodyFreq,vol,decay,noiseMix){
    const len=Math.floor(sr*duration);
    const buf=this.ctx.createBuffer(2,len,sr);
    for(let ch=0;ch<2;ch++){
      const d=buf.getChannelData(ch);
      for(let i=0;i<len;i++){
        const t=i/sr;
        const env=t<0.002 ? t/0.002 : Math.exp(-(t-0.002)*decay);
        // Sub boom
        const sub=Math.sin(2*Math.PI*subFreq*t*Math.exp(-t*8))*0.4;
        // Body crack
        const body=Math.sin(2*Math.PI*bodyFreq*t*Math.exp(-t*15))*0.3;
        // High crack (noise burst)
        const noise=(Math.random()*2-1)*noiseMix;
        // Mechanical click
        const click=Math.sin(2*Math.PI*3000*t)*Math.exp(-t*80)*0.15;
        d[i]=env*(sub+body+noise+click)*vol;
        // Slight stereo difference
        if(ch===1) d[i]*=0.95;
      }
    }
    return buf;
  }

  _impact(sr,attack,duration){
    const len=Math.floor(sr*duration);
    const buf=this.ctx.createBuffer(1,len,sr);
    const d=buf.getChannelData(0);
    for(let i=0;i<len;i++){
      const t=i/sr;
      const env=t<attack?t/attack:Math.exp(-(t-attack)*30);
      d[i]=env*(Math.random()*2-1)*0.55;
    }
    return buf;
  }

  _impactMetal(sr,attack,duration){
    const len=Math.floor(sr*duration);
    const buf=this.ctx.createBuffer(1,len,sr);
    const d=buf.getChannelData(0);
    for(let i=0;i<len;i++){
      const t=i/sr;
      const env=Math.exp(-t*25);
      const ring=Math.sin(2*Math.PI*2400*t)*0.3;
      d[i]=env*((Math.random()*2-1)*0.6+ring);
    }
    return buf;
  }

  _footstep(sr,duration,surface){
    const len=Math.floor(sr*duration);
    const buf=this.ctx.createBuffer(1,len,sr);
    const d=buf.getChannelData(0);
    const freq=surface==='concrete'?200:140;
    for(let i=0;i<len;i++){
      const t=i/sr;
      const env=Math.exp(-t*28)*0.4;
      const tone=Math.sin(2*Math.PI*freq*t*Math.exp(-t*15))*0.35;
      d[i]=env*((Math.random()*2-1)*0.65+tone);
    }
    return buf;
  }

  _mechClick(sr,duration,f1,f2){
    const len=Math.floor(sr*duration);
    const buf=this.ctx.createBuffer(1,len,sr);
    const d=buf.getChannelData(0);
    for(let i=0;i<len;i++){
      const t=i/sr;
      const env=Math.exp(-t*55);
      d[i]=env*(Math.sin(2*Math.PI*f1*t)*0.5+Math.sin(2*Math.PI*f2*t)*0.3+(Math.random()*2-1)*0.2);
    }
    return buf;
  }

  _pain(sr,duration){
    const len=Math.floor(sr*duration);
    const buf=this.ctx.createBuffer(1,len,sr);
    const d=buf.getChannelData(0);
    for(let i=0;i<len;i++){
      const t=i/sr;
      const env=t<0.01?t/0.01:Math.exp(-(t-0.01)*12);
      d[i]=env*(Math.random()*2-1)*0.3;
    }
    return buf;
  }

  _whiz(sr,duration){
    const len=Math.floor(sr*duration);
    const buf=this.ctx.createBuffer(1,len,sr);
    const d=buf.getChannelData(0);
    for(let i=0;i<len;i++){
      const t=i/sr;
      const norm=t/duration;
      const env=Math.sin(Math.PI*norm)*0.35;
      const freq=2800-norm*2000;
      d[i]=env*(Math.sin(2*Math.PI*freq*t)+Math.sin(2*Math.PI*freq*1.5*t)*0.3);
    }
    return buf;
  }

  _jingle(sr,freqs,vol){
    const dur=0.8;
    const len=Math.floor(sr*dur);
    const buf=this.ctx.createBuffer(1,len,sr);
    const d=buf.getChannelData(0);
    for(let i=0;i<len;i++){
      const t=i/sr;
      let s=0;
      for(let fi=0;fi<freqs.length;fi++){
        const onset=fi*0.18;
        if(t>onset) s+=Math.sin(2*Math.PI*freqs[fi]*(t-onset))*Math.exp(-(t-onset)*3);
      }
      d[i]=s*vol/freqs.length;
    }
    return buf;
  }
}
