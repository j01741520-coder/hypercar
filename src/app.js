import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {buildCar} from './car.js';
import {studioEnvMap,buildStudio} from './studio.js';
import {nightEnvMap,buildNight,updateNight} from './night.js';
import {buildAero} from './aero.js';
import {Pipeline,GroundReflection,halton} from './engine.js';
import {XU,setXray} from './mats.js';
import {LIVERIES} from './tex.js';
import {FA,RA} from './shape.js';

const Q=new URLSearchParams(location.search); const REC=Q.get('record')==='1';
if(REC) document.body.classList.add('rec');
const $=id=>document.getElementById(id);
const canvas=$('cv');
const renderer=new THREE.WebGLRenderer({canvas,antialias:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.0; renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
let W=REC?1920:innerWidth, Hh=REC?1080:innerHeight; const DPR=REC?1:Math.min(devicePixelRatio||1,1.5);
const sizeAll=()=>{ renderer.setPixelRatio(DPR); renderer.setSize(W,Hh,false); canvas.style.width=W+'px'; canvas.style.height=Hh+'px'; };
sizeAll();
const scene=new THREE.Scene(); scene.background=new THREE.Color(0);
const camera=new THREE.PerspectiveCamera(30,W/Hh,0.03,900);
const refl=new GroundReflection(REC?0.5:0.5); refl.setSize(W*DPR,Hh*DPR);
const pipe=new Pipeline(renderer,Math.round(W*DPR),Math.round(Hh*DPR));
const envStudio=studioEnvMap(renderer), envNight=nightEnvMap(renderer);
const studio=buildStudio(refl); scene.add(studio.group);
const N=buildNight(refl); scene.add(N.group);
const C=buildCar(renderer); scene.add(C.car);
const aero=buildAero(); scene.add(aero.group);
refl.hidden.push(studio.floor,studio.contact,studio.softbox,N.road,N.streak,aero.group);
scene.add(studio.contact); // contact shadow lives at scene level (both modes)
const fogN=new THREE.FogExp2(0x070b14,0.016);
// material registry for env intensity
const allMats=new Set(); scene.traverse(o=>{ if(o.material) (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>allMats.add(m)); });
const setEnvK=k=>{ for(const m of allMats) if('envMapIntensity' in m) m.envMapIntensity=k; };
const carMats=new Set(); C.car.traverse(o=>{ if(o.material) carMats.add(o.material); }); const carEnv=k=>{ for(const m of carMats) if('envMapIntensity' in m) m.envMapIntensity=k; };

// ---------------------------------------------------------------- state
const S={mode:'studio',xray:0,xrayT:0,aero:0,aeroT:0,lights:1,liv:0,dist:0,speed:0,brake:0,brakeT:0,steer:0.16,studioK:1,head:1,t:0};
const keyBase=studio.key.position.clone(); const baseInt={area:studio.area.intensity,s1:studio.side1.intensity,s2:studio.side2.intensity,key:studio.key.intensity,rimA:studio.rimA.intensity,rimB:studio.rimB.intensity,hemi:studio.hemi.intensity};
function applyMode(m){ S.mode=m; const night=m==='night';
  studio.group.visible=!night; N.group.visible=night; scene.environment=night?envNight:envStudio; scene.fog=night?fogN:null;
  scene.background=new THREE.Color(night?0x020306:0x000000); renderer.toneMappingExposure=night?1.15:1.0;
  pipe.bloom.strength=night?0.62:0.26; pipe.bloom.radius=night?0.5:0.45; pipe.bloom.threshold=night?1.5:4.0;
  studio.contact.material.opacity=night?0.75:0.85; setEnvK(night?0.9:1.0); if(night) carEnv(2.2);
  pipe.grade.uniforms.uVig.value=night?0.45:0.32;
  document.querySelectorAll('#modes button').forEach(b=>b.classList.toggle('on',b.dataset.m===m)); }
function applyDynamic(t,o={}){
  // wheels
  const ang=S.dist/0.355;
  // tyre lettering: rotation per 1/60 s shutter -> 0 (crisp) .. 1 (smooth ring)
  { const rot=Math.abs(S.speed)/0.355/60; C.U.uTyBlur.value=Math.min(1,Math.max(0,(rot-0.04)/0.36)); }
  for(const w of C.wheels){ w.spin.rotation.z=(w.sz>0?-1:1)*ang; w.root.rotation.y=(w.sz<0?Math.PI:0)+(w.front?S.steer:0); }
  const night=S.mode==='night';
  C.U.uHead.value=S.lights*S.head*(night?1.1:1.0); C.U.uTail.value=S.lights*(night?0.55:0.8)*(1+S.brake*1.2);
  for(const m of [C.wheels[0]]) {}
  const dm=C.car.children.find(x=>x.isGroup&&x.children[0]&&x.children[0].children)?null:null;
  discM.emissiveIntensity=S.brake*5.5+ (night?0.08:0);
  XU.uXray.value=S.xray; setXray(C.xrayMats,S.xray); C.bodyMesh.castShadow=S.xray<0.5;
  C.chassis.batt.emissiveIntensity=S.xray*(0.22+0.12*Math.sin(t*6));
  aero.group.visible=S.aero>0.002; aero.mat.uniforms.uK.value=S.aero; aero.mat.uniforms.uT.value=t;
  if(night){ updateNight(N,S.dist,S.speed,t,camera.position); N.heads.forEach(h=>h.intensity=1500*S.lights); N.coneM.uniforms.uK.value=S.lights; N.tail.intensity=1.2*(1+S.brake*1.5); }
  else { const k=S.studioK; studio.key.intensity=baseInt.key*k; studio.area.intensity=baseInt.area*k; studio.side1.intensity=baseInt.s1*Math.min(1,k*1.4); studio.side2.intensity=baseInt.s2*Math.min(1,k*1.4); studio.rimA.intensity=baseInt.rimA*Math.min(1,k*1.6); studio.rimB.intensity=baseInt.rimB*Math.min(1,k*1.3); studio.hemi.intensity=baseInt.hemi*k; studio.softbox.material.color.setScalar(3*k); studio.cove.material.emissiveIntensity=k; setEnvK(Math.max(0.0,k)); }
}
const discM=C.wheels[0].spin.children.find(m=>m.material&&m.material.emissiveMap).material;

// ---------------------------------------------------------------- render core
function jitterSample(i){
  const a=halton(i+1,5)*Math.PI*2, r=Math.sqrt(halton(i+1,7));
  studio.key.position.set(keyBase.x+Math.cos(a)*r*2.8,keyBase.y,keyBase.z+Math.sin(a)*r*1.05);
  studio.RU.uJit.value.set(halton(i+1,11)-0.5,halton(i+1,13)-0.5); N.RU.uJit.value.set(halton(i+1,11)-0.5,halton(i+1,13)-0.5);
}
function sampleOnce(){ jitterSample(pipe.n); pipe.sample(scene,camera,(pipe.n<4||pipe.n%4===0)?refl:null,true); }
pipe.grade.uniforms.uSeed.value=0;

// ---------------------------------------------------------------- camera presets
const P={
  hero:{pos:[4.9,1.42,5.3],tgt:[0.1,0.42,0],fov:30},
  rear:{pos:[-5.3,1.55,4.7],tgt:[-0.2,0.48,0],fov:30},
  side:{pos:[0.15,0.62,10.2],tgt:[0.0,0.50,0],fov:30},
  front:{pos:[8.8,0.72,0.0],tgt:[0,0.5,0],fov:26},
  top:{pos:[0.0,12.5,0.35],tgt:[0,0,0],fov:30},
  cockpit:{pos:[-0.60,0.985,0.0],tgt:[3.0,0.78,0.0],fov:64},
  susp:{pos:[2.55,0.62,2.25],tgt:[1.42,0.40,0.62],fov:36},
};
const controls=new OrbitControls(camera,canvas); controls.enableDamping=true; controls.dampingFactor=0.08; controls.minDistance=0.2; controls.maxDistance=24; controls.maxPolarAngle=Math.PI*0.495;
const setCam=(p)=>{ camera.position.set(...p.pos); controls.target.set(...p.tgt); camera.fov=p.fov; camera.updateProjectionMatrix(); camera.lookAt(controls.target); };
setCam(P.hero); controls.update();
let tween=null;
function goPreset(name){
  document.querySelectorAll('#presets button').forEach(b=>b.classList.toggle('on',b.dataset.p===name));
  if(name==='reset'){ setX(false); setA(false); name='hero'; document.querySelector('#presets button[data-p=hero]').classList.add('on'); }
  if(name==='susp') setX(true);
  const p=P[name]; const t0=controls.target.clone(), t1=new THREE.Vector3(...p.tgt);
  const o0=camera.position.clone().sub(t0), o1=new THREE.Vector3(...p.pos).sub(t1);
  const s0=new THREE.Spherical().setFromVector3(o0), s1=new THREE.Spherical().setFromVector3(o1);
  let dth=s1.theta-s0.theta; while(dth>Math.PI) dth-=2*Math.PI; while(dth<-Math.PI) dth+=2*Math.PI;
  tween={t:0,dur:1.6,t0,t1,s0,s1,dth,f0:camera.fov,f1:p.fov,name};
}
const ease=x=>x<0.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;
function stepTween(dt){ if(!tween) return; tween.t=Math.min(1,tween.t+dt/tween.dur); const e=ease(tween.t);
  const tg=tween.t0.clone().lerp(tween.t1,e); const s=new THREE.Spherical(THREE.MathUtils.lerp(tween.s0.radius,tween.s1.radius,e),THREE.MathUtils.lerp(tween.s0.phi,tween.s1.phi,e),tween.s0.theta+tween.dth*e);
  // lift the path a little so it never cuts through the car
  const lift=Math.sin(Math.PI*e)*Math.max(0,1.2-Math.min(tween.s0.radius,tween.s1.radius)*0.15)*0.0;
  camera.position.copy(tg).add(new THREE.Vector3().setFromSpherical(s)); camera.position.y+=lift; controls.target.copy(tg);
  camera.fov=THREE.MathUtils.lerp(tween.f0,tween.f1,e); camera.updateProjectionMatrix(); camera.lookAt(tg);
  if(tween.t>=1) tween=null; }

// ---------------------------------------------------------------- UI
const liv=$('liv'); LIVERIES.forEach((L,i)=>{ const b=document.createElement('button'); b.innerHTML=`<i style="background:linear-gradient(135deg,${L.sw} 55%,${L.acc} 56%)"></i>${L.name}`; b.onclick=()=>setLiv(i); liv.appendChild(b); });
function setLiv(i){ S.liv=i; C.setLivery(i); [...liv.children].forEach((b,j)=>b.classList.toggle('on',j===i)); pipe.reset(); }
function setX(v){ S.xrayT=v?1:0; $('tX').classList.toggle('on',!!v); }
function setA(v){ S.aeroT=v?1:0; $('tA').classList.toggle('on',!!v); }
let fadeState=null;
function switchMode(m){ if(m===S.mode) return; $('fade').style.opacity=1; setTimeout(()=>{ applyMode(m); if(m==='night'){ S.speed=78; S.steer=0; } else { S.speed=0; S.steer=0.16; } pipe.reset(); $('fade').style.opacity=0; },260); }
if(!REC){
  document.querySelectorAll('#modes button').forEach(b=>b.onclick=()=>switchMode(b.dataset.m));
  document.querySelectorAll('#presets button').forEach(b=>b.onclick=()=>goPreset(b.dataset.p));
  $('tX').onclick=()=>setX(!S.xrayT); $('tA').onclick=()=>setA(!S.aeroT); $('tL').onclick=()=>{ S.lights=S.lights?0:1; $('tL').classList.toggle('on',!!S.lights); pipe.reset(); };
  $('helpBtn').onclick=()=>$('help').style.display='flex'; $('help').onclick=()=>$('help').style.display='none';
  $('specBtn').onclick=()=>$('spec').classList.toggle('open');
  addEventListener('keydown',e=>{ const k=e.key.toLowerCase(); const map={'1':'hero','2':'rear','3':'side','4':'front','5':'top','6':'cockpit','7':'susp','0':'reset'};
    if(map[k]) goPreset(map[k]); else if(k==='n') switchMode(S.mode==='studio'?'night':'studio'); else if(k==='x') setX(!S.xrayT); else if(k==='a') setA(!S.aeroT);
    else if(k==='l') $('tL').click(); else if(k==='c') setLiv((S.liv+1)%LIVERIES.length); else if(k==='b') S.brakeT=1; });
  addEventListener('keyup',e=>{ if(e.key.toLowerCase()==='b') S.brakeT=0; });
  canvas.addEventListener('pointerdown',()=>{ tween=null; canvas.style.cursor='grabbing'; }); addEventListener('pointerup',()=>canvas.style.cursor='grab');
  addEventListener('resize',()=>{ W=innerWidth; Hh=innerHeight; sizeAll(); camera.aspect=W/Hh; camera.updateProjectionMatrix(); refl.setSize(W*DPR,Hh*DPR); pipe.setSize(Math.round(W*DPR),Math.round(Hh*DPR)); });
}
setLiv(0);
// x-ray labels
const LABELS=[['2.9 L V6 · 120° TWIN-TURBO','REAR-MID ICE',[-1.22,0.62,0.0]],['FRONT e-MOTOR · 200 KW','e-AWD > 190 KM/H',[FA.x,0.42,0.0]],['900 V ENERGY STORE','HYBRID BATTERY',[-0.76,0.52,-0.2]],
  ['PUSHROD DOUBLE WISHBONE','FRONT SUSPENSION',[1.50,0.58,-0.2]],['CFRP MONOCOQUE','SURVIVAL CELL',[0.75,0.62,0.2]],['SIDEPOD RADIATOR','COOLING',[0.15,0.36,0.62]],['7-SPEED SEQ. GEARBOX','TRANSAXLE',[-1.86,0.40,0.0]]];
const labEls=LABELS.map(([a,b])=>{ const d=document.createElement('div'); d.className='lb'; d.innerHTML=`${a}<b>${b}</b>`; $('lab').appendChild(d); return d; });
function updLabels(k,stag=0){ const v=new THREE.Vector3(); const w=REC?1920:W, h=REC?1080:Hh;
  LABELS.forEach((L,i)=>{ const el=labEls[i]; const kk=Math.max(0,Math.min(1,(k-stag*i)*1.0)); v.set(...L[2]).project(camera);
    if(v.z>1||kk<=0.001){ el.style.opacity=0; return; } el.style.opacity=kk; el.style.transform=`translate(${((v.x+1)/2*w+14).toFixed(1)}px,${((1-v.y)/2*h-6).toFixed(1)}px)`; el.style.fontSize=REC?'15px':''; }); }

// ---------------------------------------------------------------- interactive loop
let last=performance.now(); const lastM=new THREE.Matrix4(); let lastFov=0; const MAXS=64;
function camChanged(){ camera.updateMatrixWorld(); const ch=!lastM.equals(camera.matrixWorld)||lastFov!==camera.fov; lastM.copy(camera.matrixWorld); lastFov=camera.fov; return ch; }
function loop(now){
  requestAnimationFrame(loop); const dt=Math.min(0.05,(now-last)/1000); last=now; S.t+=dt;
  stepTween(dt); if(!tween) controls.update();
  const nX=S.xray+(S.xrayT-S.xray)*Math.min(1,dt*3.2), nA=S.aero+(S.aeroT-S.aero)*Math.min(1,dt*2.2);
  let anim=Math.abs(nX-S.xray)>1e-4||Math.abs(nA-S.aero)>1e-4||S.aero>0.002||S.mode==='night'; S.xray=Math.abs(nX-S.xrayT)<1e-3?S.xrayT:nX; S.aero=Math.abs(nA-S.aeroT)<1e-3?S.aeroT:nA;
  XU.uScan.value=S.xray>0.01&&S.xray<0.99?THREE.MathUtils.lerp(3.2,-3.2,S.xray):-9;
  if(S.mode==='night'){ S.brake+= (S.brakeT-S.brake)*Math.min(1,dt*6); S.speed+=((S.brakeT?40:78)-S.speed)*Math.min(1,dt*(S.brakeT?2.5:0.6)); S.dist+=S.speed*dt; }
  else S.brake+=(S.brakeT-S.brake)*Math.min(1,dt*6), anim=anim||Math.abs(S.brake-S.brakeT)>1e-3;
  applyDynamic(S.t);
  updLabels(S.xray>0.6?(S.xray-0.6)/0.4:0);
  if(camChanged()||anim) pipe.reset();
  if(pipe.n<MAXS){ sampleOnce(); pipe.grade.uniforms.uSeed.value=(S.t*60)%1000; pipe.present();
    const live=anim&&S.mode==='night'; const acc=$('acc');
    $('accT').textContent=live?'LIVE · MOTION':(pipe.n>=MAXS?'CONVERGED ':'ACCUMULATING ')+pipe.n+'/'+MAXS;
    $('accB').style.width=(live?100:pipe.n/MAXS*100)+'%'; acc.classList.toggle('done',pipe.n>=MAXS||live);
    $('accS').textContent=live?'REAL-TIME · BLOOM · WET REFLECTIONS':'JITTERED AA · AREA-LIGHT SOFT SHADOWS'; }
}

// ---------------------------------------------------------------- record timeline
const clamp=(v,a,b)=>v<a?a:v>b?b:v, ss=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);}, lerp=(a,b,t)=>a+(b-a)*t;
const L3=(a,b,t)=>[lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t)];
const orb=(az,el,r,tg)=>{ const A=az*Math.PI/180,E=el*Math.PI/180; return [tg[0]+r*Math.cos(E)*Math.cos(A),tg[1]+r*Math.sin(E),tg[2]+r*Math.cos(E)*Math.sin(A)]; };
const CH=[[0,4,'01','STUDIO REVEAL','SOFTBOX CYCLORAMA · PROGRESSIVE RENDER'],[4,8,'02','PROCEDURAL BODY','LOFTED RING-INSET SURFACE · NO MODELS'],[8,9.6,'03','2×2 TWILL CARBON','PROCEDURAL WEAVE · ANISOTROPIC SHEEN'],
  [9.6,11,'04','LIGHT SIGNATURE','FULL-WIDTH LED BAR · BLOOM'],[11,15.5,'05','X-RAY','HYBRID POWERTRAIN · PUSHROD SUSPENSION'],[15.5,19,'06','AERO','STREAMLINES · WING-TIP VORTICES'],[19,27,'07','NIGHT TRACK','WET ASPHALT · 290 KM/H · MOTION BLUR']];
