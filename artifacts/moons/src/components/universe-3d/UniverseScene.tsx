import {forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState} from 'react';
import type {UniverseDTO} from '@/lib/thought';
import {layoutUniverse, type Position3, type UniverseSelection} from '@/lib/live-universe';
import type {UniverseEngine} from './engine';
import {aggregatePlanetEdges} from '@/lib/mother-links';
import FlatUniverse from './FlatUniverse';
import {tr} from '@/lib/i18n';

export type CameraPose = {position: Position3; target: Position3};
export type SceneHandle = {
  /** Transparent PNG of the current view, planet labels drawn in, with an optional caption. */
  capture: (caption?: string) => Promise<Blob | null>;
  zoom: (scale: number) => void; reset: () => void;
  rotate: (horizontal: number, vertical: number) => void;
  spread: (value: number) => void;
  pickAt: (x: number, y: number) => UniverseSelection;
  nearest: (x: number, y: number, radius: number, planetsOnly?: boolean) => {selection: UniverseSelection; x: number; y: number} | null;
  movePlanet: (id: string, x: number, y: number) => void;
  savePlanets: () => void;
  resetPlanets: () => void;
  getCamera: () => CameraPose | null;
  setCamera: (pose: CameraPose) => void;
};
// Personal override: planet coordinates live in the server-backed UniverseState owned by the parent.
// This component never touches localStorage.
type Props = {
  data: UniverseDTO; fresh: Set<string>; selection: UniverseSelection;
  showLinks: boolean; paused: boolean; reducedMotion: boolean;
  placed: Record<string, Position3>;
  initialCamera?: CameraPose;
  onPlace: (id: string, point: Position3) => void;
  onPlaceCommit: () => void;
  onResetPlanets: () => void;
  onSelect: (selection: UniverseSelection, compare?: boolean) => void;
  onAvailability: (available: boolean) => void;
};

