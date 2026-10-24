import * as THREE from 'three';
import {reflectiveGround} from './engine.js';
import {RectAreaLightUniformsLib} from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
export function studioEnvMap(renderer){
  const s=new THREE.Scene(); const B=(c)=>new THREE.MeshBasicMaterial({color:c,side:THREE.DoubleSide});
  const room=new THREE.Mesh(new THREE.SphereGeometry(40,32,16),new THREE.MeshBasicMaterial({color:new THREE.Color(0.006,0.0065,0.008),side:THREE.BackSide})); s.add(room);
  const fl=new THREE.Mesh(new THREE.CircleGeometry(40,48),B(new THREE.Color(0.018,0.018,0.02))); fl.rotation.x=-Math.PI/2; fl.position.y=-0.01; s.add(fl);
  const box=(w,h,x,y,z,k,rx=0,ry=0,col=[1,1,1])=>{ const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),B(new THREE.Color(col[0]*k,col[1]*k,col[2]*k))); m.position.set(x,y,z); m.rotation.set(rx,ry,0); s.add(m); return m; };
  box(7,2.6,0,6.5,0,7.0,Math.PI/2);            // overhead softbox
  box(1.0,7,-1.6,6.4,0,2.5,Math.PI/2);         // secondary strip
  for(const z of [-7,7]){ box(5.5,0.55,0.5,2.6,z,4.5,0,0); box(5.5,0.25,0.5,0.9,z,2.0,0,0); } // long side strips (horizon line on paint)
  box(0.6,4,-8,2.5,-3,3.5,0,Math.PI/2,[1,0.95,0.9]); box(0.6,4,8,2.5,3,3.0,0,-Math.PI/2,[0.9,0.95,1]);
  box(3,1,9,3.5,-6,1.2,0,-Math.PI/3,[0.85,0.92,1.0]);
  const pm=new THREE.PMREMGenerator(renderer); const t=pm.fromScene(s,0.025).texture; pm.dispose(); return t;
}
export function buildStudio(refl){
  const g=new THREE.Group(); g.name='studio';
  // infinity cove (lathe bowl)
  const pts=[]; const R0=9, rc=4;
  for(let i=0;i<=24;i++){ const a=i/24*Math.PI/2; pts.push(new THREE.Vector2(R0+rc*Math.sin(a),rc-rc*Math.cos(a))); }
  pts.push(new THREE.Vector2(R0+rc,14));
  const cove=new THREE.Mesh(new THREE.LatheGeometry(pts,96),new THREE.MeshStandardMaterial({color:0x2c2e33,roughness:0.95,side:THREE.BackSide,emissive:0x0a0b0d})); cove.receiveShadow=true; g.add(cove);
  const fm=new THREE.MeshStandardMaterial({color:0x08090a,roughness:0.5,metalness:0.0});
  const RU=reflectiveGround(fm,refl,{k:0.32,blur:0.022,stretch:1.0,key:'studio'});
  const floor=new THREE.Mesh(new THREE.CircleGeometry(R0+0.01,96),fm); floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; g.add(floor);
  // visible softbox panels overhead
  const sb=new THREE.Mesh(new THREE.PlaneGeometry(7,2.6),new THREE.MeshBasicMaterial({color:new THREE.Color(3,3,3)})); sb.rotation.x=Math.PI/2; sb.position.set(0,6.5,0); g.add(sb);
  // lights
  RectAreaLightUniformsLib.init();
  const area=new THREE.RectAreaLight(0xffffff,9,7,2.6); area.position.set(0,6.45,0); area.lookAt(0,0,0); g.add(area);
  const side1=new THREE.RectAreaLight(0xf4f6ff,5,5.5,0.5); side1.position.set(0.5,2.6,7); side1.lookAt(0.5,0.6,0); g.add(side1);
  const side2=new THREE.RectAreaLight(0xfff6ee,4,5.5,0.5); side2.position.set(0.5,2.6,-7); side2.lookAt(0.5,0.6,0); g.add(side2);
  const key=new THREE.SpotLight(0xffffff,200,0,0.55,0.85,2); key.position.set(0,6.4,0); key.target.position.set(0,0,0); key.castShadow=true;
  key.shadow.mapSize.set(2048,2048); key.shadow.camera.near=3; key.shadow.camera.far=9; key.shadow.bias=-0.00015; key.shadow.normalBias=0.012; key.shadow.radius=2;
  g.add(key,key.target);
  const rimA=new THREE.SpotLight(0xdfe8ff,160,0,0.5,1,2); rimA.position.set(-6.5,2.4,-4.5); rimA.target.position.set(0,0.4,0); g.add(rimA,rimA.target);
  const rimB=new THREE.SpotLight(0xffeedd,120,0,0.5,1,2); rimB.position.set(6.5,2.2,4.8); rimB.target.position.set(0,0.4,0); g.add(rimB,rimB.target);
  const hemi=new THREE.HemisphereLight(0x8090a0,0x101010,0.15); g.add(hemi);
  // contact shadow
  const c=document.createElement('canvas'); c.width=256; c.height=128; const x=c.getContext('2d');   x.fillStyle='#000'; x.fillRect(0,0,256,128); x.save(); x.scale(1,0.5); const gr=x.createRadialGradient(128,128,4,128,128,128);
  gr.addColorStop(0,'rgb(235,235,235)'); gr.addColorStop(0.5,'rgb(150,150,150)'); gr.addColorStop(1,'rgb(0,0,0)'); x.fillStyle=gr; x.fillRect(0,0,256,256); x.restore();
  const cs=new THREE.Mesh(new THREE.PlaneGeometry(5.6,2.5),new THREE.MeshBasicMaterial({alphaMap:new THREE.CanvasTexture(c),transparent:true,depthWrite:false,color:0x000000,opacity:0.85}));
  cs.rotation.x=-Math.PI/2; cs.position.y=0.003; cs.renderOrder=1; g.add(cs);
  return {group:g,area,side1,side2,key,rimA,rimB,hemi,floor,RU,softbox:sb,contact:cs,cove};
}
