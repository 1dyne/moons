import * as THREE from 'three';

const fragmentShader = `
precision highp float;
varying vec2 vUv;
uniform mat4 uInverseProjection;
uniform mat4 uCameraMatrix;
uniform vec3 uCamera;
uniform float uTime;

float hash(vec3 p) {
  p = fract(p * .3183099 + vec3(.11,.17,.13));
  p *= 17.;
  return fract(p.x*p.y*p.z*(p.x+p.y+p.z));
}
float noise(vec3 p) {
  vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),
    mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
    mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p) {
  float f=.53*noise(p); p=p*2.07+vec3(3.4,7.3,1.8);
  f+=.27*noise(p); p=p*2.13+vec3(2.3,4.1,6.2);
  f+=.13*noise(p); p=p*2.03;
  return f+.07*noise(p);
}
void main(){
  vec4 target=uInverseProjection*vec4(vUv*2.-1.,1.,1.);
  vec3 rd=normalize((uCameraMatrix*vec4(normalize(target.xyz/target.w),0.)).xyz);
  vec3 col=vec3(.008,.015,.028);
  float transmission=1.;
  float jitter=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
  for(int i=0;i<52;i++){
    float t=12.+(float(i)+jitter)*4.7;
    vec3 p=uCamera+rd*t;
    vec3 q=p*.024;
    q.x+=q.y*.65;
    q.y+=sin(q.x*1.12)*.5;
    float warp=fbm(q*.62+vec3(7.5,1.2,3.7));
    float shape=exp(-pow((q.y+.18+(warp-.5)*2.6),2.)*1.25-pow((q.z+.8),2.)*.52);
    float cloud=fbm(q*3.4+warp*3.2);
    float detail=fbm(q*14.+warp*2.4);
    float structure=pow(smoothstep(.46,.79,cloud),1.6);
    float density=shape*structure*.16*(.4+detail*1.2);
    float ridge=pow(max(0.,1.-abs(cloud-.54)*4.8),4.);
    float colorMix=smoothstep(-.5,2.7,q.x+warp*.6);
    vec3 cold=mix(vec3(.025,.07,.18),vec3(.36,.7,.92),ridge*.8);
    vec3 warm=mix(vec3(.18,.028,.015),vec3(.67,.29,.15),ridge*.7);
    vec3 light=mix(cold,warm,colorMix);
    float core=exp(-length((p-vec3(13.,-2.,-19.))*vec3(.035,.055,.035)));
    light+=vec3(.17,.3,.44)*core*.7;
    float dust=fbm(q*1.7+vec3(13.,7.,3.));
    float obscuration=smoothstep(.42,.64,dust)*shape;
    float illumination=.85+1.4*exp(-pow(q.x+1.5,2.)*.65);
    col+=transmission*density*light*4.5*illumination;
    transmission*=1.-density*.64-obscuration*.15;
  }
  col=1.-exp(-col*1.25);
  gl_FragColor=vec4(col,1.);
}
`;

export function createNebula(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) {
  const target = new THREE.WebGLRenderTarget(1, 1, {depthBuffer:false});
  const material = new THREE.ShaderMaterial({
    uniforms:{uInverseProjection:{value:camera.projectionMatrixInverse},uCameraMatrix:{value:camera.matrixWorld},uCamera:{value:camera.position},uTime:{value:0}},
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader,depthTest:false,depthWrite:false
  });
  const geometry=new THREE.PlaneGeometry(2,2);
  const scene=new THREE.Scene();
  scene.add(new THREE.Mesh(geometry,material));
  const screen=new THREE.Scene();
  screen.add(new THREE.Mesh(geometry,new THREE.ShaderMaterial({uniforms:{map:{value:target.texture}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'varying vec2 vUv;uniform sampler2D map;void main(){gl_FragColor=texture2D(map,vUv);}',depthTest:false,depthWrite:false})));
  const screenCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  return {
    dispose(){target.dispose();geometry.dispose();material.dispose();screen.traverse(object=>{if(object instanceof THREE.Mesh)object.material.dispose();});},
    resize(width: number,height: number){target.setSize(Math.max(1,Math.round(Math.min(width,1600)*.45)),Math.max(1,Math.round(Math.min(height,1000)*.45)));},
    render(time: number){
      material.uniforms.uTime.value=time;
      renderer.setRenderTarget(target);renderer.render(scene,screenCamera);
      renderer.setRenderTarget(null);renderer.render(screen,screenCamera);renderer.clearDepth();
    }
  };
}