function TL(t){
  const o={mode:'studio',xray:0,aero:0,head:1,studioK:1,speed:0,brake:0,steer:0.16,fade:1,scan:-9,lab:0};
  let pos,tgt,fov=28;
  if(t<4){ const u=ease(ss(0,4,t)); tgt=[0.05,0.42,0]; pos=orb(lerp(36,47,u),lerp(8,11,u),lerp(7.8,6.6,u),tgt); fov=28; o.studioK=ss(0.15,3.0,t); o.head=ss(2.3,2.8,t); o.fade=ss(0,0.6,t); }
  else if(t<8){ const u=ease(ss(4,8,t)); tgt=[lerp(0.05,-0.2,u),0.45,0]; pos=orb(lerp(47,158,u),lerp(11,14,u),lerp(6.6,7.1,u),tgt); fov=28; }
  else if(t<9.6){ const u=ss(8,9.6,t); tgt=L3([-2.30,1.06,0.62],[-2.48,1.05,0.70],u); pos=L3([-2.55,2.05,1.75],[-3.25,1.95,1.55],u); fov=30; }
  else if(t<11){ const u=ss(9.6,11,t); tgt=L3([2.35,0.40,0.50],[2.35,0.40,0.35],u); pos=L3([3.85,0.44,1.95],[3.55,0.40,1.30],u); fov=32; o.head=t<9.85?0:(t<9.95?1:(t<10.05?0.15:1)); }
  else if(t<15.5){ const u=ease(ss(11,15.5,t)); tgt=[0,0.38,0]; pos=orb(lerp(62,18,u),lerp(24,19,u),lerp(7.0,6.6,u),tgt); fov=30; o.xray=ss(11.2,12.2,t)*(1-ss(15.0,15.5,t)); o.studioK=1-0.8*o.xray; o.scan=lerp(3.4,-3.4,ss(11.2,12.6,t)); o.lab=ss(12.2,12.6,t)*(1-ss(14.8,15.1,t)); }
  else if(t<19){ const u=ease(ss(15.5,19,t)); tgt=[lerp(0.4,-0.6,u),0.5,0]; pos=orb(lerp(118,72,u),lerp(17,13,u),lerp(8.0,7.2,u),tgt); fov=30; o.aero=ss(15.6,17.2,t); o.fade=1-ss(18.7,19.0,t); }
  else if(t<27){ o.mode='night'; o.steer=0; o.speed=80; o.fade=t<19.4?ss(19.0,19.4,t):1;
    if(t<21.6){ const u=ss(19,21.6,t); tgt=[0.6,0.42,0]; pos=L3([7.2,0.52,3.4],[4.9,0.48,2.7],u); fov=32; }
    else if(t<24){ const u=ss(21.6,24,t); tgt=[lerp(0.4,-0.4,u),0.42,0]; pos=[lerp(1.4,-1.2,u),0.55,6.4]; fov=32; }
    else if(t<25.6){ const u=ss(24,25.6,t); tgt=[-0.6,0.42,0]; pos=L3([-5.8,0.78,3.3],[-5.0,0.66,2.7],u); fov=32; o.brake=ss(24.15,24.4,t)*(1-ss(25.3,25.6,t)); o.speed=lerp(80,62,ss(24.15,25.4,t)); }
    else { const u=ss(25.6,27,t); tgt=[0.2,0.55,0]; pos=L3([-10.5,2.7,0.6],[-8.6,2.25,0.35],u); fov=30; o.speed=lerp(62,80,ss(25.6,26.8,t)); }
    o.shake=1; }
  else { o.mode='night'; o.steer=0; o.speed=80; const u=ss(27,30,t); tgt=[0.3,0.48,0]; pos=L3([6.0,0.95,4.6],[5.3,0.88,4.0],u); fov=30; o.end=ss(27.3,28.2,t); o.dim=ss(27.2,28.0,t); o.fade=1-ss(29.55,30,t)*0.0; o.shake=0.5; }
  o.pos=pos; o.tgt=tgt; o.fov=fov; return o; }
