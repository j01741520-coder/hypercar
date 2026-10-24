import * as THREE from 'three';
import {reflectiveGround} from './engine.js';
import {noiseCanvas} from './tex.js';
function rng(seed){let s=seed>>>0;return ()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
export const PERIOD=60;
export function nightEnvMap(renderer){
  const s=new THREE.Scene();
  const sky=new THREE.Mesh(new THREE.SphereGeometry(50,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,uniforms:{},vertexShader:`varying vec3 vP; void main(){vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`varying vec3 vP; void main(){ vec3 d=normalize(vP); float h=d.y; vec3 c=mix(vec3(0.010,0.013,0.022),vec3(0.0015,0.002,0.005),smoothstep(0.0,0.5,h));
      c+=vec3(0.06,0.035,0.02)*exp(-abs(h)*14.0)*(0.6+0.4*d.x); if(h<0.0) c=vec3(0.004,0.004,0.005); gl_FragColor=vec4(c,1.0);} `})); s.add(sky);
  const B=(c)=>new THREE.MeshBasicMaterial({color:c});
  for(let i=0;i<10;i++){ const m=new THREE.Mesh(new THREE.PlaneGeometry(1.2,0.5),B(new THREE.Color(9,7.2,5.2))); const x=-25+i*6; m.position.set(x,9,(i%2?1:-1)*10); m.lookAt(0,0,0); s.add(m); }
  const st=new THREE.Mesh(new THREE.PlaneGeometry(40,0.4),B(new THREE.Color(0.8,0.5,0.3))); st.position.set(30,2,0); st.lookAt(0,1,0); s.add(st);
  const pm=new THREE.PMREMGenerator(renderer); const t=pm.fromScene(s,0.03).texture; pm.dispose(); return t;
}
function roadTextures(){
  const N=2048, c=document.createElement('canvas'); c.width=c.height=N; const g=c.getContext('2d');
  const nz=noiseCanvas(512,11,6); const fine=noiseCanvas(256,5,4);
  // u = x along track (15 m tile -> N px), v = z across (-9..9)
  const tz=z=>(z+9)/18*N, tx=x=>x/15*N;
  g.fillStyle='#202124'; g.fillRect(0,0,N,N);
  g.globalAlpha=0.55; g.globalCompositeOperation='multiply'; for(let i=0;i<4;i++) for(let j=0;j<4;j++) g.drawImage(nz,i*512,j*512);
  g.globalAlpha=0.5; for(let i=0;i<8;i++) for(let j=0;j<8;j++) g.drawImage(fine,i*256,j*256); g.globalCompositeOperation='source-over'; g.globalAlpha=1;
  // rubbered racing line
  const lg=g.createLinearGradient(0,tz(-3.0),0,tz(2.0)); lg.addColorStop(0,'rgba(0,0,0,0)'); lg.addColorStop(0.5,'rgba(0,0,0,0.35)'); lg.addColorStop(1,'rgba(0,0,0,0)'); g.fillStyle=lg; g.fillRect(0,tz(-3.0),N,tz(2.0)-tz(-3.0));
  // edge lines + kerbs + run-off
  g.fillStyle='#d8d8d0'; for(const z of [-5.75,5.55]) g.fillRect(0,tz(z),N,tz(z+0.2)-tz(z));
  for(let k=0;k<10;k++){ g.fillStyle=k%2?'#e8e6e0':'#c3101a'; for(const z of [-6.9,5.85]) g.fillRect(tx(k*1.5),tz(z),tx(1.5)+1,tz(z+1.05)-tz(z)); }
  g.fillStyle='#0c0f0b'; g.fillRect(0,0,N,tz(-6.9)); g.fillRect(0,tz(6.9),N,N-tz(6.9));
  g.globalAlpha=0.6; g.globalCompositeOperation='multiply'; g.drawImage(nz,0,0,N,tz(-6.9)); g.drawImage(nz,0,tz(6.9),N,N-tz(6.9)); g.globalCompositeOperation='source-over'; g.globalAlpha=1;
  const map=new THREE.CanvasTexture(c); map.colorSpace=THREE.SRGBColorSpace; map.wrapS=THREE.RepeatWrapping; map.anisotropy=16;
  // wetness / roughness: puddles
  const r=document.createElement('canvas'); r.width=r.height=1024; const rg=r.getContext('2d'); const big=noiseCanvas(256,23,5);
  rg.drawImage(big,0,0,1024,1024); const id=rg.getImageData(0,0,1024,1024); const fid=fine.getContext('2d').getImageData(0,0,256,256);
  for(let i=0;i<1024*1024;i++){ const v=id.data[i*4]/255; const f=fid.data[((i>>10)%256*256+(i%1024)%256)*4]/255; const puddle=v>0.52?1:0; const rough=puddle?0.06:0.28+0.35*f; const b=Math.round(rough*255); id.data[i*4]=id.data[i*4+1]=b; id.data[i*4+2]=255; }
  rg.putImageData(id,0,0); const rough=new THREE.CanvasTexture(r); rough.wrapS=rough.wrapT=THREE.RepeatWrapping;
  // wet mask for reflection (r=wetness, gb=distortion)
  const w=document.createElement('canvas'); w.width=w.height=512; const wg=w.getContext('2d'); wg.drawImage(big,0,0,512,512); const wd=wg.getImageData(0,0,512,512); const n2=noiseCanvas(512,77,5).getContext('2d').getImageData(0,0,512,512);
  for(let i=0;i<512*512;i++){ wd.data[i*4+1]=n2.data[i*4]; wd.data[i*4+2]=n2.data[((i+37)%(512*512))*4]; } wg.putImageData(wd,0,0);
  const wet=new THREE.CanvasTexture(w); wet.wrapS=wet.wrapT=THREE.RepeatWrapping;
  return {map,rough,wet};
}
export function buildNight(refl){
  const g=new THREE.Group(); g.name='night'; g.visible=false;
  const track=new THREE.Group(); g.add(track);
  const T=roadTextures();
  const L0=-180, L1=420, LEN=L1-L0;
  const rm=new THREE.MeshStandardMaterial({map:T.map,roughnessMap:T.rough,roughness:1,metalness:0,color:0xb0b0b0});
  T.map.repeat.set(LEN/15,1); T.rough.repeat.set(LEN/9,18/9);
  const RU=reflectiveGround(rm,refl,{k:1.0,blur:0.035,stretch:3.2,wet:1,tWet:T.wet,wetScale:0.11,key:'road'});
  const road=new THREE.Mesh(new THREE.PlaneGeometry(LEN,18,1,1),rm); road.rotation.x=-Math.PI/2; road.position.x=(L0+L1)/2; road.receiveShadow=true; track.add(road);
  const grass=new THREE.Mesh(new THREE.PlaneGeometry(LEN,200),new THREE.MeshStandardMaterial({color:0x030403,roughness:1})); grass.rotation.x=-Math.PI/2; grass.position.set((L0+L1)/2,-0.02,0); track.add(grass);
  // armco barriers
  const prof=new THREE.Shape(); const pp=[[0,0],[0.02,0],[0.05,0.08],[0.02,0.16],[0.05,0.24],[0.02,0.31],[0,0.31]]; prof.moveTo(pp[0][0],pp[0][1]); pp.slice(1).forEach(p=>prof.lineTo(p[0],p[1]));
  const armM=new THREE.MeshStandardMaterial({color:0x9da3aa,metalness:0.9,roughness:0.35});
  for(const s of [1,-1]){ const ex=new THREE.ExtrudeGeometry(prof,{depth:LEN,bevelEnabled:false}); ex.rotateY(Math.PI/2); const m=new THREE.Mesh(ex,armM); m.position.set(L0,0.45,s*9.3); m.scale.z=s; track.add(m); }
  const post=new THREE.InstancedMesh(new THREE.BoxGeometry(0.08,0.75,0.1),new THREE.MeshStandardMaterial({color:0x50555c,metalness:0.7,roughness:0.5}),2*Math.ceil(LEN/4));
  { let k=0; const m=new THREE.Matrix4(); for(let x=L0;x<L1;x+=4) for(const s of [1,-1]){ m.makeTranslation(x,0.37,s*9.38); post.setMatrixAt(k++,m);} post.count=k; } track.add(post);
  // lamp poles every 30 m alternating sides
  const poleG=new THREE.CylinderGeometry(0.09,0.13,9,10); poleG.translate(0,4.5,0); const armG=new THREE.BoxGeometry(0.1,0.1,2.6); armG.translate(0,8.9,1.2);
  const headG=new THREE.BoxGeometry(0.9,0.12,0.4); headG.translate(0,8.82,2.3); const lensG=new THREE.PlaneGeometry(0.8,0.32); lensG.rotateX(Math.PI/2); lensG.translate(0,8.755,2.3);
  const poleM=new THREE.MeshStandardMaterial({color:0x2a2d31,metalness:0.6,roughness:0.5}); const lensM=new THREE.MeshBasicMaterial({color:new THREE.Color(30,24,17)});
  const lamps=[]; const nl=Math.ceil(LEN/30);
  const pI=new THREE.InstancedMesh(poleG,poleM,nl), aI=new THREE.InstancedMesh(armG,poleM,nl), hI=new THREE.InstancedMesh(headG,poleM,nl), lI=new THREE.InstancedMesh(lensG,lensM,nl);
  { const m=new THREE.Matrix4(),q=new THREE.Quaternion(),S=new THREE.Vector3(1,1,1); let k=0; for(let x=L0;x<L1;x+=30){ const side=(Math.round(x/30)%2===0)?1:-1;
      q.setFromAxisAngle(new THREE.Vector3(0,1,0),side>0?Math.PI:0); m.compose(new THREE.Vector3(x,0,side*10.4),q,S); [pI,aI,hI,lI].forEach(I=>I.setMatrixAt(k,m)); lamps.push({x,side}); k++; } }
  track.add(pI,aI,hI,lI);
  const poolSpots=[];
  for(const L of lamps.filter(l=>l.x>=-30&&l.x<=60)){ const sp=new THREE.SpotLight(0xffd9a8,1400,60,0.95,0.75,2); sp.position.set(L.x,8.7,L.side*(10.4-2.3)); sp.target.position.set(L.x+1,0,L.side*4.5); track.add(sp,sp.target); poolSpots.push(sp);
    if(L.x===0||L.x===30){ sp.castShadow=true; sp.shadow.mapSize.set(1024,1024); sp.shadow.camera.near=2; sp.shadow.camera.far=16; sp.shadow.bias=-0.0003; sp.shadow.normalBias=0.02; } }
  // tree-line silhouettes (periodic every PERIOD so the scroll is seamless)
  { const R=rng(3); const prof=[]; const NP=240; for(let i=0;i<=NP;i++){ prof.push(0); }
    const bumps=[]; for(let i=0;i<70;i++) bumps.push([R()*PERIOD,2.0+R()*4.5,0.8+R()*2.2]);
    const hgt=x=>{ let h=3.5; for(const [c,a,w] of bumps){ for(const o of [-PERIOD,0,PERIOD]){ const d=(x-c-o)/w; h=Math.max(h,3.5+a*Math.max(0,1-d*d)); } } return h+Math.sin(x*3.1)*0.25+Math.sin(x*7.3)*0.15; };
    const tm=new THREE.MeshBasicMaterial({color:0x010201}); 
    for(const [zz,sc] of [[24,1.0],[-26,1.15],[45,1.8],[-48,1.9]]){ const n=Math.round(LEN/0.25); const pos=[],idx=[];
      for(let i=0;i<=n;i++){ const x=L0+i*LEN/n; const h=hgt(((x%PERIOD)+PERIOD)%PERIOD+(zz>0?0:17))*sc; pos.push(x,-0.1,zz, x,h,zz); if(i<n){ const k=i*2; idx.push(k,k+2,k+1,k+1,k+2,k+3); } }
      const tg=new THREE.BufferGeometry(); tg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); tg.setIndex(idx); const m=new THREE.Mesh(tg,tm); m.material.side=THREE.DoubleSide; track.add(m); } }
  // distant grandstand + ferris wheel (parallax layer)
  const far=new THREE.Group(); g.add(far);
  { const gs=new THREE.Mesh(new THREE.BoxGeometry(180,10,8),new THREE.MeshStandardMaterial({color:0x050608,roughness:1})); gs.position.set(140,5,-60); far.add(gs);
    const R=rng(9); const pts=[]; const cols=[];
    for(let i=0;i<500;i++){ pts.push(50+R()*180,1+R()*9,-55.5); const c=R()<0.7?[1.0,0.82,0.6]:[0.6,0.8,1.0]; const k=2+R()*6; cols.push(c[0]*k,c[1]*k,c[2]*k); }
    const pg=new THREE.BufferGeometry(); pg.setAttribute('position',new THREE.Float32BufferAttribute(pts,3)); pg.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));
    far.add(new THREE.Points(pg,new THREE.PointsMaterial({size:0.35,vertexColors:true,sizeAttenuation:true,fog:false})));
    const fw=new THREE.Group(); fw.position.set(230,30,-120); far.add(fw); const fp=[],fc=[];
    for(let i=0;i<120;i++){ const a=i/120*Math.PI*2; fp.push(Math.cos(a)*26,Math.sin(a)*26,0); const h=new THREE.Color().setHSL((i/120*3)%1,0.8,0.6); fc.push(h.r*6,h.g*6,h.b*6); }
    for(let s=0;s<24;s++){ const a=s/24*Math.PI*2; for(let j=1;j<8;j++){ fp.push(Math.cos(a)*26*j/8,Math.sin(a)*26*j/8,0); fc.push(4,3.2,2.4);} }
    const fg=new THREE.BufferGeometry(); fg.setAttribute('position',new THREE.Float32BufferAttribute(fp,3)); fg.setAttribute('color',new THREE.Float32BufferAttribute(fc,3));
    fw.add(new THREE.Points(fg,new THREE.PointsMaterial({size:0.8,vertexColors:true,fog:false}))); far.userData.wheel=fw;
    const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.8,30,6),new THREE.MeshBasicMaterial({color:0x020203})); leg.position.set(230,15,-121); far.add(leg); }
  // sky dome
  const sky=new THREE.Mesh(new THREE.SphereGeometry(480,48,24),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms:{},vertexShader:`varying vec3 vP; void main(){vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`varying vec3 vP; float h12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
    void main(){ vec3 d=normalize(vP); float h=d.y; vec3 c=mix(vec3(0.012,0.017,0.03),vec3(0.002,0.003,0.008),smoothstep(0.0,0.45,h));
      c+=vec3(0.07,0.04,0.022)*exp(-max(h,0.0)*10.0)*(0.55+0.45*smoothstep(-0.5,1.0,d.x));
      vec2 sp=vec2(atan(d.z,d.x)*180.0,h*300.0); vec2 id=floor(sp); float st=h12(id); if(st>0.993&&h>0.08){ vec2 f=fract(sp)-0.5; c+=vec3(0.5,0.55,0.7)*smoothstep(0.25,0.0,length(f))*(st-0.993)*140.0; }
      gl_FragColor=vec4(c,1.0);} `})); g.add(sky);
  // lights that travel with the car
  const hemi=new THREE.HemisphereLight(0x223355,0x050505,0.25); g.add(hemi);
  const heads=[]; for(const z of [0.62,-0.62]){ const sp=new THREE.SpotLight(0xeef3ff,1500,90,0.30,0.55,2); sp.position.set(2.45,0.45,z); sp.target.position.set(22,0,z*1.6); g.add(sp,sp.target); heads.push(sp); }
  heads[0].castShadow=false;
  const tail=new THREE.PointLight(0xff1010,4,7,2); tail.position.set(-2.7,0.7,0); g.add(tail);
  // headlight volumetric cones
  const coneM=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uK:{value:1}},side:THREE.DoubleSide,
    vertexShader:`varying float vT; varying vec3 vN; varying vec3 vV; void main(){ vT=uv.y; vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader:`uniform float uK; varying float vT; varying vec3 vN; varying vec3 vV; void main(){ float t=1.0-vT; float e=pow(abs(dot(normalize(vN),normalize(vV))),1.5); float a=e*pow(1.0-t,1.4)*smoothstep(0.0,0.06,t)*0.05*uK; gl_FragColor=vec4(vec3(0.85,0.9,1.0)*a,1.0);} `});
  const cones=[]; for(const z of [0.62,-0.62]){ const cg=new THREE.ConeGeometry(4.2,26,32,1,true); cg.translate(0,-13,0); cg.rotateZ(Math.PI/2); const c=new THREE.Mesh(cg,coneM); c.position.set(2.45,0.45,z); c.rotation.z=-0.035; c.rotation.y=-z*0.02; c.renderOrder=5; g.add(c); cones.push(c); }
  // speed streaks
  const R=rng(42); const NS=140; const sg=new THREE.PlaneGeometry(1,1); const sm=new THREE.MeshBasicMaterial({color:new THREE.Color(0.55,0.7,1.0),transparent:true,opacity:0.22,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false});
  const streak=new THREE.InstancedMesh(sg,sm,NS); const sd=[]; for(let i=0;i<NS;i++){ const side=R()<0.5?-1:1; sd.push({x:R()*120-50,y:0.25+Math.pow(R(),1.5)*3.2,z:side*(1.6+R()*7.0),l:1.5+R()*5,w:0.004+R()*0.009,v:0.6+R()*0.5,flat:false}); }
  streak.frustumCulled=false; streak.renderOrder=6; g.add(streak);
  // tail light trails (long exposure ribbons)
  const trailM=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,uniforms:{uK:{value:1},uT:{value:0}},fog:false,
    vertexShader:`varying vec2 vU; void main(){vU=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`uniform float uK; uniform float uT; varying vec2 vU; void main(){ float t=vU.x; float a=pow(1.0-t,2.2)*smoothstep(0.0,0.02,t)*(1.0-pow(abs(vU.y-0.5)*2.0,2.0)); a*=0.8+0.2*sin(t*60.0-uT*40.0); gl_FragColor=vec4(vec3(1.0,0.05,0.03)*a*2.2*uK,1.0);} `});
  const trails=[]; for(const [z,y] of [[0.90,0.71],[-0.90,0.71],[0.0,0.45]]){ const pg=new THREE.PlaneGeometry(1,1,120,1); const pa=pg.attributes.position, uv=pg.attributes.uv;
      for(let i=0;i<pa.count;i++){ const u=uv.getX(i), v=uv.getY(i); const x=-2.5-u*38; const wob=Math.sin(u*9.0)*0.03*u; pa.setXYZ(i,x,y+(v-0.5)*(z===0?0.03:0.035)*(1+u*1.5)+wob,z*(1+u*0.04)); }
      pg.computeBoundingSphere(); const m=new THREE.Mesh(pg,trailM); m.renderOrder=7; m.frustumCulled=false; g.add(m); trails.push(m); }
  return {group:g,track,road,RU,poolSpots,heads,tail,cones,coneM,streak,sd,trailM,trails,far,hemi};
}
const _m=new THREE.Matrix4(),_q=new THREE.Quaternion(),_e=new THREE.Euler(),_s=new THREE.Vector3(),_p=new THREE.Vector3();
export function updateNight(N,dist,speed,t,camPos){
  N.track.position.x=-(dist%PERIOD); N.RU.uOff.value.set(dist%PERIOD*0+ (dist%PERIOD),0);
  N.far.position.x=-dist*0.04; N.far.userData.wheel.rotation.z=t*0.05;
  const k=Math.min(1,speed/60);
  for(let i=0;i<N.sd.length;i++){ const d=N.sd[i]; let x=((d.x-dist*d.v*0.9)%120+120)%120-50; const L=d.l*(0.3+k*1.7);
    if(d.flat){ _e.set(-Math.PI/2,0,0); _s.set(L,d.w*3,1); _p.set(x,0.012,d.z); } else { _e.set(0,0,0); _s.set(L,d.w,1); _p.set(x,d.y,d.z); }
    _q.setFromEuler(_e); _m.compose(_p,_q,_s); N.streak.setMatrixAt(i,_m); }
  N.streak.instanceMatrix.needsUpdate=true; N.streak.material.opacity=0.16*k;
  N.trailM.uniforms.uT.value=t; N.trailM.uniforms.uK.value=k;
}
