import * as THREE from 'three';
const cv=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
function rng(seed){let s=seed>>>0;return ()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
// 2x2 twill carbon weave: colour + anisotropy direction map
export function carbonTextures(){
  const N=1024,T=16,cs=N/T, c=cv(N,N), a=cv(N,N), x=c.getContext('2d'), y=a.getContext('2d'); const R=rng(7);
  const img=x.createImageData(N,N), an=y.createImageData(N,N);
  for(let py=0;py<N;py++) for(let px=0;px<N;px++){
    const i=Math.floor(px/cs), j=Math.floor(py/cs); const fx=(px%cs)/cs, fy=(py%cs)/cs;
    const horiz=((i+j)%4)<2; // which tow is on top in this cell
    const across=horiz?fy:fx, along=horiz?fx:fy;
    const bulge=Math.sin(Math.PI*across); // tow cross-section
    const ends=Math.min(1,Math.sin(Math.PI*along)*3.0+0.35);
    const fib=0.86+0.14*Math.sin((across*cs*1.7+ (horiz?j:i)*3.1)*Math.PI*2)*Math.sin(along*13.0+(horiz?i:j));
    let v=(0.045+0.075*Math.pow(bulge,0.7)*ends)*fib;
    const gap=Math.min(across,1-across)<0.045?0.35:1; v*=gap;
    const o=(py*N+px)*4; const g=Math.round(255*Math.min(1,v*2.5));
    img.data[o]=g*0.94; img.data[o+1]=g*0.97; img.data[o+2]=g*1.04>255?255:g*1.04; img.data[o+3]=255;
    an.data[o]=horiz?255:128; an.data[o+1]=horiz?128:255; an.data[o+2]=Math.round(255*(0.55+0.45*bulge)); an.data[o+3]=255;
  }
  x.putImageData(img,0,0); y.putImageData(an,0,0);
  const map=new THREE.CanvasTexture(c); map.colorSpace=THREE.SRGBColorSpace; map.wrapS=map.wrapT=THREE.RepeatWrapping; map.anisotropy=8;
  const amap=new THREE.CanvasTexture(a); amap.wrapS=amap.wrapT=THREE.RepeatWrapping; amap.anisotropy=8;
  return {map,amap,canvas:c};
}
export const LIVERIES=[
  {id:'onyx',name:'ONYX',base:'#060708',acc:'#ff1d2e',acc2:'#2a2d33',txt:'#f2f4f6',metal:0.4,rough:0.32,sw:'#0b0c0e'},
  {id:'solar',name:'SOLAR',base:'#ff4d0d',acc:'#0a0a0c',acc2:'#151518',txt:'#ffffff',metal:0.25,rough:0.30,sw:'#ff4d0d'},
  {id:'arctic',name:'ARCTIC',base:'#e9edf0',acc:'#00b8ff',acc2:'#0d1b33',txt:'#0d1b33',metal:0.08,rough:0.28,sw:'#e9edf0'},
  {id:'abyss',name:'ABYSS',base:'#0a1d52',acc:'#ff7a1a',acc2:'#c9d2e0',txt:'#ffffff',metal:0.7,rough:0.30,sw:'#0a1d52'},
];
export const SIDE={W:4096,H:2048,X0:-2.7,XL:5.4,YL:1.3}, TOP={W:4096,H:2048,ZH:1.1};
export function makeLiveryTextures(){
  const s=cv(SIDE.W,SIDE.H), t=cv(TOP.W,TOP.H);
  const ts=new THREE.CanvasTexture(s), tt=new THREE.CanvasTexture(t);
  for(const q of [ts,tt]){q.colorSpace=THREE.SRGBColorSpace;q.anisotropy=8;q.generateMipmaps=true;}
  const draw=(L)=>{ drawSide(s,L); drawTop(t,L); ts.needsUpdate=true; tt.needsUpdate=true; };
  return {ts,tt,draw,sideCanvas:s,topCanvas:t};
}
const sx=x=>(x-SIDE.X0)/SIDE.XL*SIDE.W;
function drawSide(c,L){
  const g=c.getContext('2d'); g.setTransform(1,0,0,1,0,0); g.clearRect(0,0,c.width,c.height);
  const hh=SIDE.H/2;
  for(let half=0;half<2;half++){
    const oy=half*hh, left=half===1; const sy=y=>oy+(1-y/SIDE.YL)*hh; const S=hh/SIDE.YL; // px per metre (y)
    const SX=SIDE.W/SIDE.XL;
    g.save(); g.beginPath(); g.rect(0,oy,SIDE.W,hh); g.clip();
    g.fillStyle=L.base; g.fillRect(0,oy,SIDE.W,hh);
    // sweeping secondary block
    g.fillStyle=L.acc2; g.beginPath();
    g.moveTo(sx(2.8),sy(0.0)); g.lineTo(sx(2.8),sy(0.20)); g.bezierCurveTo(sx(1.6),sy(0.22),sx(0.6),sy(0.30),sx(-0.3),sy(0.50));
    g.bezierCurveTo(sx(-0.9),sy(0.64),sx(-1.6),sy(0.70),sx(-2.8),sy(0.70)); g.lineTo(sx(-2.8),sy(0)); g.closePath(); g.globalAlpha=L.id==='onyx'?0.9:1; g.fill(); g.globalAlpha=1;
    // accent pinstripe following the sweep
    g.strokeStyle=L.acc; g.lineWidth=0.016*S; g.beginPath();
    g.moveTo(sx(2.8),sy(0.215)); g.bezierCurveTo(sx(1.6),sy(0.235),sx(0.6),sy(0.315),sx(-0.3),sy(0.515));
    g.bezierCurveTo(sx(-0.9),sy(0.655),sx(-1.6),sy(0.715),sx(-2.8),sy(0.715)); g.stroke();
    g.lineWidth=0.006*S; g.beginPath();
    g.moveTo(sx(2.8),sy(0.245)); g.bezierCurveTo(sx(1.6),sy(0.265),sx(0.6),sy(0.345),sx(-0.3),sy(0.545));
    g.bezierCurveTo(sx(-0.9),sy(0.685),sx(-1.6),sy(0.745),sx(-2.8),sy(0.745)); g.stroke();
    // canopy roof accent line (top of canopy sides)
    g.lineWidth=0.012*S; g.beginPath(); g.moveTo(sx(0.95),sy(0.80)); g.bezierCurveTo(sx(0.5),sy(0.985),sx(-0.5),sy(1.0),sx(-1.0),sy(0.93)); g.stroke();
    // carbon lower sill (alpha=0 -> procedural carbon in shader)
    g.save(); g.globalCompositeOperation='destination-out'; g.beginPath();
    g.moveTo(sx(2.8),sy(0.0)); g.lineTo(sx(2.8),sy(0.135)); g.lineTo(sx(1.0),sy(0.15)); g.bezierCurveTo(sx(0.2),sy(0.16),sx(-0.8),sy(0.17),sx(-1.3),sy(0.19)); g.lineTo(sx(-2.8),sy(0.42)); g.lineTo(sx(-2.8),sy(0)); g.closePath(); g.fill();
    // carbon fin trailing area
    g.beginPath(); g.moveTo(sx(-1.95),sy(1.3)); g.lineTo(sx(-2.4),sy(1.3)); g.lineTo(sx(-2.4),sy(0.80)); g.lineTo(sx(-2.25),sy(0.80)); g.closePath(); g.fill();
    g.restore();
    // number panel (Hypercar class = red)
    const npx=-0.93, npy=0.515, nw=0.56, nh=0.36;
    const rr=(x,y,w,h,r)=>{g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();};
    g.fillStyle='#e10600'; rr(sx(npx-nw/2),sy(npy+nh/2),nw*SX,nh*S,0.05*S); g.fill();
    g.strokeStyle='#ffffff'; g.lineWidth=0.008*S; g.stroke();
    const text=(str,x,y,size,font,col,align='center',italic=true,spacing=0)=>{
      g.save(); g.translate(sx(x),sy(y)); if(left) g.scale(-1,1); g.fillStyle=col; g.textAlign=align; g.textBaseline='middle';
      g.font=`${italic?'italic ':''}${font} ${Math.round(size*S)}px 'Roboto Condensed','Inter','Arial Narrow',Arial,sans-serif`;
      if(spacing){ try{g.letterSpacing=spacing*S+'px';}catch(e){} }
      g.fillText(str,0,0); g.restore(); };
    text('24',npx,npy-0.005,0.30,'900','#ffffff');
    // fin number + brand
    text('24',-1.72,0.975,0.15,'900','#ffffff');
    text('NOCTIS',-1.72,0.885,0.045,'700',L.id==='arctic'?'#0d1b33':'#ffffff',undefined,false,0.012);
    // brand on sidepod
    text('NOCTIS',0.25,0.205,0.085,'800',L.txt,'center',true,0.02);
    text('HYPERCAR · HC-24',0.25,0.135,0.028,'600',L.txt,'center',false,0.01);
    // driver names / flags strip on canopy below window
    text('J. ARKWRIGHT  ·  M. VOSS  ·  K. TANAKA',-0.20,0.79,0.022,'600',L.id==='arctic'?'#0d1b33':'#e8e8e8','center',false,0.006);
    // front fender small marks
    text('LMH',1.95,0.40,0.05,'800',L.acc,'center',true,0.01);
    g.restore();
  }
}
function drawTop(c,L){
  const g=c.getContext('2d'); g.setTransform(1,0,0,1,0,0); g.clearRect(0,0,c.width,c.height);
  const tx=x=>(x+2.7)/5.4*TOP.W, tz=z=>(TOP.ZH-z)/(2*TOP.ZH)*TOP.H, S=TOP.W/5.4;
  g.fillStyle=L.base; g.fillRect(0,0,c.width,c.height);
  // twin pinstripes along the spine
  g.fillStyle=L.acc;
  for(const z of [-0.075,0.075]){ g.fillRect(tx(-2.8),tz(z+0.008),5.6*S,0.016*S); }
  // secondary colour on nose centre
  g.fillStyle=L.acc2; g.globalAlpha=L.id==='onyx'?0.0:0.95;
  g.beginPath(); g.moveTo(tx(2.8),tz(0.32)); g.lineTo(tx(1.6),tz(0.24)); g.lineTo(tx(1.6),tz(-0.24)); g.lineTo(tx(2.8),tz(-0.32)); g.fill(); g.globalAlpha=1;
  // nose number (red Hypercar panel)
  g.save(); g.translate(tx(1.95),tz(0)); g.rotate(Math.PI/2);
  g.fillStyle='#e10600'; g.beginPath(); g.roundRect?g.roundRect(-0.13*S,-0.11*S,0.26*S,0.22*S,0.03*S):g.rect(-0.13*S,-0.11*S,0.26*S,0.22*S); g.fill();
  g.fillStyle='#fff'; g.font=`italic 900 ${Math.round(0.17*S)}px 'Roboto Condensed',Arial,sans-serif`; g.textAlign='center'; g.textBaseline='middle'; g.fillText('24',0,0.008*S); g.restore();
  // roof brand
  g.save(); g.translate(tx(-0.25),tz(0)); g.rotate(Math.PI/2); g.fillStyle=L.txt; g.font=`italic 800 ${Math.round(0.07*S)}px 'Roboto Condensed',Arial,sans-serif`; g.textAlign='center'; g.textBaseline='middle'; g.fillText('NOCTIS',0,0); g.restore();
  // carbon areas: rear deck centre (engine cover vents) & splitter region
  g.save(); g.globalCompositeOperation='destination-out';
  g.beginPath(); g.moveTo(tx(-1.35),tz(0.26)); g.lineTo(tx(-2.6),tz(0.30)); g.lineTo(tx(-2.6),tz(-0.30)); g.lineTo(tx(-1.35),tz(-0.26)); g.closePath(); g.fill();
  g.restore();
}
// tyre sidewall lettering (lathe UV: u around, v along profile; on the outer sidewall v grows toward the bead)
// returns {map, avg}: avg holds each row's mean so the shader can fade to a smooth ring when the wheel spins fast
export function tyreTexture(v0,v1){
  const c=cv(2048,512), g=c.getContext('2d'); g.fillStyle='#000'; g.fillRect(0,0,2048,512);
  const y0=(1-v1)*512, y1=(1-v0)*512, yc=(y0+y1)/2, hgt=Math.max(12,y1-y0);
  // canvas top (small y) = high v = toward the bead, so labels are drawn rotated 180deg: letter tops face the tread
  g.fillStyle='#0c0'; g.fillRect(0,y0+2,2048,Math.max(2,hgt*0.07)); g.fillRect(0,y1-Math.max(4,hgt*0.09),2048,Math.max(2,hgt*0.07));
  g.fillStyle='#e10'; g.textAlign='center'; g.textBaseline='middle';
  for(let k=0;k<6;k++){ const ox=k*2048/6+170;
    g.save(); g.translate(ox,yc); g.rotate(Math.PI); // rotation, not a mirror: text still reads left-to-right
    g.font=`800 ${Math.round(hgt*0.42)}px 'Roboto Condensed',Arial,sans-serif`; g.fillText('NOCTIS',0,-hgt*0.12);
    g.font=`700 ${Math.round(hgt*0.24)}px 'Roboto Condensed',Arial,sans-serif`; g.fillText('SLICK 31/71 R18',0,hgt*0.22);
    g.restore(); }
  const t=new THREE.CanvasTexture(c); t.anisotropy=8; t.wrapS=THREE.RepeatWrapping;
  const d=g.getImageData(0,0,2048,512).data, ac=cv(4,512), ag=ac.getContext('2d'), im=ag.createImageData(4,512);
  for(let y=0;y<512;y++){ let r=0,gg=0; for(let x=0;x<2048;x++){ const o=(y*2048+x)*4; r+=d[o]; gg+=d[o+1]; } r/=2048; gg/=2048;
    for(let x=0;x<4;x++){ const o=(y*4+x)*4; im.data[o]=r; im.data[o+1]=gg; im.data[o+2]=0; im.data[o+3]=255; } }
  ag.putImageData(im,0,0); const avg=new THREE.CanvasTexture(ac); avg.generateMipmaps=false; avg.minFilter=avg.magFilter=THREE.LinearFilter;
  return {map:t,avg}; // used as masks
}
export function noiseCanvas(N,seed,oct=5){
  const c=cv(N,N), g=c.getContext('2d'), im=g.createImageData(N,N), R=rng(seed);
  const grids=[]; for(let o=0;o<oct;o++){ const s=4<<o; const a=new Float32Array(s*s); for(let i=0;i<s*s;i++)a[i]=R(); grids.push({s,a}); }
  for(let y=0;y<N;y++) for(let x=0;x<N;x++){ let v=0,amp=0.5,tot=0;
    for(const {s,a} of grids){ const fx=x/N*s, fy=y/N*s, ix=Math.floor(fx), iy=Math.floor(fy), tx=fx-ix, ty=fy-iy;
      const q=(i,j)=>a[((j%s+s)%s)*s+((i%s+s)%s)]; const sm=t=>t*t*(3-2*t);
      const v0=q(ix,iy)+(q(ix+1,iy)-q(ix,iy))*sm(tx), v1=q(ix,iy+1)+(q(ix+1,iy+1)-q(ix,iy+1))*sm(tx);
      v+=amp*(v0+(v1-v0)*sm(ty)); tot+=amp; amp*=0.55; }
    v/=tot; const o=(y*N+x)*4; const b=Math.round(v*255); im.data[o]=im.data[o+1]=im.data[o+2]=b; im.data[o+3]=255; }
  g.putImageData(im,0,0); return c;
}
