import {useEffect, useId, useRef} from 'react';

// The MOONS moon, recoloured yellow for the planner Satellite: same shape, eyes, gaze and blink, no outline.
export function Moon({size = 44, body = '#f2c230', shade = '#d6a412'}: {size?: number; body?: string; shade?: string}) {
  const clip = useId().replace(/:/g, ''), svg = useRef<SVGSVGElement>(null), eyes = useRef<SVGGElement>(null), shadow = useRef<SVGPathElement>(null);
  useEffect(() => {
    // The eyes move only when something happens (a glance, a blink, the pointer moving); in between the loop sleeps,
    // so the moon never keeps the phone busy redrawing (a 60fps loop made taps feel slow).
    let frame = 0, timer = 0, lastMove = performance.now(), previous = lastMove, lookX = 0, lookY = 0, targetX = 0, targetY = 0, idleX = 0, idleY = 0, nextGlance = lastMove + 1200, nextBlink = lastMove + 3500, blinkStart = -1000;
    let lastT = '', lastD = '';
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const wake = () => { if (!frame) { clearTimeout(timer); timer = 0; previous = performance.now(); frame = requestAnimationFrame(animate); } };
    const move = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const r = svg.current?.getBoundingClientRect(); if (!r) return;
      const x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height * .47), len = Math.max(100, Math.hypot(x, y));
      targetX = x / len; targetY = y / len; lastMove = performance.now(); wake();
    };
    const animate = (now: number) => {
      frame = 0;
      let x = targetX, y = targetY;
      if (now - lastMove > 1200) {
        if (now >= nextGlance) { const a = Math.random() * Math.PI * 2, rad = .55 + Math.random() * .4; idleX = Math.cos(a) * rad; idleY = Math.sin(a) * rad * .7; nextGlance = now + 3500 + Math.random() * 4500; }
        [x, y] = reduced.matches ? [0, 0] : [idleX, idleY];
      }
      const k = reduced.matches ? 1 : 1 - Math.exp(-Math.min(64, now - previous) / 190);
      lookX += (x - lookX) * k; lookY += (y - lookY) * k; previous = now;
      if (now >= nextBlink && !reduced.matches) { blinkStart = now; nextBlink = now + 3300 + Math.random() * 4000; }
      const t = now - blinkStart, blinking = t < 160, blink = blinking ? Math.max(.12, Math.abs(t - 80) / 80) : 1;
      const tr = `translate(${(lookX * 4.5).toFixed(1)} ${(lookY * 4.5).toFixed(1)}) translate(0 45) scale(1 ${blink.toFixed(2)}) translate(0 -45)`;
      const d = `M${(53 + lookX * 13).toFixed(1)} 3 C${(81 + lookX * 12).toFixed(1)} 23 ${(83 + lookX * 11).toFixed(1)} 73 ${(66 + lookX * 12).toFixed(1)} 97H100V0Z`;
      if (tr !== lastT) { eyes.current?.setAttribute('transform', tr); lastT = tr; }
      if (d !== lastD) { shadow.current?.setAttribute('d', d); lastD = d; }
      const settled = Math.abs(x - lookX) < .01 && Math.abs(y - lookY) < .01 && !blinking;
      if (!settled) { frame = requestAnimationFrame(animate); return; }
      // Asleep until the next glance or blink (or the pointer moves); hidden tabs do not wake at all.
      const next = Math.min(now - lastMove > 1200 ? nextGlance : Infinity, nextBlink) - now;
      timer = window.setTimeout(() => { timer = 0; if (document.visibilityState === 'visible') wake(); else timer = window.setTimeout(wake, 5000); }, Math.max(50, Math.min(next, 8000)));
    };
    window.addEventListener('pointermove', move, {passive: true});
    frame = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); window.removeEventListener('pointermove', move); };
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