function distAt(t){ // integrate speed (closed form-ish by sampling)
  let d=0; const dt=1/240; for(let x=19;x<t;x+=dt) d+=TL(x).speed*dt; return d; }
let distCache={t:19,d:0};
function distFast(t){ if(t<19) return 0; if(t<distCache.t){ distCache={t:19,d:0}; } let {t:tt,d}=distCache; const dt=1/480; while(tt+dt<=t){ d+=TL(tt).speed*dt; tt+=dt; } distCache={t:tt,d}; return d+TL(tt).speed*(t-tt); }
function applyTL(t){
  const o=TL(t); if(S.mode!==o.mode) applyMode(o.mode);
  S.xray=o.xray; S.aero=o.aero; S.head=o.head; S.studioK=o.studioK; S.speed=o.speed; S.brake=o.brake; S.steer=o.steer; S.lights=1; S.dist=distFast(t);
  XU.uScan.value=o.scan;
  let pos=o.pos.slice(), tgt=o.tgt.slice();
  if(o.shake){ const k=o.shake*0.006; pos[1]+=Math.sin(t*37.0)*k+Math.sin(t*23.1)*k*0.7; pos[2]+=Math.sin(t*29.3)*k*0.6; }
  camera.position.set(...pos); camera.fov=o.fov; camera.updateProjectionMatrix(); camera.lookAt(new THREE.Vector3(...tgt)); camera.updateMatrixWorld();
  applyDynamic(t); return o; }
