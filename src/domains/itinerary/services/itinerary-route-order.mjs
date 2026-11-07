import { assessVisitHours, nextVisitStart } from './itinerary-hours.mjs';
import { fitMeasuredSchedule, hasFixedArrivalConflict } from './itinerary-end-fit.mjs';
import { normalizeSelectedPlace } from '../../planner/services/selected-place.mjs';
import { distanceMeters } from '../../map/services/recommendation-place.mjs';
import { minutesOf as minutes } from './itinerary-schedule-adjust.mjs';

const boundary = item => ['departure', 'arrival', 'AnchorSchedule'].includes(item?.type);
const time = value => `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
function identity(item) {
  if (!boundary(item) && Object.hasOwn(item, 'placeIntent') && item.placeStatus !== 'verified') return null;
  return normalizeSelectedPlace(item.selectedPlace) || normalizeSelectedPlace(item.verifiedPlace)
    || normalizeSelectedPlace(item.resolvedPlace);
}

// A geographic suggestion, NOT a shortest-transit or opening-hours solver.
// Never cross anchors, invent coordinates, remove visits, or mutate the input.
export function suggestRouteOrder(items, resolvedPlaces = [], { automatic = false } = {}) {
  const unchanged = { items, changed: false, beforeMeters: 0, afterMeters: 0, skippedBlocks: 0 };
  if (!Array.isArray(items) || items.length > 100) return unchanged;
  const result = { ...unchanged, items: items.slice(), sourceIndexes: items.map((_, index) => index) };
  const locked = item => automatic ? item.type === 'departure' || item.type === 'arrival' ||
    (item.type === 'AnchorSchedule' && item.flexible !== true) || item.addedByUser === true || item.visitNotBefore : boundary(item);
  const bounds = items.flatMap((item,index) => locked(item) ? [index] : []);
  for (let block=1;block<bounds.length;block++) {
    const left=bounds[block-1], right=bounds[block];
    if (right-left < 3) continue;
    const original=items.slice(left+1,right);
    const all=items.slice(left,right+1), coords=all.map((item,offset)=>{
      const saved=identity(item);
      if(saved) return saved;
      if(!boundary(item) && Object.hasOwn(item,'placeIntent') && item.placeStatus!=='verified') return null;
      // Only current, request-guarded map results may fill legacy coordinates.
      const result=resolvedPlaces.find(result=>result.index===left+offset);
      const p=result?.coordinates;
      return result?.name && result?.address && Number.isFinite(p?.lat) && Math.abs(p.lat)<=90
        && Number.isFinite(p?.lng) && Math.abs(p.lng)<=180 ? p : null;
    });
    const stays=original.map(item => {
      const start=minutes(item.time), end=minutes(item.endTime);
      return start !== null && end !== null && end>start ? end-start : null;
    });
    const gaps=original.slice(1).map((item,i)=>minutes(item.time)-minutes(original[i].endTime));
    const from=minutes(original[0].time), until=minutes(original.at(-1).endTime);
    const lower=minutes(items[left].endTime || items[left].time), upper=minutes(items[right].time);
    if(original.length>20 || coords.some(c=>!c) || stays.some(s=>s===null) || gaps.some(g=>g<0)
      || lower===null || upper===null || from<lower || until>upper) {
      result.skippedBlocks++;continue;
    }
    const length = order => {
      const points=[coords[0],...order.map(i=>coords[i+1]),coords.at(-1)];
      return points.slice(1).reduce((sum,p,i)=>sum+distanceMeters(points[i],p),0);
    };
    let order=original.map((_,i)=>i), best=length(order);
    const before=best;
    // Bounded best-improvement 2-opt, deterministic ties retain original order.
    for(let pass=0;pass<20;pass++) {
      let next=order, score=best;
      for(let a=0;a<order.length-1;a++) for(let b=a+1;b<order.length;b++) {
        const trial=[...order.slice(0,a),...order.slice(a,b+1).reverse(),...order.slice(b+1)];
        if (automatic && trial.some((index, position) => original[position].type === 'dining' && index !== position)) continue;
        const candidate=length(trial);
        if(candidate < score-1) {next=trial;score=candidate;}
      }
      if (automatic) for(let a=0;a<order.length-1;a++) for(let b=a+1;b<order.length;b++) {
        if (original[order[a]].type === 'dining' || original[order[b]].type === 'dining') continue;
        const trial = order.slice();
        [trial[a], trial[b]] = [trial[b], trial[a]];
        const candidate = length(trial);
        if (candidate < score-1) { next=trial; score=candidate; }
      }
      if(next===order) break;
      order=next;best=score;
    }
    if(before-best < 500 || best>before*0.9) continue;
    result.changed=true;result.beforeMeters+=before;result.afterMeters+=best;
    let cursor=from;
    order.forEach((originalIndex,position)=>{
      const end=cursor+stays[originalIndex];
      result.items[left+1+position]={...original[originalIndex],time:time(cursor),endTime:time(end),transitInfo:''};
      result.sourceIndexes[left+1+position]=left+1+originalIndex;
      cursor=end+(gaps[position]||0);
    });
  }
  return result;
}

// ponytail: measure one geographic proposal, not every permutation; revisit only if real trips still backtrack.
export async function improveMeasuredRouteOrder(items, resolvedPlaces, routes, { travelMinutes, endTime, startTime, date, hoursByIndex = [] } = {}) {
  const unchanged = { items, changed: false };
  const proposal = suggestRouteOrder(items, resolvedPlaces, { automatic: true });
  if (!proposal.changed || !travelMinutes) return unchanged;
  const known = new Map((routes || []).filter(route => Number.isInteger(route.fromIndex) && route.fromIndex >= 0 &&
    route.fromIndex < items.length - 1 && (route.toIndex ?? route.fromIndex + 1) === route.fromIndex + 1 &&
    Number.isFinite(route.durationMinutes) && route.durationMinutes >= 0).map(route => [route.fromIndex, route.durationMinutes]));
  if (known.size !== items.length - 1) return unchanged;
  const places = proposal.items.map((item, index) => identity(item) || resolvedPlaces.find(result => result.index === proposal.sourceIndexes[index])?.coordinates);
  if (places.some(place => !place)) return unchanged;
  const measured = [];
  const candidateHours = proposal.sourceIndexes.map(index => hoursByIndex[index]);
  // Transit depends on departure time. Measure each next leg after the actual previous arrival + stay.
  let cursor = minutes(startTime) ?? minutes(items[0].time);
  for (let i=0; i<proposal.items.length-1; i++) {
    if (cursor === null || cursor >= 1440) return unchanged;
    const durationMinutes = await travelMinutes(places[i], places[i+1], date, time(cursor));
    if (!Number.isFinite(durationMinutes) || durationMinutes < 0) return unchanged;
    measured.push({ fromIndex:i, toIndex:i+1, durationMinutes:Math.ceil(durationMinutes) });
    const next = proposal.items[i+1];
    cursor += Math.ceil(durationMinutes);
    if (next.type === 'AnchorSchedule' && next.flexible !== true) {
      if (cursor > minutes(next.time)) return unchanged;
      cursor = minutes(next.endTime);
    } else if (next.type !== 'arrival') {
      const meal = next.type === 'dining' ? minutes(next.time) : cursor;
      const stay = minutes(next.endTime) - minutes(next.time);
      const start = nextVisitStart(next, date, candidateHours[i+1], Math.max(cursor, meal, minutes(next.visitNotBefore) ?? cursor), stay, minutes(endTime));
      if (start === null) return unchanged;
      cursor = start + stay;
    }
  }
  const before = [...known.values()].reduce((sum,n) => sum+n,0);
  const after = measured.reduce((sum,route) => sum+route.durationMinutes,0);
  if (before - after < 2) return unchanged;
  const fitted = fitMeasuredSchedule(proposal.items, measured, endTime, startTime, { compact:true, date, hoursByIndex:candidateHours });
  if (fitted.items.length !== items.length || hasFixedArrivalConflict(fitted.items, measured) ||
    minutes(fitted.items.at(-1).time) > minutes(endTime) || fitted.items.some((item, i) =>
      ['closed', 'conflict'].includes(assessVisitHours(item, date, candidateHours[i])))) return unchanged;
  return { items:fitted.items, changed:true, savedMinutes:before-after, beforeMinutes:before };
}
