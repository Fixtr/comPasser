import React, { useEffect, useRef, useState } from 'react';
import { geoOrthographic, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { destinationCountries } from '../domains/planner/services/travel-destinations.mjs';
import world from '../domains/planner/ui/world-110m.json';
import { t, getLang } from '../utils/i18n.js';
const countries = feature(world, world.objects.features).features;
const supported = new Set(destinationCountries);
// Rebuilding 177 country paths every frame kept a slow phone's main thread 100% busy and made taps
// wait about 1 s, so the automatic turn is a short intro: it stops after this long or at the first touch.
const AUTO_TURN_MS = 10000;
// Under 24 px each way at full size, or missing from the 110m map (Singapore), so they get a marker to tap.
const MARKERS = { KOR: [127.8, 36.4], TWN: [121, 23.7], SGP: [103.82, 1.35] };

export function TravelGlobe({ active, onChooseCity }) {
  const svg = useRef(null), rotation = useRef([-127, -30, 0]), drag = useRef(null), velocity = useRef([0,0]);
  const pointers = useRef(new Map()), pinch = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState(null);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Reduced motion never turns, so the control starts in its paused state instead of claiming to rotate.
  const [turning, setTurning] = useState(!reduced);
  const userTurned = useRef(false);
  const [angle, setAngle] = useState(rotation.current);
  const projection = geoOrthographic().scale(128 * zoom).translate([130,130]).rotate(angle);
  const path = geoPath(projection);
  // path() is null on the far side of the globe, which hides the marker.
  const markers = Object.entries(MARKERS).filter(([, place]) => path({ type:'Point', coordinates:place })).map(([code, place]) => [code, projection(place)]);
  const zoomBy = factor => setZoom(value => Math.max(.65, Math.min(4, value * factor)));
  const distance = () => {
    const [a,b] = [...pointers.current.values()];
    return Math.max(1, Math.hypot(a.x-b.x, a.y-b.y));
  };
  useEffect(() => {
    if (!active) return undefined;
    const element = svg.current;
    const wheel = event => {
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 260 : 1);
      zoomBy(Math.exp(-Math.max(-1000, Math.min(1000, delta)) * .002));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', wheel);
      pointers.current.clear(); pinch.current=null; drag.current=null; velocity.current=[0,0];
    };
  }, [active]);
  useEffect(() => {
    // Under reduced motion only a turn the user starts runs (it starts paused); drags keep no inertia.
    if (!active || (reduced && !turning)) return undefined;
    let frame, last = 0;
    const tick = now => {
      if (last && !drag.current && !document.hidden) {
        const dt = Math.min(now-last, 40) / 16;
        const [vx,vy] = velocity.current;
        rotation.current = [rotation.current[0] + (vx || (turning && !selected ? .12 : 0))*dt, rotation.current[1]+vy*dt, 0];
        velocity.current = [Math.abs(vx)<.01 ? 0 : vx*.95, Math.abs(vy)<.01 ? 0 : vy*.95];
        if (vx || vy || (turning && !selected)) setAngle([...rotation.current]);
      }
      last=now; frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, reduced, turning, selected]);
  useEffect(() => {
    // Rotation the user switched on keeps going; the intro turn ends on its own.
    if (!active || !turning || userTurned.current) return undefined;
    const stop = event => { if (!event?.target?.closest?.('.globe-auto')) setTurning(false); };
    const timer = setTimeout(stop, AUTO_TURN_MS);
    document.addEventListener('pointerdown', stop, true);
    document.addEventListener('keydown', stop, true);
    return () => { clearTimeout(timer); document.removeEventListener('pointerdown', stop, true); document.removeEventListener('keydown', stop, true); };
  }, [active, turning]);
  const choose = country => {
    const next = selected === country ? null : country;
    setSelected(next); velocity.current=[0,0];
  };
  const rotate = (dx,dy) => { rotation.current=[rotation.current[0]+dx,rotation.current[1]+dy,0]; setAngle([...rotation.current]); };
  const pointerDown = event => {
    if (event.button !== 0) return;
    pointers.current.set(event.pointerId, {x:event.clientX,y:event.clientY});
    svg.current.setPointerCapture(event.pointerId); velocity.current=[0,0];
    if (pointers.current.size > 1) {
      if (drag.current) drag.current.moved=true;
      pinch.current=distance();
    } else drag.current={x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,moved:false,country:event.target.dataset.country};
  };
  const pointerMove = event => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, {x:event.clientX,y:event.clientY});
    if (pointers.current.size > 1) {
      const next=distance(); zoomBy(next/pinch.current); pinch.current=next; velocity.current=[0,0]; return;
    }
    const start=drag.current;
    if (!start) return;
    const dx=event.clientX-start.lastX,dy=event.clientY-start.lastY;
    start.lastX=event.clientX; start.lastY=event.clientY;
    start.moved ||= Math.hypot(event.clientX-start.x,event.clientY-start.y)>5;
    if(start.moved){rotate(dx*.55,-dy*.55);velocity.current=reduced?[0,0]:[dx*.55,-dy*.55];}
  };
  const pointerEnd = (event, cancelled=false) => {
    if (!pointers.current.has(event.pointerId)) return;
    const start=drag.current;
    pointers.current.delete(event.pointerId);
    if (cancelled) velocity.current=[0,0];
    if (pointers.current.size > 1) { pinch.current=distance(); return; }
    pinch.current=null;
    const [remaining]=pointers.current.values();
    drag.current=remaining ? {x:remaining.x,y:remaining.y,lastX:remaining.x,lastY:remaining.y,moved:true} : null;
    if (!remaining && !cancelled && start && !start.moved && start.country) choose(start.country);
  };
  const countryName = code => {
    if (supported.has(code)) return t(`country${code}`);
    try { return new Intl.DisplayNames([getLang()], { type:'region' }).of(countries.find(c => c.properties.id === code)?.properties.iso_a2 || '') || code; } catch { return countries.find(c => c.properties.id===code)?.properties.name || code; }
  };
  return <section className="travel-globe">
    <div className="globe-stage"><svg ref={svg} width="320" height="320" viewBox="0 0 260 260" role="img" aria-label={t('globeDrag')} tabIndex={0}
      onKeyDown={event => { const move={ArrowLeft:[-12,0],ArrowRight:[12,0],ArrowUp:[0,12],ArrowDown:[0,-12]}[event.key]; if(move){event.preventDefault(); rotate(...move);} else if(['+','=','-'].includes(event.key)){event.preventDefault();zoomBy(event.key==='-' ? 1/1.2 : 1.2);} }}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={event => pointerEnd(event,true)} onLostPointerCapture={event => pointerEnd(event,true)}>
      <circle cx="130" cy="130" r={128 * zoom} className="globe-ocean" />
      {/* The tap area sits under the country shapes, so it only widens over the sea and never takes a neighbour's tap: 40 units, 44 px on a 288 px globe. */}
      {markers.map(([code, [x, y]]) => <circle key={code} data-country={code} className="globe-marker-area" cx={x} cy={y} r="20" />)}
      {countries.map(country => <path key={country.properties.id} data-country={country.properties.id} d={path(country) || ''} className={selected===country.properties.id ? 'globe-selected' : ''}><title>{countryName(country.properties.id)}</title></path>)}
      {markers.map(([code, [x, y]]) => <circle key={code} data-country={code} className={`globe-marker${selected===code ? ' globe-selected' : ''}`} cx={x} cy={y} r="3"><title>{countryName(code)}</title></circle>)}
    </svg>
    {/* The label names the action, so no aria-pressed: both together read as 'stop rotation, pressed'. */}
    <button className="globe-auto" onClick={() => { userTurned.current = !turning; setTurning(!turning); }} aria-label={t(turning ? 'globePause' : 'globePlay')} title={t(turning ? 'globePause' : 'globePlay')}><span aria-hidden="true">{turning ? '❚❚' : '▶'}</span></button>
    </div>
    <h2>{t('flowDiscoverTitle')}</h2><p>{t('flowDiscoverDescription')}</p>
    {selected && <div key={selected} className="globe-selection" role="status"><strong>{countryName(selected)}</strong>{supported.has(selected) ? <button onClick={() => onChooseCity(selected)}>{t('globeCity')}</button> : <small>{t('globeSoon')}</small>}</div>}
  </section>;
}
