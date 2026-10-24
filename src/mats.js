import * as THREE from 'three';
// generic onBeforeCompile injector (chunk-anchored)
export function inject(mat, o){
  const U=o.uniforms||{}; mat.userData.U=U;
  mat.onBeforeCompile=(sh)=>{
    Object.assign(sh.uniforms,U);
    let v=sh.vertexShader, f=sh.fragmentShader;
    v=v.replace('#include <common>','#include <common>\nvarying vec3 vOP; varying vec3 vON; varying vec3 vXv;\n'+(o.vpars||''));
    v=v.replace('#include <begin_vertex>','#include <begin_vertex>\nvOP=position; vON=objectNormal; vXv=normalize(normalMatrix*vec3(1.0,0.0,0.0));\n'+(o.vmain||''));
    f=f.replace('#include <common>','#include <common>\nvarying vec3 vOP; varying vec3 vON; varying vec3 vXv;\nuniform float uXray; uniform float uScan;\n'+(o.fpars||'')+'\n#ifndef XRAYK\n#define XRAYK 1.0\n#endif\n');
    if(o.fmap) f=f.replace('#include <map_fragment>','#include <map_fragment>\n'+o.fmap);
    if(o.frough) f=f.replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\n'+o.frough);
    if(o.fnormal) f=f.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\n'+o.fnormal);
    if(o.femis) f=f.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n'+o.femis);
    if(o.flights) f=f.replace('#include <lights_physical_fragment>','#include <lights_physical_fragment>\n'+o.flights);
    f=f.replace('#include <opaque_fragment>','#include <opaque_fragment>\n'+(o.fend||'')+'\n'+(o.noXray?'':XRAY));
    sh.vertexShader=v; sh.fragmentShader=f;
  };
  mat.customProgramCacheKey=()=>o.key||mat.type+'_inj';
  if(!U.uXray) U.uXray=XU.uXray; if(!U.uScan) U.uScan=XU.uScan;
  return mat;
}
export const XU={uXray:{value:0},uScan:{value:0},uTime:{value:0}};
const XRAY=`
if(uXray>0.001){
  vec3 Vv=normalize(vViewPosition); float fr=pow(1.0-abs(dot(normalize(normal),Vv)),2.2);
  float scan=exp(-pow((vOP.x-uScan)*5.0,2.0));
  float ring=smoothstep(0.43,0.5,abs(fract(vOP.x*6.0)-0.5))*0.6;
  vec3 holo=vec3(0.22,0.78,1.0)*(0.015+fr*0.75+scan*0.9+ring*0.18*(0.3+fr));
  gl_FragColor.rgb=mix(gl_FragColor.rgb,holo,uXray*XRAYK);
  gl_FragColor.a=mix(gl_FragColor.a,clamp(0.012+fr*0.30+scan*0.25+ring*0.04,0.0,1.0),uXray*XRAYK);
}`;
export function setXray(mats,x){ for(const m of mats){ const t=x>0.002; if(m.transparent!==t||m.depthWrite===t){ m.transparent=t; m.depthWrite=!t; } } }

