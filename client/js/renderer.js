// renderer.js — Three.js Scene, Camera, Post-processing
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

export class GameRenderer {
  constructor(canvas, state) {
    this.canvas = canvas;
    this.state = state;
    this.shakeTime = 0;
    this.shakeIntensity = 0;
    this._setupRenderer();
    this._setupScene();
    this._setupCamera();
    this._setupLights();
    this._setupPostProcessing();
    this._setupResize();
  }

  _setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false, // FXAA handles AA
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  _setupScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xc8a96e, 40, 120);
    this.scene.background = new THREE.Color(0xc8a96e);
  }

  _setupCamera() {
    this.camera = new THREE.PerspectiveCamera(
      this.state.fov,
      window.innerWidth / window.innerHeight,
      0.05,
      300
    );
    this.camera.position.set(0, 1.7, 0);

    // Weapon camera (rendered on top, no FOV distortion on weapon)
    this.weaponCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 10);

    // Pivot for weapon bob/sway
    this.weaponPivot = new THREE.Group();
    this.camera.add(this.weaponPivot);
    this.scene.add(this.camera);
  }

  _setupLights() {
    // Ambient
    const ambient = new THREE.AmbientLight(0xffe8c0, 0.4);
    this.scene.add(ambient);

    // Sun (directional)
    this.sun = new THREE.DirectionalLight(0xfff0d0, 2.0);
    this.sun.position.set(40, 80, 30);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.width = 2048;
    this.sun.shadow.mapSize.height = 2048;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 300;
    this.sun.shadow.camera.left = -80;
    this.sun.shadow.camera.right = 80;
    this.sun.shadow.camera.top = 80;
    this.sun.shadow.camera.bottom = -80;
    this.sun.shadow.bias = -0.001;
    this.scene.add(this.sun);

    // Fill light (cool sky bounce)
    const fill = new THREE.DirectionalLight(0x8bb0e0, 0.3);
    fill.position.set(-20, 30, -20);
    this.scene.add(fill);

    // Hemisphere
    const hemi = new THREE.HemisphereLight(0x88aacc, 0xc8a060, 0.2);
    this.scene.add(hemi);
  }

  _setupPostProcessing() {
    const w = window.innerWidth, h = window.innerHeight;

    this.composer = new EffectComposer(this.renderer);

    // Base render
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    // Bloom (subtle, for muzzle flashes)
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      0.3,   // strength
      0.4,   // radius
      0.85   // threshold
    );
    this.composer.addPass(this.bloomPass);

    // FXAA
    this.fxaaPass = new ShaderPass(FXAAShader);
    this.fxaaPass.uniforms['resolution'].value.set(1 / w, 1 / h);
    this.composer.addPass(this.fxaaPass);

    // Vignette
    this.vignettePass = new ShaderPass(VignetteShader);
    this.vignettePass.uniforms['offset'].value = 0.95;
    this.vignettePass.uniforms['darkness'].value = 1.6;
    this.composer.addPass(this.vignettePass);
  }

  _setupResize() {
    window.addEventListener('resize', () => {
      const w = window.innerWidth, h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.weaponCamera.aspect = w / h;
      this.weaponCamera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.composer.setSize(w, h);
      this.fxaaPass.uniforms['resolution'].value.set(1 / w, 1 / h);
    });
  }

  setFOV(fov) {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  // Call when player takes damage to shake camera
  shake(intensity = 0.06, duration = 0.2) {
    this.shakeIntensity = intensity;
    this.shakeTime = duration;
  }

  render() {
    // Screen shake
    if (this.shakeTime > 0) {
      const dt = 1 / 60;
      this.shakeTime -= dt;
      const i = this.shakeIntensity * (this.shakeTime / 0.2);
      this.camera.position.x += (Math.random() - 0.5) * i;
      this.camera.position.y += (Math.random() - 0.5) * i * 0.5;
    }

    this.composer.render();
  }
}

// ──────────────────────────────────────────
// VIGNETTE SHADER
// ──────────────────────────────────────────
const VignetteShader = {
  uniforms: {
    tDiffuse:  { value: null },
    offset:    { value: 1.0 },
    darkness:  { value: 1.5 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float offset;
    uniform float darkness;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - vec2(0.5)) * vec2(offset);
      float vignette = 1.0 - dot(uv, uv) * darkness;
      vignette = clamp(vignette, 0.0, 1.0);
      gl_FragColor = vec4(texel.rgb * vignette, texel.a);
    }
  `,
};
