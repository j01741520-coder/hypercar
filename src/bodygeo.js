import * as THREE from 'three';
import {H,zScale,Bot,XN,XT,WH,winSdf,clamp} from './shape.js';
// Ring-inset parameterisation of a rounded-rectangle plan footprint: every ring is an inset (offset) of the outline,
// so the shoulder/side wall wraps continuously around nose, sides and tail. y = Bot + (H-Bot)*shoulder(d).
export function buildBodyGeometry(NR=900, KS=34, KI=92){
  const xc=(XN+XT)/2, Lh=(XN-XT)/2, Wh=WH, rcF=0.64, rcR=0.30, RR=0.115, P=2.7;
  // outline segments (counter-clockwise seen from above), each sample: point, inward normal, corner info
  const segs=[];
  const line=(ax,az,bx,bz,nx,nz,kind)=>segs.push({t:'l',ax,az,bx,bz,nx,nz,len:Math.hypot(bx-ax,bz-az),kind});
  const arc=(cx,cz,r,a0,a1,sx,sz)=>segs.push({t:'a',cx,cz,r,a0,a1,sx,sz,len:r*Math.abs(a1-a0)});
  line(Lh,0,Lh,Wh-rcF,-1,0,'F');
  arc(Lh-rcF,Wh-rcF,rcF,0,Math.PI/2,1,1);
  line(Lh-rcF,Wh,-Lh+rcR,Wh,0,-1,'R');
  arc(-Lh+rcR,Wh-rcR,rcR,Math.PI/2,Math.PI,-1,1);
  line(-Lh,Wh-rcR,-Lh,-(Wh-rcR),1,0,'T');
  arc(-Lh+rcR,-(Wh-rcR),rcR,Math.PI,1.5*Math.PI,-1,-1);
  line(-Lh+rcR,-Wh,Lh-rcF,-Wh,0,1,'Lf');
  arc(Lh-rcF,-(Wh-rcF),rcF,1.5*Math.PI,2*Math.PI,1,-1);
  line(Lh,-(Wh-rcF),Lh,0,-1,0,'F');
  const tot=segs.reduce((a,s)=>a+s.len,0);
  // non-uniform sampling: denser on corners
  const wts=segs.map(s=>s.t==='a'?1.9:1.0);
  const wtot=segs.reduce((a,s,i)=>a+s.len*wts[i],0);
  function inset(u,d){ // u in [0,1)
    let acc=u*wtot;
    for(let i=0;i<segs.length;i++){ const s=segs[i],L=s.len*wts[i];
      if(acc<=L||i===segs.length-1){ const f=clamp(acc/L,0,1);
        if(s.t==='l'){ let X=s.ax+(s.bx-s.ax)*f, Z=s.az+(s.bz-s.az)*f;
          X+=s.nx*d; Z+=s.nz*d; X=clamp(X,-Lh+d,Lh-d); Z=clamp(Z,-Wh+d,Wh-d); return [X,Z,s.nx,s.nz]; }
        const a=s.a0+(s.a1-s.a0)*f, ca=Math.cos(a), sa=Math.sin(a);
        if(d<s.r) return [s.cx+(s.r-d)*ca, s.cz+(s.r-d)*sa, -ca, -sa];
        return [s.sx*(Lh-d), s.sz*(Wh-d), -ca, -sa]; }
      acc-=L; }
  }
  const ds=[]; for(let k=0;k<KS;k++) ds.push(RR*Math.pow(k/KS,1.9));
  for(let k=0;k<=KI;k++) ds.push(RR+(Wh-0.004-RR)*Math.pow(k/KI,1.0));
  const NK=ds.length;
  const pos=new Float32Array(NR*NK*3), nor=new Float32Array(NR*NK*3);
  const surf=(u,d,out)=>{ const [X,Z,nx,nz]=inset(u,d); const x=X+xc;
    const b=Bot(x), h=H(x,Z); const s=Math.max(0,1-d/RR); const f=Math.pow(1-Math.pow(s,P),1/P);
    const y=b+Math.max(h-b,0.015)*f; out[0]=x; out[1]=y; out[2]=Z*zScale(x); out[3]=nx; out[4]=nz; out[5]=Z; return out; };
  const hs=(x,Z)=>H(x,Z);
  const A=[0,0,0,0,0,0],Bv=[0,0,0,0,0,0],C=[0,0,0,0,0,0],D=[0,0,0,0,0,0];
  const v1=new THREE.Vector3(),v2=new THREE.Vector3(),n=new THREE.Vector3();
  for(let k=0;k<NK;k++){ const d=ds[k];
    for(let i=0;i<NR;i++){ const u=i/NR; surf(u,d,A); const o=(k*NR+i)*3;
      pos[o]=A[0];pos[o+1]=A[1];pos[o+2]=A[2];
      if(d>=RR*0.999){ // interior: analytic heightfield normal via finite differences in (x, zDesign)
        const x=A[0],Z=A[5],e=1e-3; const zs=zScale(x), dzs=(zScale(x+e)-zScale(x-e))/(2*e);
        const dHx=(hs(x+e,Z)-hs(x-e,Z))/(2*e), dHz=(hs(x,Z+e)-hs(x,Z-e))/(2*e);
        v1.set(1,dHx,Z*dzs); v2.set(0,dHz,zs); n.crossVectors(v2,v1).normalize();
      } else { const du=0.35/NR, dd=Math.max(1e-4,d*0.25+2e-4);
        surf((u+du)%1,d,Bv); surf((u-du+1)%1,d,C); surf(u,d+dd,D); const d0=d>dd?d-dd:d; const E=surf(u,d0,[0,0,0,0,0,0]);
        v1.set(Bv[0]-C[0],Bv[1]-C[1],Bv[2]-C[2]); v2.set(D[0]-E[0],D[1]-E[1],D[2]-E[2]); n.crossVectors(v1,v2).normalize();
        // orient outward/upward
        const hx=-A[3], hz=-A[4]; if(n.x*hx+n.z*hz+n.y*0.3<0) n.negate(); }
      nor[o]=n.x;nor[o+1]=n.y;nor[o+2]=n.z; }
  }
  const idx=[]; const pa=new THREE.Vector3(),pb=new THREE.Vector3(),pc=new THREE.Vector3(),fn=new THREE.Vector3();
  const glassIdx=[];
  const win=new Float32Array(NR*NK); for(let j=0;j<NR*NK;j++) win[j]=winSdf(pos[j*3],pos[j*3+1],pos[j*3+2]);
  const tri=(a,b,c)=>{ pa.fromArray(pos,a*3);pb.fromArray(pos,b*3);pc.fromArray(pos,c*3);
    fn.subVectors(pb,pa).cross(v1.subVectors(pc,pa)); if(fn.lengthSq()<1e-14) return;
    const nn=nor[a*3]*fn.x+nor[a*3+1]*fn.y+nor[a*3+2]*fn.z+nor[b*3]*fn.x+nor[b*3+1]*fn.y+nor[b*3+2]*fn.z;
    const T=nn>=0?[a,b,c]:[a,c,b]; idx.push(...T);
    if(Math.min(win[a],win[b],win[c])<0.012) glassIdx.push(...T); };
  for(let k=0;k<NK-1;k++) for(let i=0;i<NR;i++){ const i2=(i+1)%NR; const a=k*NR+i,b=k*NR+i2,c=(k+1)*NR+i,d=(k+1)*NR+i2; tri(a,b,d); tri(a,d,c); }
  // close the innermost (degenerate) ring is already ~zero width
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('normal',new THREE.BufferAttribute(nor,3)); g.setIndex(idx);
  // glass shell: same vertices pushed out 1.6 mm
  const gp=new Float32Array(pos.length); for(let j=0;j<pos.length;j++) gp[j]=pos[j]+nor[j]*0.0016;
  const gg=new THREE.BufferGeometry(); gg.setAttribute('position',new THREE.BufferAttribute(gp,3)); gg.setAttribute('normal',new THREE.BufferAttribute(nor.slice(),3)); gg.setIndex(glassIdx);
  return {body:g, glass:gg};
}
