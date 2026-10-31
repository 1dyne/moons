import {useEffect, useId, useRef} from 'react';

// The MOONS moon, recoloured beige for the planner Satellite: same shape, eyes, gaze and blink, no outline.
export function Moon({size = 44, body = '#efe2d6', shade = '#d8c3aa'}: {size?: number; body?: string; shade?: string}) {
  const clip = useId().replace(/:/g, ''), svg = useRef<SVGSVGElement>(null), eyes = useRef<SVGGElement>(null), shadow = useRef<SVGPathElement>(null);
  useEffect(() => {
    let frame = 0, lastMove = performance.now(), previous = lastMove, lookX = 0, lookY = 0, targetX = 0, targetY = 0, idleX = 0, idleY = 0, nextGlance = lastMove + 1200, nextBlink = lastMove + 3500, blinkStart = -1000;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const move = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const r = svg.current?.getBoundingClientRect(); if (!r) return;
      const x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height * .47), len = Math.max(100, Math.hypot(x, y));
      targetX = x / len; targetY = y / len; lastMove = performance.now();
    };
    const animate = (now: number) => {
      let x = targetX, y = targetY;
      if (now - lastMove > 1200) {
        if (now >= nextGlance) { const a = Math.random() * Math.PI * 2, rad = .55 + Math.random() * .4; idleX = Math.cos(a) * rad; idleY = Math.sin(a) * rad * .7; nextGlance = now + 900 + Math.random() * 1500; }
        [x, y] = reduced.matches ? [0, 0] : [idleX, idleY];
      }
      const k = reduced.matches ? 1 : 1 - Math.exp(-Math.min(64, now - previous) / 190);
      lookX += (x - lookX) * k; lookY += (y - lookY) * k; previous = now;
      if (now >= nextBlink && !reduced.matches) { blinkStart = now; nextBlink = now + 3300 + Math.random() * 4000; }
      const t = now - blinkStart, blink = t < 160 ? Math.max(.12, Math.abs(t - 80) / 80) : 1;
      eyes.current?.setAttribute('transform', `translate(${(lookX * 4.5).toFixed(2)} ${(lookY * 4.5).toFixed(2)}) translate(0 45) scale(1 ${blink.toFixed(3)}) translate(0 -45)`);
      shadow.current?.setAttribute('d', `M${53 + lookX * 13} 3 C${81 + lookX * 12} 23 ${83 + lookX * 11} 73 ${66 + lookX * 12} 97H100V0Z`);
      frame = requestAnimationFrame(animate);
    };
    window.addEventListener('pointermove', move, {passive: true});
    frame = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('pointermove', move); };
  }, []);
  return <svg ref={svg} className="moon" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
    <defs><clipPath id={clip}><circle cx="50" cy="50" r="45" /></clipPath></defs>
    <g clipPath={`url(#${clip})`}><circle cx="50" cy="50" r="45" fill={body} /><path ref={shadow} d="M53 3C81 23 83 73 66 97H100V0Z" fill={shade} /></g>
    <g ref={eyes} fill="#111"><circle cx="44" cy="47" r="2.6" /><circle cx="63" cy="44" r="2.6" /></g>
  </svg>;
}

export function Speech({children}: {children: React.ReactNode}) {
  return <div className="speech">{children}</div>;
}
