import * as THREE from 'three';
import {H,zScale,Bot,XN,XT} from './shape.js';
function surfTop(x,z){ // height of the car top at (x,z) (0 = ground) incl. wing
  if(x>XN+0.06||x<XT-0.05) { return (x<-2.18&&x>-2.66&&Math.abs(z)<0.95)?1.11:0; }
  const zs=zScale(x); const zd=z/zs; if(Math.abs(zd)>1.0) return 0; let h=H(x,zd);
  if(x<-2.18&&x>-2.66&&Math.abs(z)<0.95) h=Math.max(h,1.11);
  if(x<-0.4&&x>-2.35&&Math.abs(z)<0.04) h=Math.max(h,1.09);
  return h; }
export function buildAero(){
  const g=new THREE.Group(); g.name='aero'; g.visible=false;
  const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uT:{value:0},uK:{value:0}},
    vertexShader:`attribute float aSpd; attribute float aPh; varying vec2 vU; varying float vS; varying float vP; void main(){ vU=uv; vS=aSpd; vP=aPh; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader:`uniform float uT; uniform float uK; varying vec2 vU; varying float vS; varying float vP; void main(){ float u=vU.x;
      float fade=smoothstep(0.0,0.08,u)*(1.0-smoothstep(0.82,1.0,u));
      float pulse=pow(fract(u*7.0-uT*0.9*(0.8+vS*0.6)+vP),10.0);
      vec3 slow=vec3(0.15,0.35,1.0), fast=vec3(0.35,1.0,1.0), hot=vec3(1.0,0.45,0.25);
      vec3 c=mix(slow,fast,clamp(vS,0.0,1.0)); c=mix(c,hot,smoothstep(1.05,1.4,vS));
      float reveal=smoothstep(u-0.15,u,uK*1.15);
      float a=fade*(0.05+1.1*pulse)*reveal; gl_FragColor=vec4(c*a,1.0);} `});
  const lines=[];
  const add=(pts,spd,ph)=>{ const curve=new THREE.CatmullRomCurve3(pts); const tg=new THREE.TubeGeometry(curve,Math.min(400,pts.length*2),0.0055,5,false);
    const n=tg.attributes.position.count; const sa=new Float32Array(n), pa=new Float32Array(n); const uv=tg.attributes.uv;
    for(let i=0;i<n;i++){ const u=uv.getX(i); sa[i]=spd(u); pa[i]=ph; } tg.setAttribute('aSpd',new THREE.BufferAttribute(sa,1)); tg.setAttribute('aPh',new THREE.BufferAttribute(pa,1)); lines.push(tg); };
  // over-body lines
  const zs=[]; for(let i=0;i<=16;i++) zs.push(-0.96+1.92*i/16);
  zs.forEach((z0,i)=>{ for(const h0 of [0.035,0.11]){ if(h0>0.05&&i%2) continue; const pts=[]; let yPrev=0;
      for(let x=4.2;x>=-8;x-=0.05){ let m=0; for(let dx=0;dx<=0.9;dx+=0.05){ m=Math.max(m,surfTop(x+dx,z0)-dx*0.55); } for(let dx=0;dx<=1.8;dx+=0.1){ m=Math.max(m,surfTop(x-dx,z0)*Math.exp(-dx*2.5)-0.0); }
        let y=Math.max(m,0.0)+h0+0.04*(x<XT?1:0);
        if(x<-2.6){ const s=x+2.6; const top=Math.abs(z0)<0.95; y=top? y+(-s)*0.10*Math.exp(s*0.35)+(1.2-y)*0.0 : y; }
        pts.push(new THREE.Vector3(x,y,z0*(1+0.02*Math.max(0,-x-2.5)))); }
      // smooth
      for(let it=0;it<6;it++) for(let k=1;k<pts.length-1;k++) pts[k].y=(pts[k-1].y+pts[k].y*2+pts[k+1].y)/4;
      add(pts,u=>{ const k=Math.floor(u*(pts.length-1)); const a=pts[Math.max(0,k-1)], b=pts[Math.min(pts.length-1,k+1)]; const sl=Math.abs((b.y-a.y)/(b.x-a.x+1e-6)); return 0.55+Math.min(0.8,sl*1.4)+ (a.y>0.95?0.3:0); }, (i*0.137+h0*3)%1); } });
  // side lines bending round the front wheels
  for(const s of [1,-1]) for(const y0 of [0.18,0.32,0.48]){ const pts=[]; for(let x=4.2;x>=-8;x-=0.05){ let z=1.06; const bulge=Math.exp(-Math.pow((x-1.45)/0.7,2))*0.07+Math.exp(-Math.pow((x+1.7)/0.7,2))*0.06; z+=bulge; if(x>2.6) z=1.06+(x-2.6)*0.0; pts.push(new THREE.Vector3(x,y0+bulge*0.3,s*z)); }
    for(let it=0;it<8;it++) for(let k=1;k<pts.length-1;k++) pts[k].z=(pts[k-1].z+pts[k].z*2+pts[k+1].z)/4;
    add(pts,u=>0.7+0.4*Math.exp(-Math.pow((u-0.27)/0.08,2)),(y0*3.7+s)%1); }
  // wing-tip vortices
  for(const s of [1,-1]) for(let j=0;j<3;j++){ const pts=[]; for(let x=-2.2;x>=-8.5;x-=0.03){ const t=-2.2-x; const r=0.02+0.05*j+t*0.035; const a=t*5.2*s+j*2.1; pts.push(new THREE.Vector3(x,1.12+Math.sin(a)*r-t*0.02,s*(0.955+Math.cos(a)*r*0.9))); }
    add(pts,u=>1.15+0.3*(1-u),j*0.3); }
  // underfloor -> diffuser
  for(const z0 of [-0.45,-0.15,0.15,0.45]){ const pts=[]; for(let x=4.0;x>=-8;x-=0.05){ let y=0.045; if(x>2.6) y=0.10-(x-2.6)*0.0; if(x<-1.3) y=0.045+Math.min(0.45,(-1.3-x)*0.24); if(x<-2.6) y=0.36+(-2.6-x)*0.09*Math.exp((x+2.6)*0.3); pts.push(new THREE.Vector3(x,y,z0)); }
    for(let it=0;it<6;it++) for(let k=1;k<pts.length-1;k++) pts[k].y=(pts[k-1].y+pts[k].y*2+pts[k+1].y)/4;
    add(pts,u=>u<0.55?1.3:0.8,(z0+1)%1); }
  const geo=lines; for(const tg of geo){ const m=new THREE.Mesh(tg,mat); m.renderOrder=8; m.frustumCulled=false; g.add(m); }
  return {group:g,mat};
}
