import React, { useEffect, useRef, useState } from 'react';
import { geoOrthographic, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { destinationCountries } from '../domains/planner/services/travel-destinations.mjs';
import world from '../domains/planner/ui/world-110m.json';
import { t, getLang } from '../utils/i18n.js';
const countries = feature(world, world.objects.features).features;
const supported = new Set(destinationCountries);

export function TravelGlobe({ active, onChooseCity }) {
  const svg = useRef(null), rotation = useRef([-127, -30, 0]), drag = useRef(null), velocity = useRef([0,0]);
  const pointers = useRef(new Map()), pinch = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState(null);
  const [turning, setTurning] = useState(true);
  const [angle, setAngle] = useState(rotation.current);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const projection = geoOrthographic().scale(128 * zoom).translate([130,130]).rotate(angle);
  const path = geoPath(projection);
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
    if (!active || reduced) return undefined;
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
      {countries.map(country => <path key={country.properties.id} data-country={country.properties.id} d={path(country) || ''} className={selected===country.properties.id ? 'globe-selected' : ''}><title>{countryName(country.properties.id)}</title></path>)}
    </svg>
    <button className="globe-auto" onClick={() => setTurning(!turning)} aria-pressed={turning} aria-label={t(turning ? 'globePause' : 'globePlay')} title={t(turning ? 'globePause' : 'globePlay')}><span aria-hidden="true">{turning ? '❚❚' : '▶'}</span></button>
    </div>
    <h2>{t('flowDiscoverTitle')}</h2><p>{t('flowDiscoverDescription')}</p>
    {selected && <div key={selected} className="globe-selection" role="status"><strong>{countryName(selected)}</strong>{supported.has(selected) ? <button onClick={() => onChooseCity(selected)}>{t('globeCity')}</button> : <small>{t('globeSoon')}</small>}</div>}
  </section>;
}
