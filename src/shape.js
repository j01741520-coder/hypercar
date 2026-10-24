// Procedural design functions for the NOCTIS HC-24 body (units: metres, x forward, y up, z right)
export const clamp=(v,a,b)=>v<a?a:v>b?b:v;
export const sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
export function mono(pts){ // monotone cubic (Fritsch-Carlson), pts sorted by x asc or desc
  pts=pts.slice().sort((a,b)=>a[0]-b[0]);
  const n=pts.length,xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),d=[],m=[];
  for(let i=0;i<n-1;i++)d.push((ys[i+1]-ys[i])/(xs[i+1]-xs[i]));
  m[0]=d[0];m[n-1]=d[n-2];
  for(let i=1;i<n-1;i++){ if(d[i-1]*d[i]<=0)m[i]=0; else { const w1=2*(xs[i+1]-xs[i])+(xs[i]-xs[i-1]),w2=(xs[i+1]-xs[i])+2*(xs[i]-xs[i-1]); m[i]=(w1+w2)/(w1/d[i-1]+w2/d[i]); } }
  return x=>{ if(x<=xs[0])return ys[0]; if(x>=xs[n-1])return ys[n-1];
    let i=0; while(x>xs[i+1])i++; const h=xs[i+1]-xs[i],t=(x-xs[i])/h,t2=t*t,t3=t2*t;
    return (2*t3-3*t2+1)*ys[i]+(t3-2*t2+t)*h*m[i]+(-2*t3+3*t2)*ys[i+1]+(t3-t2)*h*m[i+1]; };
}
const smax=(a,b,k)=>{const h=clamp(0.5+0.5*(a-b)/k,0,1);return b+(a-b)*h+k*h*(1-h);};
const se=(s,p)=>s>=1?0:Math.pow(1-Math.pow(s,p),1/p);

export const XN=2.53, XT=-2.47, WH=1.0, FLOOR=0.072;
export const FA={x:1.45,y:0.355,r:0.355,z:0.815,w:0.31}, RA={x:-1.70,y:0.36,r:0.36,z:0.80,w:0.34};

// longitudinal profiles
const hf=mono([[2.58,0.40],[2.42,0.58],[2.2,0.70],[1.9,0.795],[1.6,0.85],[1.40,0.862],[1.15,0.845],[0.9,0.77],[0.62,0.62],[0.35,0.47],[0.05,0.40]]);
const zf=mono([[2.5,0.74],[1.45,0.78],[0.6,0.80]]);
const wf=mono([[2.5,0.34],[1.45,0.36],[0.5,0.30]]);
const hr=mono([[0.45,0.40],[0.1,0.47],[-0.35,0.62],[-0.8,0.79],[-1.25,0.885],[-1.7,0.915],[-2.1,0.905],[-2.35,0.885],[-2.55,0.865]]);
const zr=mono([[0.2,0.80],[-1.0,0.77],[-1.7,0.765],[-2.5,0.77]]);
const wr=mono([[0.2,0.30],[-1.0,0.37],[-1.7,0.38],[-2.5,0.38]]);
const deck=mono([[-2.55,0.69],[-2.1,0.67],[-1.6,0.60],[-1.1,0.52],[-0.5,0.445],[0.3,0.43],[1.0,0.41],[1.7,0.37],[2.3,0.31],[2.6,0.26]]);
const hn=mono([[2.60,0.30],[2.40,0.40],[2.05,0.495],[1.6,0.56],[1.2,0.62],[0.95,0.67],[0.7,0.70]]);
const wn=mono([[2.6,0.42],[2.0,0.37],[1.2,0.32],[0.7,0.30]]);
export const hc=mono([[1.18,0.58],[0.98,0.70],[0.74,0.84],[0.45,0.965],[0.15,1.04],[-0.2,1.07],[-0.55,1.05],[-0.9,0.975],[-1.3,0.87],[-1.75,0.795],[-2.15,0.755],[-2.55,0.735]]);
export const wc=mono([[1.18,0.25],[0.98,0.37],[0.62,0.455],[0.15,0.495],[-0.35,0.49],[-0.75,0.43],[-1.15,0.31],[-1.55,0.21],[-2.0,0.165],[-2.55,0.15]]);
const pc=mono([[1.0,2.3],[0.2,2.7],[-0.6,2.6],[-1.4,2.2],[-2.5,2.0]]);

export function H(x,z){ // top surface height (design z)
  const az=Math.abs(z);
  let y=deck(x);
  // nose keel
  if(x>0.4){ const s=az/wn(x); const yp=hn(x); y=smax(y,0.2+(yp-0.2)*se(s,2.1),0.045); }
  // front fenders
  { const s=Math.abs(az-zf(x))/wf(x); const yp=hf(x); y=smax(y,0.2+(yp-0.2)*se(s,2.4),0.05); }
  // rear fenders
  { const s=Math.abs(az-zr(x))/wr(x); const yp=hr(x); y=smax(y,0.2+(yp-0.2)*se(s,2.4),0.05); }
  // canopy / engine cover
  if(x<1.25){ const s=az/wc(x); const yp=hc(x); y=smax(y,0.25+(yp-0.25)*se(s,pc(x)),0.055); }
  return y;
}
export function zScale(x){ // plan-view waist (coke bottle) + slight nose taper
  return 1-0.075*Math.exp(-Math.pow((x+0.05)/0.62,2))-0.02*sstep(2.0,2.6,x);
}
function arch(x,a,rr){ const dx=Math.abs(x-a.x); if(dx>=rr) return -1; return a.y+Math.sqrt(rr*rr-dx*dx); }
export function Bot(x){ // bottom edge of the side bodywork (wheel arches cut in)
  let b=FLOOR+0.0;
  b=Math.max(b,arch(x,FA,0.408));
  b=Math.max(b,arch(x,RA,0.415));
  // open rear section behind rear wheel (diffuser / exposed rear tyre), raised nose lip
  if(x<RA.x-0.1) b=Math.max(b,0.36+0.0*x);
  b=Math.max(b,FLOOR+0.035*sstep(2.0,2.4,x));
  return b;
}
// window signed distance (final object coords) — mirrored in GLSL (keep in sync)
export function winSdf(x,y,z){
  const w=wc(x)*zScale(x), az=Math.abs(z);
  const sm=(a,b,k)=>{const h=clamp(0.5+0.5*(a-b)/k,0,1);return b+(a-b)*h+k*h*(1-h);};
  let dW=sm(sm(0.17-x,x-1.06,0.05),sm(az-0.86*w,0.66-y,0.04),0.05);
  const qx=Math.abs(x+0.20)-(0.27-0.05), qy=Math.abs(y-0.885)-(0.062-0.05);
  let dS=Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-0.05;
  dS=Math.max(dS,0.25-az);
  return Math.min(dW,dS);
}
export function lutData(n=512){ // x in [-2.7,2.7]: R=wc*zs  G=hc  B=zs  A=Bot
  const a=new Float32Array(n*4);
  for(let i=0;i<n;i++){ const x=-2.7+5.4*i/(n-1); a[i*4]=wc(x)*zScale(x); a[i*4+1]=hc(x); a[i*4+2]=zScale(x); a[i*4+3]=Bot(x); }
  return a;
}
