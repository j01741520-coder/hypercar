import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {buildBodyGeometry} from './bodygeo.js';
import {hc,wc,FA,RA,mono,H,zScale,lutData} from './shape.js';
import {carbonTextures,makeLiveryTextures,LIVERIES,tyreTexture} from './tex.js';
import {inject,XU,PAINT_GLSL,PAINT_MAP,PAINT_ROUGH,PAINT_NORMAL,PAINT_LIGHTS,PAINT_EMIS} from './mats.js';

const V2=(x,y)=>new THREE.Vector2(x,y);
function rrShape(pts,r){ // polygon with rounded corners (r per vertex or scalar)
  const s=new THREE.Shape(); const n=pts.length;
  for(let i=0;i<n;i++){ const p=pts[i], a=pts[(i-1+n)%n], b=pts[(i+1)%n]; const ri=Array.isArray(r)?r[i]:r;
    const da=V2(a[0]-p[0],a[1]-p[1]), db=V2(b[0]-p[0],b[1]-p[1]); const la=da.length(), lb=db.length(); const rr=Math.min(ri,la*0.45,lb*0.45);
    const p1=[p[0]+da.x/la*rr,p[1]+da.y/la*rr], p2=[p[0]+db.x/lb*rr,p[1]+db.y/lb*rr];
    if(i===0) s.moveTo(p1[0],p1[1]); else s.lineTo(p1[0],p1[1]); s.quadraticCurveTo(p[0],p[1],p2[0],p2[1]); }
  s.closePath(); return s; }
function extrudeXY(shape,depth,z0,bev=0.003,seg=3){ const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:bev>0,bevelThickness:bev,bevelSize:bev,bevelSegments:seg,curveSegments:24}); g.translate(0,0,z0); return g; }
function tube(a,b,r,seg=10){ const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b); const L=A.distanceTo(B); const g=new THREE.CylinderGeometry(r,r,L,seg,1); g.translate(0,L/2,0);
  const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),B.clone().sub(A).normalize()); g.applyQuaternion(q); g.translate(A.x,A.y,A.z); return g; }
function mirrorZ(g){ const m=g.clone(); m.scale(1,1,-1); // fix winding
  const idx=m.index; if(idx){ const a=idx.array; for(let i=0;i<a.length;i+=3){const t=a[i+1];a[i+1]=a[i+2];a[i+2]=t;} } else { const p=m.attributes.position; const arr=[]; }
  return m; }
function both(g){ const gi=g.index?g:g; return mergeGeometries([g.index?g:g.toNonIndexed?g:g, mirrorZ(g)].map(x=>x.index?x:x),false); }
function loft(xs,secFn,closed=true){ // sections: array of [y,z] points around (closed ring)
  const rings=xs.map(x=>secFn(x)); const n=rings[0].length; const pos=[],idx=[],uv=[];
  rings.forEach((r,k)=>r.forEach((p,i)=>{pos.push(xs[k],p[0],p[1]); uv.push(xs[k]*1.5,i/n*2.5);}));
  for(let k=0;k<xs.length-1;k++) for(let i=0;i<n;i++){ const i2=(i+1)%n; const a=k*n+i,b=k*n+i2,c=(k+1)*n+i,d=(k+1)*n+i2; idx.push(a,c,d,a,d,b); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); g.setIndex(idx); g.computeVertexNormals(); return g; }
function seRing(cy,cz,hy,hz,p,n=40){ const r=[]; for(let i=0;i<n;i++){ const a=i/n*Math.PI*2; const c=Math.cos(a),s=Math.sin(a);
  r.push([cy+hy*Math.sign(s)*Math.pow(Math.abs(s),2/p), cz+hz*Math.sign(c)*Math.pow(Math.abs(c),2/p)]); } return r; }

