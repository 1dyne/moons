import {useEffect,useId,useRef,useState} from 'react';
import {tr} from '@/lib/i18n';

// The paths follow the supplied logo's arch, moon, foliage and MOONS nameplate.
export function LineLogo(){return <svg className="line-logo" viewBox="0 0 1449 1086" fill="none" stroke="currentColor" strokeWidth="24" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <path d="M199 898C160 454 377 108 700 109c333 0 521 358 493 783M390 811C234 574 429 277 697 280c267-2 441 294 305 531M742 296c149 110 195 336 143 512M322 814h756M49 998h1305M72 985c6-43 44-62 87-42 8-36 44-57 88-39 17-38 56-44 95-26M1071 879c41-22 78-2 108 23 42-16 76 8 78 42 41-21 75 1 74 40M349 817v178M1057 817v178"/>
  <circle cx="649" cy="616" r="17" fill="currentColor" stroke="none"/><circle cx="793" cy="594" r="17" fill="currentColor" stroke="none"/>
  <path d="M378 956V842h119v114M437 846v110M558 842h69v114h-69zM687 842h75v114h-75zM822 956V842h62v114h139v-60h-82v-54h82"/>
</svg>}

function useMoonGaze(distance:number,faceY:number){
  const svg=useRef<SVGSVGElement>(null),eyes=useRef<SVGGElement>(null),shadow=useRef<SVGPathElement>(null);
  useEffect(()=>{
    let frame=0,lastMove=performance.now(),previous=lastMove,lookX=0,lookY=0,targetX=0,targetY=0;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    let idleX=0,idleY=0,nextGlance=lastMove+1200,previousSide=1,nextBlink=lastMove+3500,blinkStart=-1000;
    const pickGlance=()=>{const angle=Math.random()*Math.PI*2;const radius=.55+Math.random()*.4;idleX=Math.cos(angle)*radius;idleY=Math.sin(angle)*radius*.7;if(Math.abs(idleX)>.45&&Math.sign(idleX)===previousSide)idleX=-idleX;previousSide=Math.sign(idleX)||previousSide;};
    const move=(event:PointerEvent)=>{
      if(event.pointerType==='touch')return;
      const rect=svg.current?.getBoundingClientRect();if(!rect)return;
      const x=event.clientX-(rect.left+rect.width*.5),y=event.clientY-(rect.top+rect.height*faceY),length=Math.max(100,Math.hypot(x,y));
      targetX=x/length;targetY=y/length;lastMove=performance.now();
    };
    const animate=(now:number)=>{
      const elapsed=now-lastMove;
      let x=targetX,y=targetY;
      if(elapsed>1200){if(now>=nextGlance){pickGlance();nextGlance=now+900+Math.random()*1500;}[x,y]=reduced.matches?[0,0]:[idleX,idleY];}else nextGlance=now;
      const amount=reduced.matches?1:1-Math.exp(-Math.min(64,now-previous)/190);
      lookX+=(x-lookX)*amount;lookY+=(y-lookY)*amount;previous=now;
      if(now>=nextBlink&&!reduced.matches){blinkStart=now;nextBlink=now+3300+Math.random()*4000;}
      const blinkElapsed=now-blinkStart,blink=blinkElapsed<160?Math.max(.12,Math.abs(blinkElapsed-80)/80):1;
      const cy=distance>10?605:45;
      eyes.current?.setAttribute('transform',`translate(${(lookX*distance).toFixed(2)} ${(lookY*distance).toFixed(2)}) translate(0 ${cy}) scale(1 ${blink.toFixed(3)}) translate(0 ${-cy})`);
      shadow.current?.setAttribute('d',distance>10?`M${735+lookX*100} 293 C${892+lookX*85} 370 ${948+lookX*90} 655 ${884+lookX*85} 800H1100V260Z`:`M${53+lookX*13} 3 C${81+lookX*12} 23 ${83+lookX*11} 73 ${66+lookX*12} 97H100V0Z`);
      frame=requestAnimationFrame(animate);
    };
    const visibility=()=>{cancelAnimationFrame(frame);if(!document.hidden){previous=performance.now();frame=requestAnimationFrame(animate)}};
    window.addEventListener('pointermove',move,{passive:true});document.addEventListener('visibilitychange',visibility);
    frame=requestAnimationFrame(animate);
    return()=>{cancelAnimationFrame(frame);window.removeEventListener('pointermove',move);document.removeEventListener('visibilitychange',visibility)};
  },[distance,faceY]);
  return {svg,eyes,shadow};
}

export function MoonCharacter({large=false}:{large?:boolean}){
  const clip=useId().replace(/:/g,''),{svg,eyes,shadow}=useMoonGaze(4.5,.47);
  return <svg ref={svg} className={`moon-character ${large?'large':''}`} viewBox="0 0 100 100" aria-hidden="true">
    <defs><clipPath id={clip}><circle cx="50" cy="50" r="45"/></clipPath></defs>
    <g clipPath={`url(#${clip})`}><circle cx="50" cy="50" r="45" fill="#7da4fa"/><path ref={shadow} d="M53 3C81 23 83 73 66 97H100V0Z" fill="#365faf"/></g>
    <circle cx="50" cy="50" r="45" fill="none" stroke="#121417" strokeWidth="5"/>
    <g ref={eyes} fill="#111"><circle cx="44" cy="47" r="2.6"/><circle cx="63" cy="44" r="2.6"/></g>
  </svg>;
}

export function Logo(){
  const id=useId().replace(/:/g,''),{svg,eyes,shadow}=useMoonGaze(43,.56);
  return <svg ref={svg} className="hero-logo" viewBox="0 0 1449 1086" role="img" aria-label={tr('MOONS — blue moon in an arch')}>
    <defs><clipPath id={id}><path d="M397 798C368 751 354 700 354 643C354 452 507 297 696 296C883 293 1032 453 1032 642C1032 701 1017 754 991 798Z"/></clipPath></defs>
    <image href="/moons-logo.png" width="1449" height="1086"/>
    <g clipPath={`url(#${id})`}><rect x="330" y="280" width="730" height="530" fill="#7ba4f8"/><path ref={shadow} d="M735 293C892 370 948 655 884 800H1100V260Z" fill="#345eaf"/></g>
    <g ref={eyes} fill="#000"><circle cx="649" cy="616" r="19"/><circle cx="793" cy="594" r="19"/></g>
  </svg>;
}

const lines={dump:[tr('Ready to dump?'),tr('What’s on your mind?'),tr('A thought to keep?'),tr('Anything to share?')],media:[tr('Got some material?'),tr('What caught your eye?'),tr('Read anything good?'),tr('What stayed with you?')]};
let greetingIndex:number|undefined;
export function Speech({mode}:{mode:'dump'|'media'}){
  const [index,setIndex]=useState(0);
  useEffect(()=>{if(greetingIndex===undefined){try{const previous=Number(sessionStorage.getItem('moons.greeting')??'-1');greetingIndex=(previous+1+Math.floor(Math.random()*3))%4;sessionStorage.setItem('moons.greeting',String(greetingIndex))}catch{greetingIndex=Math.floor(Math.random()*4)}}setIndex(greetingIndex)},[]);
  return <div className="sketch-speech"><svg viewBox="0 0 240 76" preserveAspectRatio="none" aria-hidden="true"><path d="M16 3H224Q237 3 237 16V43Q237 56 224 56H168Q164 65 153 70L156 56H16Q3 56 3 43V16Q3 3 16 3Z" vectorEffect="non-scaling-stroke"/></svg><span>{lines[mode][index]}</span></div>;
}
