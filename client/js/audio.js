// audio.js — Web Audio API Engine with 3D Positional Audio
import * as THREE from 'three';

export class AudioEngine {
  constructor(camera) {
    this.camera = camera;
    this.ctx    = null;
    this.master = null;
    this.listener = null;
    this.buffers = {};
    this.masterVolume = 0.7;
    this._ready = false;
  }

  init() {
    // Create AudioContext on first user interaction
    const start = () => {
      if (this._ready) return;
      this._ready = true;
      document.removeEventListener('click', start);

      this.ctx    = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.masterVolume;
      this.master.connect(this.ctx.destination);

      this.listener = this.ctx.listener;
      this._generateSounds();
    };
    document.addEventListener('click', start);
  }

  setMasterVolume(vol) {
    this.masterVolume = vol;
    if (this.master) this.master.gain.value = vol;
  }

  // ── Update listener position (call each frame) ──
  updateListener() {
    if (!this.ctx || !this.camera) return;
    const pos = this.camera.position;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const up  = new THREE.Vector3(0, 1, 0);

    if (this.listener.positionX) {
      this.listener.positionX.value = pos.x;
      this.listener.positionY.value = pos.y;
      this.listener.positionZ.value = pos.z;
      this.listener.forwardX.value = dir.x;
      this.listener.forwardY.value = dir.y;
      this.listener.forwardZ.value = dir.z;
      this.listener.upX.value = up.x;
      this.listener.upY.value = up.y;
      this.listener.upZ.value = up.z;
    }
  }

  // ── Play a 2D sound ──
  play(name, opts = {}) {
    if (!this.ctx || !this.buffers[name]) return;
    const { volume = 1, detune = 0 } = opts;

    const src  = this.ctx.createBufferSource();
    src.buffer = this.buffers[name];
    src.detune.value = detune + (Math.random() - 0.5) * 50;

    const gain = this.ctx.createGain();
    gain.gain.value = volume;

    src.connect(gain);
    gain.connect(this.master);
    src.start();
  }

  // ── Play a 3D positional sound ──
  playAt(name, position, opts = {}) {
    if (!this.ctx || !this.buffers[name]) return;
    const { volume = 1 } = opts;

    const panner = this.ctx.createPanner();
    panner.panningModel  = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance   = 1;
    panner.maxDistance   = 80;
    panner.rolloffFactor = 1.5;
    panner.positionX.value = position.x;
    panner.positionY.value = position.y;
    panner.positionZ.value = position.z;

    const src  = this.ctx.createBufferSource();
    src.buffer = this.buffers[name];
    src.detune.value = (Math.random() - 0.5) * 80;

    const gain = this.ctx.createGain();
    gain.gain.value = volume;

    src.connect(gain);
    gain.connect(panner);
    panner.connect(this.master);
    src.start();
  }

  // ── Procedural sound synthesis ──
  _generateSounds() {
    this.buffers['ak47_shot']  = this._genGunshot(0.18, 0.22, 120, 90);
    this.buffers['m4a1_shot']  = this._genGunshot(0.15, 0.18, 140, 110);
    this.buffers['deagle_shot']= this._genGunshot(0.25, 0.28, 90,  70);
    this.buffers['impact_wall']= this._genImpact(0.04, 0.12);
    this.buffers['footstep']   = this._genFootstep(0.05, 0.12);
    this.buffers['reload_start']= this._genClick(0.06, 0.09, 800);
    this.buffers['reload_end']  = this._genClick(0.04, 0.07, 1200);
    this.buffers['empty']       = this._genClick(0.02, 0.04, 2000);
    this.buffers['pain']        = this._genNoise(0.08, 0.15, 0.4);
    this.buffers['whiz']        = this._genWhiz(0.04, 0.18);
    this.buffers['jump']        = this._genClick(0.02, 0.05, 400);
    this.buffers['round_win']   = this._genTone(0.3, [440, 554, 659], 0.6);
    this.buffers['round_lose']  = this._genTone(0.3, [440, 415, 392], 0.6);
  }

  _genGunshot(attack, duration, lowFreq, bodyFreq) {
    const sampleRate = this.ctx.sampleRate;
    const len = Math.floor(sampleRate * duration);
    const buf = this.ctx.createBuffer(1, len, sampleRate);
    const data = buf.getChannelData(0);

    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const env = t < attack
        ? t / attack
        : Math.exp(-(t - attack) * 18);

      // Noise burst + tonal body
      const noise = (Math.random() * 2 - 1);
      const tone  = Math.sin(2 * Math.PI * bodyFreq * t * Math.exp(-t * 8));
      const sub   = Math.sin(2 * Math.PI * lowFreq  * t * Math.exp(-t * 12));
      data[i] = env * (noise * 0.6 + tone * 0.25 + sub * 0.35);
    }
    return buf;
  }

  _genImpact(attack, duration) {
    const sampleRate = this.ctx.sampleRate;
    const len = Math.floor(sampleRate * duration);
    const buf = this.ctx.createBuffer(1, len, sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * 35);
      data[i] = env * (Math.random() * 2 - 1) * 0.6;
    }
    return buf;
  }

  _genFootstep(attack, duration) {
    const sampleRate = this.ctx.sampleRate;
    const len = Math.floor(sampleRate * duration);
    const buf = this.ctx.createBuffer(1, len, sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * 28) * 0.4;
      const tone = Math.sin(2 * Math.PI * 180 * t * Math.exp(-t * 20));
      data[i] = env * ((Math.random() * 2 - 1) * 0.7 + tone * 0.3);
    }
    return buf;
  }

  _genClick(attack, duration, freq) {
    const sampleRate = this.ctx.sampleRate;
    const len = Math.floor(sampleRate * duration);
    const buf = this.ctx.createBuffer(1, len, sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * 60);
      data[i] = env * Math.sin(2 * Math.PI * freq * t) * 0.5;
    }
    return buf;
  }

  _genNoise(attack, duration, decay) {
    const sampleRate = this.ctx.sampleRate;
    const len = Math.floor(sampleRate * duration);
    const buf = this.ctx.createBuffer(1, len, sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const env = t < attack ? t/attack : Math.exp(-(t-attack)*decay*6);
      data[i] = env * (Math.random() * 2 - 1) * 0.3;
    }
    return buf;
  }

  _genWhiz(attack, duration) {
    const sampleRate = this.ctx.sampleRate;
    const len = Math.floor(sampleRate * duration);
    const buf = this.ctx.createBuffer(1, len, sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const norm = t / duration;
      const env = Math.sin(Math.PI * norm) * 0.3;
      const freq = 2000 - norm * 1400; // Doppler-ish sweep down
      data[i] = env * Math.sin(2 * Math.PI * freq * t);
    }
    return buf;
  }

  _genTone(duration, freqs, volume) {
    const sampleRate = this.ctx.sampleRate;
    const len = Math.floor(sampleRate * duration);
    const buf = this.ctx.createBuffer(1, len, sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      let s = 0;
      for (const f of freqs) s += Math.sin(2 * Math.PI * f * t);
      const env = Math.exp(-t * 3);
      data[i] = env * s * volume / freqs.length;
    }
    return buf;
  }
}