export function buildCar(renderer){
  const car=new THREE.Group(); car.name='car';
  const U={...XU, tSide:{value:null},tTop:{value:null},tCarbon:{value:null},tLut:{value:null},uHead:{value:1},uTail:{value:1},uPaintMetal:{value:0.5},uPaintRough:{value:0.3}};
  const carbon=carbonTextures(); U.tCarbon.value=carbon.map;
  const liv=makeLiveryTextures(); U.tSide.value=liv.ts; U.tTop.value=liv.tt;
  const lt=new THREE.DataTexture(lutData(512),512,1,THREE.RGBAFormat,THREE.FloatType); lt.minFilter=lt.magFilter=THREE.LinearFilter; lt.needsUpdate=true; U.tLut.value=lt;
  const xrayMats=[]; const solidMats=[];
  // ---------- paint
  const paint=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:0.3,metalness:0.5,clearcoat:1,clearcoatRoughness:0.045,side:THREE.DoubleSide});
  inject(paint,{uniforms:U,fpars:PAINT_GLSL,fmap:PAINT_MAP,frough:PAINT_ROUGH,fnormal:PAINT_NORMAL,flights:PAINT_LIGHTS,femis:PAINT_EMIS,key:'paint'});
  xrayMats.push(paint);
  const {body,glass}=buildBodyGeometry();
  const bodyM=new THREE.Mesh(body,paint); bodyM.castShadow=bodyM.receiveShadow=true; car.add(bodyM);
  // ---------- glass (tint + additive reflection layer), window mask keeps edges crisp
  const GL=`uniform sampler2D tLut;`+PAINT_GLSL.split('\n').filter(l=>/smk|winSdf|float az|dW|vec2 q|dS/.test(l)).join('\n');
  const glassPars=PAINT_GLSL.replace('float gCarb','float gCarbX');
  const gTint=new THREE.MeshPhysicalMaterial({color:0x000000,roughness:0.1,metalness:0,transparent:true,opacity:0.62,depthWrite:false,side:THREE.DoubleSide});
  inject(gTint,{uniforms:U,fpars:glassPars,fmap:`vec4 lt=texture2D(tLut,vec2((vOP.x+2.7)/5.4,0.5)); if(winSdf(vOP,lt.r)>0.0) discard; diffuseColor=vec4(0.0,0.004,0.006,0.62*(1.0-uXray));`,key:'gtint',fend:'gl_FragColor=vec4(0.0,0.0,0.0,diffuseColor.a);',noXray:true});
  const gRef=new THREE.MeshPhysicalMaterial({color:0x000000,roughness:0.015,metalness:0,clearcoat:0,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.FrontSide});
  inject(gRef,{uniforms:U,fpars:glassPars,fmap:`vec4 lt=texture2D(tLut,vec2((vOP.x+2.7)/5.4,0.5)); if(winSdf(vOP,lt.r)>0.0) discard;`,key:'gref',fend:'gl_FragColor.rgb*=1.0-uXray*0.85; gl_FragColor.a=1.0;',noXray:true});
  const g1=new THREE.Mesh(glass,gTint); g1.renderOrder=2; const g2=new THREE.Mesh(glass,gRef); g2.renderOrder=3; car.add(g1,g2);
  // ---------- carbon parts
  const carbonM=new THREE.MeshPhysicalMaterial({color:0xffffff,map:carbon.map,roughness:0.34,metalness:0.25,clearcoat:1,clearcoatRoughness:0.04,anisotropy:0.75,anisotropyMap:carbon.amap});
  carbon.map.repeat.set(5.5,5.5); carbon.amap.repeat.set(5.5,5.5);
  inject(carbonM,{uniforms:U,key:'carbon'}); xrayMats.push(carbonM);
  const darkM=new THREE.MeshPhysicalMaterial({color:0x0a0a0b,roughness:0.6,metalness:0.1}); inject(darkM,{uniforms:U,key:'dark'}); xrayMats.push(darkM);
  const linerM=new THREE.MeshStandardMaterial({color:0x060606,roughness:0.9,side:THREE.DoubleSide}); inject(linerM,{uniforms:U,key:'liner'}); xrayMats.push(linerM);
  const add=(g,m,cast=true)=>{ const me=new THREE.Mesh(g,m); me.castShadow=cast; me.receiveShadow=true; car.add(me); return me; };
  // shark fin
  { const top=mono([[-0.42,1.066],[-0.9,1.072],[-1.5,1.08],[-2.0,1.088],[-2.31,1.092]]);
    const pts=[]; for(let i=0;i<=40;i++){ const x=-0.42-1.89*i/40; pts.push(V2(x,top(x))); }
    pts.push(V2(-2.33,1.06)); pts.push(V2(-2.33,0.72));
    for(let i=40;i>=0;i--){ const x=-0.42-1.91*i/40; pts.push(V2(x,hc(x)-0.03)); }
    const s=new THREE.Shape(pts); const g=extrudeXY(s,0.010,-0.005,0.0025,2); add(g,paint); }
  // mirrors
  { const parts=[]; for(const sz of [1,-1]){ const m=new THREE.SphereGeometry(1,32,16); m.scale(0.085,0.038,0.05); m.translate(0.66,0.84,0.70*sz); parts.push(m);
      parts.push(tube([0.70,0.70,0.70*sz],[0.67,0.83,0.70*sz],0.011)); }
    add(mergeGeometries(parts),paint);
    for(const sz of [1,-1]){ const mg=new THREE.CircleGeometry(1,24); mg.scale(0.035,0.028,1); mg.rotateY(-Math.PI/2); mg.translate(0.578,0.84,0.70*sz);
      const mm=new THREE.Mesh(mg,new THREE.MeshPhysicalMaterial({color:0x888888,metalness:1,roughness:0.02})); car.add(mm); } }
  // rear wing: inverted cambered aerofoil + gurney, endplates
  { const c=0.40, n=48, pts=[]; const t=0.11, m=0.07, pp=0.42;
    const foil=(xc,up)=>{ const yt=5*t*(0.2969*Math.sqrt(xc)-0.126*xc-0.3516*xc*xc+0.2843*xc**3-0.1036*xc**4);
      const yc=xc<pp?m/(pp*pp)*(2*pp*xc-xc*xc):m/((1-pp)**2)*((1-2*pp)+2*pp*xc-xc*xc); return up?yc+yt:yc-yt; };
    for(let i=0;i<=n;i++){ const xc=1-(1-Math.cos(Math.PI*i/n))/2; pts.push([xc,foil(xc,true)]); }
    for(let i=1;i<n;i++){ const xc=(1-Math.cos(Math.PI*i/n))/2; pts.push([xc,foil(xc,false)]); }
    const aoa=-0.16; const s=new THREE.Shape(pts.map(([u,v])=>{ // inverted (camber down), LE at front (+x)
      const X=-u*c, Y=-v*c; const ca=Math.cos(aoa),sa=Math.sin(aoa); return V2(-2.205+X*ca-Y*sa,1.075+X*sa+Y*ca); }));
    const g=new THREE.ExtrudeGeometry(s,{depth:1.88,bevelEnabled:false,curveSegments:2}); g.translate(0,0,-0.94); add(g,carbonM);
    const gy=1.075+(-c)*Math.sin(aoa); const gx=-2.205-c*Math.cos(aoa);
    const gur=new THREE.BoxGeometry(0.004,0.022,1.88); gur.translate(gx+0.002,gy+0.011-0.004,0); add(gur,carbonM);
    // endplates with livery text
    const ep=rrShape([[-2.10,0.86],[-2.08,0.98],[-2.16,1.135],[-2.66,1.15],[-2.68,0.86]],[0.02,0.05,0.04,0.03,0.02]);
    const eg=extrudeXY(ep,0.012,0.946,0.003,2); const eg2=extrudeXY(ep,0.012,-0.958,0.003,2);
    const ecv=document.createElement('canvas'); ecv.width=1024; ecv.height=512; const e2=ecv.getContext('2d');
    for(let ix=0;ix<5;ix++) for(let iy=0;iy<3;iy++) e2.drawImage(carbon.canvas,ix*230,iy*230,230,230);
    e2.fillStyle='rgba(255,255,255,0.95)'; e2.font="italic 800 112px 'Roboto Condensed',Arial,sans-serif"; e2.textAlign='center'; e2.textBaseline='middle'; e2.fillText('NOCTIS',512,215);
    e2.font="600 40px 'Roboto Condensed',Arial,sans-serif"; e2.fillStyle='rgba(255,40,50,1)'; e2.fillText('HC-24 · LE MANS HYPERCAR',512,315);
    const et=new THREE.CanvasTexture(ecv); et.colorSpace=THREE.SRGBColorSpace; et.anisotropy=8; // uv = shape coords (metres)
    et.repeat.set(1/0.62,1/0.31); et.offset.set(2.69/0.62,-0.85/0.31); et.wrapS=et.wrapT=THREE.ClampToEdgeWrapping;
    const epM=new THREE.MeshPhysicalMaterial({map:et,roughness:0.34,metalness:0.2,clearcoat:1,clearcoatRoughness:0.05});
    inject(epM,{uniforms:U,key:'endplate'}); xrayMats.push(epM);
    // flip uv x on the left plate so text reads correctly from outside
    const fl=eg2.attributes.uv; for(let i=0;i<fl.count;i++) fl.setX(i,-4.76-fl.getX(i)+0.0);
    add(eg,epM); add(eg2,epM);
    // fin-to-wing pylon
    add(extrudeXY(rrShape([[-2.30,0.75],[-2.36,1.06],[-2.46,1.06],[-2.44,0.74]],0.01),0.012,-0.006,0.002,1),carbonM);
  }
  // front splitter, canards, side skirts, diffuser, floor
  { const sp=rrShape([[2.62,0],[2.60,0.55],[2.48,0.97],[1.70,0.97],[1.70,-0.97],[2.48,-0.97],[2.60,-0.55]],[0.2,0.4,0.12,0.02,0.02,0.12,0.4]);
    const g=new THREE.ExtrudeGeometry(sp,{depth:0.018,bevelEnabled:true,bevelThickness:0.003,bevelSize:0.003,bevelSegments:2,curveSegments:24}); g.rotateX(Math.PI/2); g.translate(0,0.083,0); add(g,carbonM);
    const cn=[]; for(const [yy,xx,ln] of [[0.20,2.30,0.20],[0.29,2.22,0.16]]) for(const sz of [1,-1]){
      const s=rrShape([[xx+ln*0.5,0],[xx-ln*0.5,0],[xx-ln*0.5,0.16]],0.01); const c=new THREE.ExtrudeGeometry(s,{depth:0.008,bevelEnabled:false}); c.rotateX(Math.PI/2); c.rotateX(-0.12*sz); c.translate(0,yy,0.985*sz); cn.push(c); }
    add(mergeGeometries(cn),carbonM);
    const sk=[]; for(const sz of [1,-1]){ const s=rrShape([[1.0,0.075],[1.0,0.125],[-1.25,0.145],[-1.25,0.075]],0.01); const e=extrudeXY(s,0.02,0,0.003,1); e.translate(0,0,sz*(0.93*zScale(0))-0.01); sk.push(e); }
    add(mergeGeometries(sk),carbonM);
    // diffuser ramp + strakes
    const dp=[]; { const g2=new THREE.PlaneGeometry(1.35,1.3,1,1); g2.rotateX(-Math.PI/2); const pa=g2.attributes.position;
      for(let i=0;i<pa.count;i++){ const x=pa.getX(i); const X=-1.25+(x>0?0:-1.30); pa.setX(i,X); pa.setY(i,X>-1.5?0.075:0.36); } g2.computeVertexNormals(); dp.push(g2.toNonIndexed()); }
    const dgeo=new THREE.BufferGeometry(); add(dp[0],darkM);
    const st=[]; for(const z of [-0.6,-0.32,0,0.32,0.6]){ const s=rrShape([[-1.30,0.075],[-2.56,0.075],[-2.56,0.36]],0.01); st.push(extrudeXY(s,0.01,z-0.005,0.002,1)); }
    add(mergeGeometries(st),carbonM);
    const fl=new THREE.BoxGeometry(3.9,0.01,1.24); fl.translate(0.05,0.07,0); add(fl,darkM);
    const fl2=new THREE.BoxGeometry(2.25,0.01,1.86); fl2.translate(-0.13,0.07,0); add(fl2,darkM);
    // rear inner closing panel + crash structure
    const rp=new THREE.BoxGeometry(0.02,0.30,1.9); rp.translate(-2.30,0.215,0); add(rp,darkM,false);
    const nb=new THREE.BoxGeometry(0.02,0.30,1.5); nb.translate(2.15,0.22,0); add(nb,darkM,false);
  }
  // wheel-well liners
  { const parts=[]; for(const [W,sz] of [[FA,1],[FA,-1],[RA,1],[RA,-1]]){ const r=W.r+0.05;
      const c=new THREE.CylinderGeometry(r,r,0.40,40,1,true,-Math.PI*0.62,Math.PI*1.24); c.rotateX(Math.PI/2); c.rotateZ(Math.PI/2); c.translate(W.x,W.y,sz*(W.z-0.01)); parts.push(c);
      const d=new THREE.CircleGeometry(r,40); d.translate(W.x,W.y,sz*(W.z-0.20)); parts.push(d); }
    add(mergeGeometries(parts),linerM,false); }
  // cockpit bulkheads + dash (so the glasshouse shows an interior, not a hollow shell)
  { const parts=[]; for(const [x,h] of [[-0.78,0.98],[0.98,0.72]]){ const sh=new THREE.Shape(); const w=wc(x)*zScale(x)*0.98, y0=0.42, y1=h;
      sh.moveTo(-w,y0); sh.lineTo(w,y0); sh.lineTo(w,y0+(y1-y0)*0.55); sh.quadraticCurveTo(w*0.95,y1,0,y1); sh.quadraticCurveTo(-w*0.95,y1,-w,y0+(y1-y0)*0.55); sh.closePath();
      const g=new THREE.ShapeGeometry(sh,16); g.rotateY(Math.PI/2); g.translate(x,0,0); parts.push(g); }
    const dash=new THREE.BoxGeometry(0.30,0.05,0.62); dash.translate(0.42,0.70,0); parts.push(dash);
    const m=new THREE.Mesh(mergeGeometries(parts.map(p=>p.index?p.toNonIndexed():p)),new THREE.MeshStandardMaterial({color:0x0c0d0f,roughness:0.85,side:THREE.DoubleSide})); inject(m.material,{uniforms:U,key:'bulk'}); xrayMats.push(m.material); car.add(m); }
  // rain light + exhausts
  const rain=new THREE.Mesh(new THREE.BoxGeometry(0.01,0.05,0.09),new THREE.MeshBasicMaterial({color:new THREE.Color(4,0.03,0.02)})); rain.position.set(-2.475,0.45,0); car.add(rain);
  { const exM=new THREE.MeshPhysicalMaterial({color:0x8a8f99,metalness:1,roughness:0.25,iridescence:0.6,iridescenceIOR:1.8}); inject(exM,{uniforms:U,key:'exh'}); xrayMats.push(exM);
    const parts=[]; for(const z of [-0.1,0.1]){ const g=new THREE.CylinderGeometry(0.035,0.032,0.18,24,1,true); g.rotateZ(Math.PI/2); g.translate(-2.40,0.56,z); parts.push(g); }
    add(mergeGeometries(parts),new THREE.MeshPhysicalMaterial({color:0x9aa0aa,metalness:1,roughness:0.22,side:THREE.DoubleSide}));
  }
  // ---------- wheels
  const wheels=[]; const W=buildWheelParts(U,xrayMats,solidMats);
  for(const [A,sz,front] of [[FA,1,true],[FA,-1,true],[RA,1,false],[RA,-1,false]]){
    const root=new THREE.Group(); root.position.set(A.x,A.y,sz*A.z); if(sz<0) root.rotation.y=Math.PI;
    const spin=new THREE.Group(); root.add(spin);
    const tyre=new THREE.Mesh(front?W.tyreF:W.tyreR,W.rubber); tyre.castShadow=tyre.receiveShadow=true; spin.add(tyre);
    const rim=new THREE.Mesh(W.rim,W.rimM); rim.castShadow=true; rim.position.z=(front?FA.w:RA.w)*0.5-0.075; spin.add(rim);
    const lip=new THREE.Mesh(W.lip,W.lipM); lip.position.z=(front?FA.w:RA.w)*0.5-0.03; spin.add(lip);
    const nut=new THREE.Mesh(W.nut,W.nutM); nut.position.z=rim.position.z+0.03; spin.add(nut);
    const bar=new THREE.Mesh(W.barrel,W.rimM); spin.add(bar);
    const disc=new THREE.Mesh(W.disc,W.discM); disc.position.z=-0.02; spin.add(disc);
    const cal=new THREE.Mesh(W.caliper,W.calM); cal.position.z=-0.02; cal.rotation.z=sz>0?0.35:Math.PI-0.35; root.add(cal);
    car.add(root); wheels.push({root,spin,sz,front});
  }
  // ---------- chassis / powertrain (revealed in X-ray)
  const chassis=buildChassis(carbon,U); car.add(chassis.group);
  const set={paint,U,liv,carbon};
  function setLivery(i){ const L=LIVERIES[i]; liv.draw(L); U.uPaintMetal.value=L.metal; U.uPaintRough.value=L.rough; }
  setLivery(0);
  return {car,wheels,chassis,xrayMats,setLivery,U,bodyMesh:bodyM,glass:[g1,g2],paint};
}

