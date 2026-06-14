// renderer.js — v2: Three.js Scene + Post Processing
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

export class GameRenderer {
  constructor(canvas, state) {
    this.canvas=canvas; this.state=state;
    this.shakeTime=0; this.shakeIntensity=0;
    this._setup();
  }

  _setup(){
    // Renderer
    this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,antialias:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    this.renderer.setSize(window.innerWidth,window.innerHeight);
    this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.15;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;

    // Scene
    this.scene=new THREE.Scene();
    this.scene.fog=new THREE.Fog(0xc8a96e,60,180);

    // Camera
    this.camera=new THREE.PerspectiveCamera(this.state.fov,window.innerWidth/window.innerHeight,0.05,300);
    this.camera.position.set(0,1.7,0);

    // Weapon pivot (child of camera)
    this.weaponPivot=new THREE.Group();
    this.camera.add(this.weaponPivot);
    this.scene.add(this.camera);

    // Post
    this._setupPost();

    // Resize
    window.addEventListener('resize',()=>{
      const w=window.innerWidth,h=window.innerHeight;
      this.camera.aspect=w/h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w,h);
      this.composer.setSize(w,h);
      this.fxaaPass.uniforms['resolution'].value.set(1/w,1/h);
    });
  }

  _setupPost(){
    const w=window.innerWidth,h=window.innerHeight;
    this.composer=new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene,this.camera));

    // Bloom — muzzle flash glow
    this.bloomPass=new UnrealBloomPass(new THREE.Vector2(w,h),0.25,0.4,0.88);
    this.composer.addPass(this.bloomPass);

    // FXAA
    this.fxaaPass=new ShaderPass(FXAAShader);
    this.fxaaPass.uniforms['resolution'].value.set(1/w,1/h);
    this.composer.addPass(this.fxaaPass);

    // Vignette
    this.vigPass=new ShaderPass({
      uniforms:{tDiffuse:{value:null},offset:{value:0.9},darkness:{value:1.5}},
      vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`uniform sampler2D tDiffuse;uniform float offset;uniform float darkness;varying vec2 vUv;void main(){vec4 t=texture2D(tDiffuse,vUv);vec2 uv=(vUv-vec2(0.5))*vec2(offset);float v=1.0-dot(uv,uv)*darkness;gl_FragColor=vec4(t.rgb*clamp(v,0.0,1.0),t.a);}`
    });
    this.composer.addPass(this.vigPass);
  }

  setFOV(fov){ this.camera.fov=fov; this.camera.updateProjectionMatrix(); }

  shake(intensity=0.05, duration=0.2){
    this.shakeIntensity=intensity;
    this.shakeTime=duration;
  }

  render(){
    if(this.shakeTime>0){
      const dt=1/60;
      this.shakeTime-=dt;
      const i=this.shakeIntensity*(this.shakeTime/0.2);
      this.camera.position.x+=(Math.random()-0.5)*i;
      this.camera.position.y+=(Math.random()-0.5)*i*0.4;
    }
    this.composer.render();
  }
}