export const PAINT_GLSL=`
uniform sampler2D tSide; uniform sampler2D tTop; uniform sampler2D tCarbon; uniform sampler2D tLut;
uniform float uHead; uniform float uTail; uniform float uPaintMetal; uniform float uPaintRough;
float gCarb=0.0, gGap=0.0, gTilt=0.0, gLens=0.0, gBack=0.0, gMesh=0.0; vec3 gEm=vec3(0.0);
float smk(float a,float b,float k){float h=clamp(0.5+0.5*(a-b)/k,0.0,1.0);return mix(b,a,h)+k*h*(1.0-h);}
float winSdf(vec3 p,float w){ float az=abs(p.z);
  float dW=smk(smk(0.17-p.x,p.x-1.06,0.05),smk(az-0.86*w,0.66-p.y,0.04),0.05);
  vec2 q=abs(vec2(p.x+0.20,p.y-0.885))-vec2(0.22,0.012);
  float dS=length(max(q,0.0))+min(max(q.x,q.y),0.0)-0.05; dS=max(dS,0.25-az); return min(dW,dS);}
float rbox(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.0))+min(max(q.x,q.y),0.0)-r;}
float frontY(float az){ return 0.262+0.205*smoothstep(0.10,0.62,az)-0.03*smoothstep(0.75,0.98,az); }
float rearY(float az){ return 0.655+0.075*smoothstep(0.25,0.72,az); }
`;
export const PAINT_MAP=`
vec3 on=normalize(vON); vec4 lt=texture2D(tLut,vec2((vOP.x+2.7)/5.4,0.5));
float wsd=winSdf(vOP,lt.r); if(wsd<0.0) discard;
float ws=max(smoothstep(0.30,0.70,abs(on.z)),smoothstep(0.45,0.8,abs(on.x))*step(1.9,abs(vOP.x+0.0)));
float vy=clamp(vOP.y/1.3,0.003,0.997)*0.5+(vOP.z>0.0?0.5:0.0);
vec4 cS=texture2D(tSide,vec2((vOP.x+2.7)/5.4,vy)); vec4 cT=texture2D(tTop,vec2((vOP.x+2.7)/5.4,(vOP.z+1.1)/2.2));
vec4 lv=mix(cT,cS,ws);
vec3 cbS=texture2D(tCarbon,vOP.xy*6.5).rgb, cbT=texture2D(tCarbon,vOP.xz*6.5).rgb; vec3 cb=mix(cbT,cbS,ws);
gCarb=1.0-smoothstep(0.3,0.7,lv.a);
vec3 col=mix(lv.rgb,cb,gCarb);
float frit=1.0-smoothstep(0.010,0.0135,wsd); col=mix(col,vec3(0.006),frit); gLens=max(gLens,frit*0.6);
float az=abs(vOP.z);
// louvres on top of the wheel arches
{ float pf=rbox(vec2(vOP.x-1.17,az-0.775),vec2(0.21,0.155),0.05); float pr=rbox(vec2(vOP.x+1.80,az-0.77),vec2(0.17,0.15),0.05);
  float inF=(1.0-smoothstep(-0.003,0.0,pf))*step(0.5,on.y), inR=(1.0-smoothstep(-0.003,0.0,pr))*step(0.5,on.y);
  float L=max(inF,inR); float ph=fract(vOP.x/0.0325);
  float slot=smoothstep(0.0,0.07,ph)*(1.0-smoothstep(0.36,0.43,ph));
  gGap=L*slot; gTilt=L*(1.0-slot)*(ph-0.7)*2.2;
  col=mix(col,vec3(0.003),gGap*0.97);
  float edge=(1.0-smoothstep(0.0025,0.0045,abs(pf)))*step(0.5,on.y)+(1.0-smoothstep(0.0025,0.0045,abs(pr)))*step(0.5,on.y);
  col=mix(col,vec3(0.004),clamp(edge,0.0,1.0)*0.9); }
// panel shut lines
{ float l1=(1.0-smoothstep(0.0012,0.0026,abs(vOP.x-0.80)))*step(0.56,az)*step(0.3,on.y);
  float l2=(1.0-smoothstep(0.0012,0.0026,abs(vOP.x+1.05)))*step(0.3,on.y)*step(az,0.62)*step(0.5,vOP.y);
  float dr=rbox(vec2(vOP.x+0.20,vOP.y-0.79),vec2(0.42,0.20),0.07); float l3=(1.0-smoothstep(0.0012,0.0026,abs(dr)))*step(0.55,abs(on.z))*step(0.2,az);
  col=mix(col,vec3(0.005),clamp(l1+l2+l3,0.0,1.0)*0.85); gGap=max(gGap,clamp(l1+l2+l3,0.0,1.0)*0.7); }
// front light bar + intakes
{ float fr=smoothstep(0.30,0.62,on.x)*step(2.02,vOP.x); float yl=frontY(az);
  float lens=fr*(1.0-smoothstep(0.022,0.027,abs(vOP.y-yl)))*step(az,0.985);
  float strip=fr*(1.0-smoothstep(0.0045,0.0075,abs(vOP.y-yl)))*step(az,0.97);
  float drl=fr*(1.0-smoothstep(0.004,0.007,abs(az-0.90)))*step(yl-0.11,vOP.y)*step(vOP.y,yl);
  float led=0.75+0.25*smoothstep(0.2,0.5,abs(fract(vOP.z*55.0)-0.5));
  col=mix(col,vec3(0.002),lens*0.97); gLens=max(gLens,lens);
  gEm+=uHead*vec3(1.0,0.96,0.90)*(strip*led*7.0+drl*5.0)+uHead*vec3(0.5,0.7,1.0)*lens*0.15*smoothstep(0.02,0.0,abs(vOP.y-yl)-0.006);
  float inl=fr*step(vOP.y,yl-0.045)*step(0.115,vOP.y)*step(az,0.74)*(1.0-step(abs(vOP.z),0.10)*step(0.16,vOP.y));
  vec2 hp=vec2(vOP.z*110.0,vOP.y*127.0); vec2 hq=abs(fract(hp+vec2(0.5*floor(hp.y),0.0))-0.5);
  float hex=smoothstep(0.32,0.42,max(hq.x,hq.y));
  gMesh=inl; col=mix(col,mix(vec3(0.001),vec3(0.012),hex),inl);
  // rear light bar + mesh
  float rb=smoothstep(0.30,0.62,-on.x)*step(vOP.x,-2.2); float yt=rearY(az);
  float rl=rb*(1.0-smoothstep(0.020,0.025,abs(vOP.y-yt)))*step(az,0.985);
  float rs=rb*(1.0-smoothstep(0.006,0.0095,abs(vOP.y-yt)))*step(az,0.97);
  float rled=0.7+0.3*smoothstep(0.15,0.45,abs(fract(vOP.z*40.0)-0.5));
  col=mix(col,vec3(0.02,0.0,0.0),rl*0.97); gLens=max(gLens,rl);
  gEm+=uTail*vec3(1.0,0.015,0.01)*(rs*rled*6.0+rl*0.25);
  float rm=rb*step(vOP.y,yt-0.04)*step(0.37,vOP.y)*step(az,0.86);
  gMesh=max(gMesh,rm); col=mix(col,mix(vec3(0.001),vec3(0.012),hex),rm); }
if(!gl_FrontFacing){ col=vec3(0.018); gBack=1.0; gEm=vec3(0.0); }
diffuseColor.rgb=col;
`;
export const PAINT_ROUGH=`
roughnessFactor=mix(uPaintRough,0.30,gCarb); metalnessFactor=mix(uPaintMetal,0.2,gCarb);
roughnessFactor=mix(roughnessFactor,0.85,max(gGap,gMesh)); metalnessFactor=mix(metalnessFactor,0.0,max(max(gGap,gLens),gMesh));
roughnessFactor=mix(roughnessFactor,0.05,gLens*(1.0-gMesh));
if(gBack>0.5){ roughnessFactor=0.75; metalnessFactor=0.0; }
`;
export const PAINT_NORMAL=`normal=normalize(normal+normalize(vXv)*gTilt);`;
export const PAINT_LIGHTS=`material.clearcoat*= (1.0-max(gGap,gMesh))*(1.0-gBack);`;
export const PAINT_EMIS=`totalEmissiveRadiance+=gEm;`;