function buildWheelParts(U,xrayMats){
  // tyre profile, listed inner bead (-hw) -> tread -> outer bead (+hw): LatheGeometry wants increasing y for
  // outward normals/front faces. The bead sits just outboard of the rim's chrome lip (lip z = w/2-0.03) and the
  // sidewall bulges gently to hw+flare (the earlier flat, +4..5.5 cm sidewall buried the lip and sank the rim).
  const NSW=12, NSH=5, NTR=15;
  const prof=(hw,R,flare)=>{ const zb=hw*0.86, zs=hw*0.92, zmax=hw+flare, cr=0.018, rs=R-cr, r0=0.228, r1=0.234;
    const half=[[r0,zb]]; // outer half: bead -> sidewall -> shoulder
    for(let i=0;i<=NSW;i++){ const t=i/NSW; half.push([r1+(rs-r1)*t, zs+(zmax-zs)*Math.sin(Math.PI/2*Math.min(1,t*1.25))]); }
    for(let i=1;i<=NSH;i++){ const a=i/NSH*Math.PI/2; half.push([rs+cr*Math.sin(a), zmax-cr*(1-Math.cos(a))]); }
    const zt=zmax-cr, tread=[];
    for(let i=1;i<=NTR;i++){ const u=i/(NTR+1), y=-zt+2*zt*u, s0=u*2-1, e1=(s0+0.58)/0.1, e2=(s0-0.58)/0.1, gr=Math.exp(-e1*e1)+Math.exp(-e2*e2); tread.push([R-0.006*gr,y]); }
    const P=[...half.map(q=>[q[0],-q[1]]),...tread,...half.slice().reverse()];
    return P.map(p=>V2(p[0],p[1])); };
  const mk=(w,R,flare)=>{ const g=new THREE.LatheGeometry(prof(w/2,R,flare),112); g.rotateX(Math.PI/2); return g; };
  const tyreF=mk(FA.w,FA.r,0.012), tyreR=mk(RA.w,RA.r,0.018);
  // lettering band on the outer sidewall (half index k=1+NSW*t is at P index NP-1-k; v grows toward the bead there)
  const NH=NSW+2+NSH, NP=2*NH+NTR, vOf=(k)=>(NP-1-k)/(NP-1);
  const tt=tyreTexture(vOf(1+NSW*0.80),vOf(1+NSW*0.08));
  U.uTyBlur=U.uTyBlur||{value:0};
  const rubber=new THREE.MeshPhysicalMaterial({color:0x121212,roughness:0.84,metalness:0,sheen:0.12,sheenColor:new THREE.Color(0.02,0.02,0.02),sheenRoughness:0.8});
  // uTyBlur (0..1, from wheel angular speed x shutter) fades the lettering to its per-radius average -> smooth ring under motion blur
  inject(rubber,{uniforms:{...U,tTy:{value:tt.map},tTyA:{value:tt.avg}},fpars:'uniform sampler2D tTy; uniform sampler2D tTyA; uniform float uTyBlur;',
    fmap:'vec4 ty=mix(texture2D(tTy,vUv),texture2D(tTyA,vec2(0.5,vUv.y)),uTyBlur); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.78,0.76,0.70),ty.r); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.86,0.62,0.08),ty.g);',key:'rubber4'});
  rubber.defines={USE_UV:''}; xrayMats.push(rubber);
  // rim face: 10 spokes
  const s=new THREE.Shape(); s.absarc(0,0,0.222,0,Math.PI*2,false);
  const NS=10; for(let i=0;i<NS;i++){ const a0=i/NS*Math.PI*2+0.11, a1=(i+1)/NS*Math.PI*2-0.11; const h=new THREE.Path();
    const r0=0.085,r1=0.198; h.moveTo(r0*Math.cos(a0+0.06),r0*Math.sin(a0+0.06)); h.lineTo(r1*Math.cos(a0),r1*Math.sin(a0)); h.absarc(0,0,r1,a0,a1,false); h.lineTo(r0*Math.cos(a1-0.06),r0*Math.sin(a1-0.06)); h.absarc(0,0,r0,a1-0.06,a0+0.06,true); s.holes.push(h); }
  const rim=new THREE.ExtrudeGeometry(s,{depth:0.022,bevelEnabled:true,bevelThickness:0.006,bevelSize:0.005,bevelSegments:3,curveSegments:40});
  const rimM=new THREE.MeshPhysicalMaterial({color:0x16181c,metalness:1,roughness:0.32,clearcoat:0.6,clearcoatRoughness:0.1}); inject(rimM,{uniforms:U,key:'rim'}); xrayMats.push(rimM);
  const lip=new THREE.TorusGeometry(0.226,0.006,8,96); const lipM=new THREE.MeshPhysicalMaterial({color:0xd0d4da,metalness:1,roughness:0.18}); inject(lipM,{uniforms:U,key:'lip'}); xrayMats.push(lipM);
  const nut=new THREE.CylinderGeometry(0.042,0.048,0.05,6); nut.rotateX(Math.PI/2);
  const nutM=new THREE.MeshPhysicalMaterial({color:0xd01020,metalness:0.9,roughness:0.3,clearcoat:1}); inject(nutM,{uniforms:U,key:'nut'}); xrayMats.push(nutM);
  const barrel=new THREE.CylinderGeometry(0.226,0.226,0.26,64,1,true); barrel.rotateX(Math.PI/2);
  const ds=new THREE.Shape(); ds.absarc(0,0,0.19,0,Math.PI*2); const dh=new THREE.Path(); dh.absarc(0,0,0.115,0,Math.PI*2,true); ds.holes.push(dh);
  const disc=new THREE.ExtrudeGeometry(ds,{depth:0.034,bevelEnabled:false,curveSegments:64}); disc.translate(0,0,-0.017);
  const dcv=document.createElement('canvas'); dcv.width=dcv.height=512; const g=dcv.getContext('2d'); const gr=g.createRadialGradient(256,256,0,256,256,256);
  gr.addColorStop(0,'#000'); gr.addColorStop(0.58,'#000'); gr.addColorStop(0.66,'#ff8a3a'); gr.addColorStop(0.86,'#ffd27a'); gr.addColorStop(0.97,'#ff6a20'); gr.addColorStop(1,'#000'); g.fillStyle=gr; g.fillRect(0,0,512,512);
  g.strokeStyle='#000'; g.lineWidth=5; for(let i=0;i<36;i++){ const a=i/36*Math.PI*2; g.beginPath(); g.moveTo(256+150*Math.cos(a),256+150*Math.sin(a)); g.lineTo(256+235*Math.cos(a+0.25),256+235*Math.sin(a+0.25)); g.stroke(); }
  const dt=new THREE.CanvasTexture(dcv); dt.colorSpace=THREE.SRGBColorSpace;
  // ExtrudeGeometry uv = shape coords -> map [-0.19,0.19] to [0,1]
  dt.repeat.set(1/0.38,1/0.38); dt.offset.set(0.5,0.5);
  const discM=new THREE.MeshStandardMaterial({color:0x3a3a3c,roughness:0.55,metalness:0.6,emissive:0xffffff,emissiveMap:dt,emissiveIntensity:0});
  inject(discM,{uniforms:U,key:'disc'}); xrayMats.push(discM);
  const cs=new THREE.Shape(); cs.absarc(0,0,0.222,Math.PI*0.40,Math.PI*0.85,false); cs.absarc(0,0,0.15,Math.PI*0.85,Math.PI*0.40,true);
  const caliper=new THREE.ExtrudeGeometry(cs,{depth:0.07,bevelEnabled:true,bevelThickness:0.01,bevelSize:0.01,bevelSegments:3,curveSegments:16}); caliper.translate(0,0,-0.035);
  const calM=new THREE.MeshPhysicalMaterial({color:0xc8a45a,metalness:0.8,roughness:0.35,clearcoat:1}); inject(calM,{uniforms:U,key:'cal'}); xrayMats.push(calM);
  return {tyreF,tyreR,rubber,rim,rimM,lip,lipM,nut,nutM,barrel,disc,discM,caliper,calM};
}