function recFrame(t){
  const night=TL(t).mode==='night'; const spp=Number(Q.get('spp'))||(night?5:4); const shutter=1/60;
  pipe.reset(); let o;
  for(let i=0;i<spp;i++){ const ts=t+(spp>1?(i/(spp-1)-0.5):0)*shutter*(night?1:0.6); o=applyTL(ts); jitterSample(i); pipe.sample(scene,camera,(i<2||i===spp-1)?refl:null,true); }
  o=applyTL(t);
  pipe.grade.uniforms.uFade.value=o.fade*(1-0.55*(o.dim||0)); pipe.grade.uniforms.uVig.value=(o.mode==='night'?0.45:0.32)+0.4*(o.dim||0); pipe.grade.uniforms.uSeed.value=Math.floor(t*30)%997; pipe.present();
  // overlay
  const ch=CH.find(c=>t>=c[0]&&t<c[1]); const ce=$('rChap');
  if(ch){ const a=ss(ch[0]+0.15,ch[0]+0.6,t)*(1-ss(ch[1]-0.45,ch[1]-0.1,t)); ce.style.opacity=a*(t<4?ss(1.2,1.8,t):1); $('rN').textContent=ch[2]+' / 07'; $('rH').textContent=ch[3]; $('rS').textContent=ch[4]; ce.style.transform=`translateX(${(1-a)*-20}px)`; } else ce.style.opacity=0;
  $('rTc').innerHTML=`<span class="acc">● ACCUMULATING ${spp}/${spp} · ${night?'MOTION BLUR':'SOFT SHADOWS'}</span><br>NOCTIS <b>HC-24</b> · T+<b>${t.toFixed(2)}</b>S<br>${night?'<b>'+Math.round(o.speed*3.6)+'</b> KM/H':'STUDIO · <b>SOFTBOX</b>'}`;
  $('rTc').style.opacity=t<1.0?0:(t>27.2?1-ss(27.2,27.8,t):ss(1.0,1.6,t));
  document.querySelector('#rec .brand').style.opacity=t<1.0?0:(t>27.2?1-ss(27.2,27.8,t):ss(1.0,1.6,t));
  const e=$('rEnd'); e.style.opacity=o.end||0; e.style.transform=`translateY(${(1-(o.end||0))*14}px)`;
  updLabels(o.lab*1.4,0.06);
  return true; }

window.__dbg={S,TL,pipe,camera,studio,C,N,scene};
window.__probe=(px,py)=>{ const rc=new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(px/1920*2-1,-(py/1080*2-1)),camera); return rc.intersectObjects(scene.children,true).slice(0,6).map(h=>[h.object.type,h.object.material&&h.object.material.type,h.object.material&&h.object.material.customProgramCacheKey&&h.object.material.customProgramCacheKey(),h.distance.toFixed(2),h.point.toArray().map(v=>v.toFixed(2)).join(',')].join(' ')); };
if(REC){ window.__rf=(t)=>recFrame(t); (document.fonts?document.fonts.ready:Promise.resolve()).then(()=>{ recFrame(0.5); window.__ready=true; }); }
else { applyMode('studio'); window.__app={S,goPreset,switchMode,setX,setA,setLiv,pipe};
  window.__rf=(t)=>{ recFrame(t); return true; };
  (document.fonts?document.fonts.ready:Promise.resolve()).then(()=>{ requestAnimationFrame(loop); window.__ready=true; }); }