const UniverseScene = forwardRef<SceneHandle, Props>(function UniverseScene(props, ref) {
  const {data, fresh, selection, showLinks, paused, reducedMotion, placed, onSelect} = props;
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<UniverseEngine | null>(null);
  const labels = useRef(new Map<string, HTMLButtonElement>());
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const layout = useMemo(() => layoutUniverse(data, placed), [data, placed]);
  const edges = useMemo(() => aggregatePlanetEdges(data.thoughts.filter(t => t.status !== 'held'), data.links), [data]);
  const current = useRef({layout, edges, ...props});
  current.current = {layout, edges, ...props};

  useImperativeHandle(ref, () => ({
    capture: async caption => {
      const engineNow = engine.current, box = host.current;
      if (!engineNow || !box) return null;
      const shot = engineNow.capture(), scale = shot.width / box.clientWidth;
      const g = shot.getContext('2d')!, hostRect = box.getBoundingClientRect();
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const label of labels.current.values()) {
        const r = label.getBoundingClientRect();
        if (!r.width || r.right < hostRect.left || r.left > hostRect.right) continue;
        const name = label.querySelector('span')?.textContent ?? '', note = label.querySelector('small')?.textContent ?? '';
        const x = (r.left + r.width / 2 - hostRect.left) * scale, y = (r.top + r.height / 2 - hostRect.top) * scale;
        g.fillStyle = 'rgba(235,242,255,.95)'; g.font = `600 ${13 * scale}px Pretendard, system-ui, sans-serif`; g.fillText(name, x, y - 6 * scale);
        g.fillStyle = 'rgba(200,214,240,.75)'; g.font = `${10 * scale}px Pretendard, system-ui, sans-serif`; g.fillText(note, x, y + 9 * scale);
      }
      if (caption) {
        g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = 'rgba(200,214,240,.85)';
        g.font = `${12 * scale}px Pretendard, system-ui, sans-serif`; g.fillText(caption, 16 * scale, shot.height - 16 * scale);
      }
      return new Promise<Blob | null>(resolve => shot.toBlob(resolve, 'image/png'));
    },
    zoom: scale => engine.current?.zoom(scale), reset: () => engine.current?.reset(),
    rotate: (horizontal, vertical) => engine.current?.rotate(horizontal, vertical),
    spread: value => engine.current?.spread(value),
    pickAt: (x, y) => engine.current?.pickAt(x, y) ?? null,
    nearest: (x, y, radius, planetsOnly) => engine.current?.nearest(x, y, radius, planetsOnly) ?? null,
    movePlanet: (id, x, y) => {
      const point = engine.current?.planetPoint(id, x, y);
      if (point) current.current.onPlace(id, point);
    },
    savePlanets: () => current.current.onPlaceCommit(),
    resetPlanets: () => current.current.onResetPlanets(),
    getCamera: () => engine.current?.getCamera() ?? null,
    setCamera: pose => engine.current?.setCamera(pose),
  }), []);
  useEffect(() => {
    let alive = true;
    const fail = () => {
      if (!alive) return;
      engine.current?.dispose(); engine.current = null; setStatus('fallback');
      current.current.onAvailability(false);
    };
    void import('./engine').then(({createUniverse}) => {
      if (!alive || !host.current) return;
      try {
        engine.current = createUniverse(host.current, {
          select: (selected, compare) => current.current.onSelect(selected, compare), fail,
          project: (id, x, y, visible) => {
            const label = labels.current.get(id);
            if (!label) return;
            label.hidden = !visible;
            label.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,0)`;
          },
        });
      } catch { fail(); return; }
      const value = current.current;
      engine.current.motion(value.paused, value.reducedMotion);
      engine.current.update(value.layout, value.fresh, value.selection, value.showLinks, value.edges);
      if (value.initialCamera) engine.current.setCamera(value.initialCamera);
      setStatus('ready');
      current.current.onAvailability(true);
    }).catch(fail);
    return () => {alive = false; engine.current?.dispose(); engine.current = null;};
  }, []);
  useEffect(() => {engine.current?.update(layout, fresh, selection, showLinks, edges);}, [layout, fresh, selection, showLinks, edges]);
  useEffect(() => {engine.current?.motion(paused, reducedMotion);}, [paused, reducedMotion]);

  return <div className="uv-scene" data-renderer={status}>
    {status !== 'fallback' && <>
      <div ref={host} className="uv-canvas" role="group" tabIndex={0}
        aria-label={tr('3D universe. Drag or use the arrow keys to rotate, scroll to zoom. Select a star or use the notes list.')}
        onKeyDown={event => {
          if (event.key.startsWith('Arrow')) {
            event.preventDefault();
            engine.current?.rotate(event.key === 'ArrowLeft' ? .12 : event.key === 'ArrowRight' ? -.12 : 0,
              event.key === 'ArrowUp' ? .08 : event.key === 'ArrowDown' ? -.08 : 0);
          }
        }}/>
      <nav className="uv-labels" aria-label={tr('Go to a mother planet')}>
        {layout.clusters.map(cluster => <button key={cluster.id} type="button" hidden={status !== 'ready'}
          ref={element => {if (element) labels.current.set(cluster.id, element); else labels.current.delete(cluster.id);}}
          className="uv-cluster" data-planet={cluster.id} aria-pressed={selection?.kind === 'planet' && selection.id === cluster.id}
          aria-label={tr('{name}, {count} notes',{name:cluster.name,count:cluster.count})}
          onClick={() => onSelect({kind: 'planet', id: cluster.id})}>
          <span>{cluster.name}</span><small>{tr('{count} notes',{count:cluster.count})}</small>
        </button>)}
      </nav>
    </>}
    {status === 'loading' && <p className="uv-loading" role="status">{tr('Opening your universe...')}</p>}
    {status === 'fallback' && <>
      <FlatUniverse data={data} fresh={fresh} cosmos edges={edges} onSelect={(id, compare) => onSelect({kind: 'thought', id}, compare)}/>
      <p className="uv-fallback" role="status" data-testid="status-flat-fallback">{tr('WebGL is not available here. This is a flat 2D map, not the 3D universe.')}</p>
    </>}
  </div>;
});
export default UniverseScene;