function buildChassis(carbon,U){
  const group=new THREE.Group(); group.name='chassis';
  const mats=[];
  const M=(o,key)=>{ const m=new THREE.MeshPhysicalMaterial(o); inject(m,{uniforms:U,key:'ch_'+key,fpars:'#define XRAYK 0.0\n'}); mats.push(m); return m; };
  const tubM=M({color:0xffffff,map:carbon.map,roughness:0.38,metalness:0.2,clearcoat:1,clearcoatRoughness:0.08,anisotropy:0.6,anisotropyMap:carbon.amap},'tub');
  const alu=M({color:0xb8bec8,metalness:1,roughness:0.32},'alu');
  const red=M({color:0xc4141e,metalness:0.4,roughness:0.35,clearcoat:1},'red');
  const steel=M({color:0x6c7078,metalness:1,roughness:0.4},'steel');
  const orange=M({color:0xff6a00,roughness:0.5,metalness:0.0,emissive:0xff4a00,emissiveIntensity:0.25},'orange');
  const batt=M({color:0x15232e,metalness:0.6,roughness:0.4,emissive:0x0090c0,emissiveIntensity:0.0},'batt');
  const black=M({color:0x111214,roughness:0.6,metalness:0.2},'black');
  const yel=M({color:0xffc21a,metalness:0.6,roughness:0.3},'yel');
  const rad=M({color:0x9aa3ad,metalness:0.9,roughness:0.45},'rad');
  const add=(g,m)=>{const me=new THREE.Mesh(g,m); me.castShadow=true; me.receiveShadow=true; group.add(me); return me;};
  // monocoque tub (loft)
  const xs=[]; for(let i=0;i<=40;i++) xs.push(2.05-2.95*i/40);
  const hw=mono([[2.05,0.15],[1.6,0.22],[1.0,0.33],[0.3,0.42],[-0.9,0.44]]), ht=mono([[2.05,0.36],[1.5,0.46],[0.9,0.58],[0.3,0.64],[-0.9,0.66]]);
  add(loft(xs,x=>seRing((0.085+ht(x))/2,0,(ht(x)-0.085)/2,hw(x),3.2,36)),tubM);
  // seat + driver helmet + steering wheel
  add(loft([-0.05,-0.25,-0.45,-0.62],x=>seRing(0.55,0,0.30*(x<-0.5?1.1:1),0.24,4,24)),black);
  const helm=new THREE.SphereGeometry(0.135,32,24); helm.scale(1.05,1,0.95); helm.translate(-0.33,0.86,0); add(helm,M({color:0xf2f2f2,roughness:0.25,metalness:0.1,clearcoat:1},'helm'));
  const vis=new THREE.SphereGeometry(0.137,32,12,-0.9,1.8,1.25,0.55); vis.rotateY(Math.PI/2); vis.scale(1.05,1,0.95); vis.translate(-0.33,0.86,0); add(vis,M({color:0x050505,roughness:0.02,metalness:1},'visor'));
  const sw=extrudeXY(rrShape([[-0.13,-0.07],[0.13,-0.07],[0.15,0.05],[0.08,0.08],[-0.08,0.08],[-0.15,0.05]],0.03),0.03,-0.015,0.006,2); sw.rotateY(Math.PI/2); sw.rotateZ(-0.35); sw.translate(0.12,0.74,0); add(sw,black);
  // halo-like roll hoop inside canopy
  add(new THREE.TorusGeometry(0.40,0.022,10,48,Math.PI).rotateY(Math.PI/2).translate(-0.62,0.60,0),tubM);
  // V6 (120°): block, heads, cam covers, plenum, turbos, exhaust
  const eng=new THREE.Group(); eng.position.set(-1.22,0.30,0); group.add(eng);
  const eadd=(g,m)=>{const me=new THREE.Mesh(g,m); me.castShadow=true; eng.add(me); return me;};
  eadd(extrudeXY(rrShape([[-0.30,-0.14],[0.30,-0.14],[0.30,0.08],[-0.30,0.08]],0.04),0.30,-0.15,0.015,2),alu);
  for(const s of [1,-1]){ const hd=new THREE.Group(); hd.position.set(0,0.06,0.10*s); hd.rotation.x=-s*1.05; eng.add(hd);
    const hg=extrudeXY(rrShape([[-0.30,0],[0.30,0],[0.30,0.20],[-0.30,0.20]],0.03),0.13,-0.065,0.012,2); const me=new THREE.Mesh(hg,alu); hd.add(me);
    const cc=extrudeXY(rrShape([[-0.29,0.20],[0.29,0.20],[0.29,0.25],[-0.29,0.25]],0.02),0.11,-0.055,0.01,2); hd.add(new THREE.Mesh(cc,red));
    for(let i=0;i<3;i++){ const ig=new THREE.CylinderGeometry(0.018,0.018,0.07,12); ig.translate(-0.2+i*0.2,0.28,0); hd.add(new THREE.Mesh(ig,black)); } }
  eadd(new THREE.CylinderGeometry(0.07,0.07,0.52,24).rotateZ(Math.PI/2).translate(0,0.16,0),M({color:0x2a2c30,metalness:0.8,roughness:0.3,clearcoat:1},'plen'));
  for(const s of [1,-1]){ const tg=new THREE.TorusGeometry(0.06,0.032,12,24); tg.rotateY(Math.PI/2); tg.translate(-0.36,0.06,0.22*s); eadd(tg,M({color:0xb0763a,metalness:1,roughness:0.35,iridescence:0.5},'turbo'));
    for(let i=0;i<3;i++) eadd(tube([-0.2+i*0.2,-0.02,0.30*s],[-0.36,0.04,0.22*s],0.016),steel); }
  // gearbox
  add(loft([-1.55,-1.75,-1.95,-2.18],x=>seRing(0.29,0,0.12-(x+1.55)*0.05,0.17-(x+1.55)*0.06,3,24)),M({color:0x3a3d44,metalness:0.8,roughness:0.4},'gbx'));
  // front e-motor + half shafts, battery, HV cables
  add(new THREE.CylinderGeometry(0.11,0.11,0.30,32).rotateX(Math.PI/2).translate(FA.x,0.30,0),M({color:0x23424e,metalness:0.8,roughness:0.3,clearcoat:1},'emot'));
  add(new THREE.TorusGeometry(0.111,0.012,8,32).translate(FA.x,0.30,0.12),orange); add(new THREE.TorusGeometry(0.111,0.012,8,32).translate(FA.x,0.30,-0.12),orange);
  for(const s of [1,-1]) add(tube([FA.x,0.30,0.15*s],[FA.x,0.355,0.70*s],0.022),steel);
  for(const s of [1,-1]) add(tube([RA.x,0.30,0.12*s],[RA.x,0.36,0.66*s],0.024),steel);
  const bb=extrudeXY(rrShape([[-0.92,0.09],[-0.60,0.09],[-0.60,0.50],[-0.92,0.50]],0.03),0.60,-0.30,0.01,2); const battM=add(bb,batt);
  const cells=[]; for(let i=0;i<6;i++) cells.push(new THREE.BoxGeometry(0.003,0.36,0.56).translate(-0.62-i*0.05,0.295,0)); add(mergeGeometries(cells),orange);
  const cab=new THREE.CatmullRomCurve3([new THREE.Vector3(FA.x-0.1,0.30,0.08),new THREE.Vector3(0.9,0.12,0.20),new THREE.Vector3(-0.2,0.10,0.30),new THREE.Vector3(-0.62,0.20,0.25)]);
  add(new THREE.TubeGeometry(cab,48,0.014,8),orange); add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cab.points.map(p=>new THREE.Vector3(p.x,p.y,-p.z))),48,0.014,8),orange);
  // radiators in sidepods
  const rcv=document.createElement('canvas'); rcv.width=64; rcv.height=8; const rg=rcv.getContext('2d'); for(let i=0;i<64;i++){ rg.fillStyle=i%2?'#555':'#ddd'; rg.fillRect(i,0,1,8); }
  const rt=new THREE.CanvasTexture(rcv); rt.wrapS=rt.wrapT=THREE.RepeatWrapping; rt.repeat.set(8,1);
  const radM=M({color:0xffffff,map:rt,metalness:0.9,roughness:0.5},'radc');
  for(const s of [1,-1]){ const r=new THREE.BoxGeometry(0.06,0.26,0.36); const me=add(r,radM); me.position.set(0.15,0.25,0.62*s); me.rotation.y=0.55*s; me.rotation.z=0.25;
    add(tube([0.1,0.32,0.5*s],[-1.0,0.35,0.25*s],0.018),M({color:0x1c3a7a,roughness:0.4,metalness:0.2},'hose')); }
  const ic=new THREE.BoxGeometry(0.05,0.22,0.6); const icm=add(ic,radM); icm.position.set(1.95,0.25,0); icm.rotation.z=-0.5;
  // pushrod suspension front & rear
  const susp=(A,front)=>{ for(const s of [1,-1]){ const zw=(A.z-0.10)*s, zc=(front?0.16:0.16)*s;
      const up=[A.x,A.y+0.12,zw], lo=[A.x,A.y-0.13,zw];
      add(tube(up,[A.x+0.22,A.y+0.16,zc+(front?0.12:0.12)*s],0.011),black); add(tube(up,[A.x-0.20,A.y+0.15,zc+0.12*s],0.011),black);
      add(tube(lo,[A.x+0.25,A.y-0.18,zc+0.04*s],0.012),black); add(tube(lo,[A.x-0.24,A.y-0.18,zc+0.04*s],0.012),black);
      const rk=[A.x+(front?0.05:-0.05),(front?0.55:0.45),0.10*s];
      add(tube(lo,rk,0.012),M({color:0x2a2a2a,metalness:0.6,roughness:0.3},'push'));
      add(new THREE.BoxGeometry(0.06,0.04,0.05).translate(...rk),alu);
      const dE=[rk[0]+(front?-0.32:0.30),rk[1]-0.02,0.07*s]; add(tube(rk,dE,0.018),yel);
      const coil=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({length:40},(_,i)=>{ const t=i/39; const a=t*Math.PI*14; const P=new THREE.Vector3(...rk).lerp(new THREE.Vector3(...dE),0.15+t*0.6);
        return new THREE.Vector3(P.x,P.y+0.032*Math.cos(a),P.z+0.032*Math.sin(a)); })),160,0.0055,6); add(coil,M({color:0xff6a00,metalness:0.5,roughness:0.35},'coil'));
      const upr=new THREE.BoxGeometry(0.07,0.30,0.05).translate(A.x,A.y,zw); add(upr,alu); } };
  susp(FA,true); susp(RA,false);
  return {group,mats,battM,batt,orange};
}
