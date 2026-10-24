import * as THREE from 'three';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {ShaderPass} from 'three/examples/jsm/postprocessing/ShaderPass.js';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';
import {FullScreenQuad} from 'three/examples/jsm/postprocessing/Pass.js';

const VS=`varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position.xy,0.0,1.0);}`;
export function halton(i,b){let f=1,r=0;while(i>0){f/=b;r+=f*(i%b);i=Math.floor(i/b);}return r;}

// planar reflection helper for y=0 ground (adapted from three/examples Reflector, rendered into our own target)
export class GroundReflection{
  constructor(scale=0.5){ this.scale=scale; this.rt=new THREE.WebGLRenderTarget(16,16,{type:THREE.HalfFloatType}); this.cam=new THREE.PerspectiveCamera(); this.mat=new THREE.Matrix4(); this.hidden=[]; }
  setSize(w,h){ this.rt.setSize(Math.max(2,Math.round(w*this.scale)),Math.max(2,Math.round(h*this.scale))); }
  render(renderer,scene,camera){
    const normal=new THREE.Vector3(0,1,0), rp=new THREE.Vector3(0,0,0), cp=new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    if(cp.y<=0.001) return;
    const rot=new THREE.Matrix4().extractRotation(camera.matrixWorld);
    const view=rp.clone().sub(cp).reflect(normal).negate().add(rp);
    const look=new THREE.Vector3(0,0,-1).applyMatrix4(rot).add(cp);
    const target=rp.clone().sub(look).reflect(normal).negate().add(rp);
    const vc=this.cam; vc.position.copy(view); vc.up.set(0,1,0).applyMatrix4(rot).reflect(normal); vc.lookAt(target); vc.far=camera.far; vc.updateMatrixWorld(); vc.projectionMatrix.copy(camera.projectionMatrix);
    this.mat.set(0.5,0,0,0.5, 0,0.5,0,0.5, 0,0,0.5,0.5, 0,0,0,1); this.mat.multiply(vc.projectionMatrix); this.mat.multiply(vc.matrixWorldInverse);
    const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,rp); plane.applyMatrix4(vc.matrixWorldInverse);
    const clip=new THREE.Vector4(plane.normal.x,plane.normal.y,plane.normal.z,plane.constant); const pm=vc.projectionMatrix, q=new THREE.Vector4();
    q.x=(Math.sign(clip.x)+pm.elements[8])/pm.elements[0]; q.y=(Math.sign(clip.y)+pm.elements[9])/pm.elements[5]; q.z=-1; q.w=(1+pm.elements[10])/pm.elements[14];
    clip.multiplyScalar(2/clip.dot(q)); pm.elements[2]=clip.x; pm.elements[6]=clip.y; pm.elements[10]=clip.z+1-0.003; pm.elements[14]=clip.w;
    const vis=this.hidden.map(o=>o.visible); this.hidden.forEach(o=>o.visible=false);
    const fog=scene.fog; const prevRT=renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt); renderer.clear(); renderer.render(scene,vc); renderer.setRenderTarget(prevRT);
    this.hidden.forEach((o,i)=>o.visible=vis[i]);
  }
}
export function reflectiveGround(mat,refl,opts={}){ // inject planar reflection into a standard/physical material
  const U={tRefl:{value:refl.rt.texture},mRefl:{value:refl.mat},uReflK:{value:opts.k??0.3},uBlur:{value:opts.blur??0.004},uStretch:{value:opts.stretch??1},uJit:{value:new THREE.Vector2()},uWet:{value:opts.wet??0},tWet:{value:opts.tWet||null},uWetScale:{value:opts.wetScale??0.08},uOff:{value:new THREE.Vector2()}};
  mat.userData.RU=U; const prev=mat.onBeforeCompile;
  mat.onBeforeCompile=(sh,r)=>{ prev&&prev(sh,r); Object.assign(sh.uniforms,U);
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nuniform mat4 mRefl; varying vec4 vRefl; varying vec3 vWP;').replace('#include <project_vertex>','#include <project_vertex>\nvWP=(modelMatrix*vec4(transformed,1.0)).xyz; vRefl=mRefl*vec4(vWP,1.0);');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D tRefl; uniform float uReflK; uniform float uBlur; uniform float uStretch; uniform vec2 uJit; uniform float uWet; uniform sampler2D tWet; uniform float uWetScale; uniform vec2 uOff; varying vec4 vRefl; varying vec3 vWP;')
     .replace('#include <opaque_fragment>',`
      { vec2 ruv=vRefl.xy/vRefl.w; float wm=1.0; vec2 dist=vec2(0.0);
        if(uWet>0.0){ vec4 wn=texture2D(tWet,(vWP.xz+uOff)*uWetScale); wm=mix(0.35,1.0,smoothstep(0.35,0.62,wn.r)); dist=(wn.gb-0.5)*0.012*uWet; }
        vec3 Vv=normalize(vViewPosition); float ct=clamp(dot(normalize(normal),Vv),0.0,1.0); float F=0.03+0.97*pow(1.0-ct,5.0);
        vec3 acc=vec3(0.0); float tw=0.0;
        for(int i=0;i<9;i++){ float fi=float(i)/8.0-0.5; float w=exp(-fi*fi*9.0); vec2 o=vec2(fi*uBlur*0.35,fi*uBlur*uStretch)+uJit*uBlur*0.5;
          vec3 rs=texture2D(tRefl,ruv+dist+o).rgb; rs=(any(isnan(rs))||any(isinf(rs)))?vec3(0.0):min(rs,vec3(40.0)); acc+=rs*w; tw+=w; }
        outgoingLight+=acc/tw*uReflK*mix(0.25,1.0,F)*wm; }
      #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey=()=>'refl_'+(opts.key||'g'); return U;
}

export class Pipeline{
  constructor(renderer,w,h){ this.r=renderer; this.n=0;
    const o={type:THREE.HalfFloatType,depthBuffer:true}; this.rtS=new THREE.WebGLRenderTarget(w,h,{...o,samples:4});
    this.acc=[new THREE.WebGLRenderTarget(w,h,{type:THREE.HalfFloatType,depthBuffer:false}),new THREE.WebGLRenderTarget(w,h,{type:THREE.HalfFloatType,depthBuffer:false})];
    this.accQ=new FullScreenQuad(new THREE.ShaderMaterial({uniforms:{tNew:{value:null},tOld:{value:null},w:{value:1}},vertexShader:VS,
      fragmentShader:`uniform sampler2D tNew,tOld; uniform float w; varying vec2 vUv; void main(){ vec4 a=texture2D(tOld,vUv), b=texture2D(tNew,vUv); if(any(isnan(b))||any(isinf(b))) b=vec4(1.0,0.0,1.0,1.0); b=min(b,vec4(64.0)); if(w>=0.999) a=b; gl_FragColor=mix(a,b,w);}`,depthTest:false,depthWrite:false}));
    this.composer=new EffectComposer(renderer,new THREE.WebGLRenderTarget(w,h,{type:THREE.HalfFloatType})); this.composer.renderToScreen=true;
    this.copy=new ShaderPass(new THREE.ShaderMaterial({uniforms:{tSrc:{value:null},tDiffuse:{value:null}},vertexShader:VS,fragmentShader:`uniform sampler2D tSrc; varying vec2 vUv; void main(){gl_FragColor=texture2D(tSrc,vUv);}`}));
    this.bloom=new UnrealBloomPass(new THREE.Vector2(w,h),0.35,0.55,1.6);
    this.grade=new ShaderPass(new THREE.ShaderMaterial({uniforms:{tDiffuse:{value:null},uVig:{value:0.32},uCA:{value:0.0012},uGrain:{value:0.025},uSeed:{value:0},uFade:{value:1},uLift:{value:new THREE.Vector3(0,0,0)},uSat:{value:1.05},uAspect:{value:w/h}},vertexShader:VS,
      fragmentShader:`uniform sampler2D tDiffuse; uniform float uVig,uCA,uGrain,uSeed,uFade,uSat,uAspect; uniform vec3 uLift; varying vec2 vUv;
      float h12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
      void main(){ vec2 d=vUv-0.5; float r2=dot(d*vec2(uAspect,1.0),d*vec2(uAspect,1.0));
        vec3 c; c.r=texture2D(tDiffuse,vUv-d*uCA*r2*4.0).r; c.g=texture2D(tDiffuse,vUv).g; c.b=texture2D(tDiffuse,vUv+d*uCA*r2*4.0).b;
        float l=dot(c,vec3(0.2126,0.7152,0.0722)); c=max(mix(vec3(l),c,uSat),0.0);
        c*=mix(1.0,smoothstep(1.25,0.15,r2*1.25),uVig); c+=uLift;
        float g=h12(gl_FragCoord.xy+uSeed*91.7)-0.5; c*=1.0+g*uGrain*2.0; c+=g*uGrain*0.01;
        gl_FragColor=vec4(c*uFade,1.0);} `}));
    this.out=new OutputPass();
    this.composer.addPass(this.copy); this.composer.addPass(this.bloom); this.composer.addPass(this.grade); this.composer.addPass(this.out);
    this.w=w; this.h=h;
  }
  setSize(w,h){ this.w=w;this.h=h; this.rtS.setSize(w,h); this.acc.forEach(a=>a.setSize(w,h)); this.composer.setSize(w,h); this.grade.uniforms.uAspect.value=w/h; this.n=0; }
  reset(){ this.n=0; }
  // render one jittered sample into the accumulator. before(i) lets caller jitter lights/time
  sample(scene,camera,refl,jit=true){
    const r=this.r, i=this.n; const W=this.w,H=this.h;
    if(jit&&i>0){ const jx=halton(i+1,2)-0.5, jy=halton(i+1,3)-0.5; camera.setViewOffset(W,H,jx,jy,W,H); } else camera.clearViewOffset();
    camera.updateMatrixWorld();
    r.shadowMap.autoUpdate=false; r.shadowMap.needsUpdate=true;
    if(refl){ refl.render(r,scene,camera); }
    r.setRenderTarget(this.rtS); r.clear(); r.render(scene,camera);
    camera.clearViewOffset();
    const src=this.acc[i%2], dst=this.acc[(i+1)%2];
    this.accQ.material.uniforms.tNew.value=this.rtS.texture; this.accQ.material.uniforms.tOld.value=src.texture; this.accQ.material.uniforms.w.value=1/(i+1);
    r.setRenderTarget(dst); this.accQ.render(r); r.setRenderTarget(null);
    this.n++; this.cur=dst;
  }
  present(){ this.copy.uniforms.tSrc.value=this.cur.texture; this.composer.render(); }
}
