import { normalizeSelectedPlace } from '../../planner/services/selected-place.mjs';
import { distanceMeters } from '../../map/services/recommendation-place.mjs';

const boundary = item => ['departure', 'arrival', 'AnchorSchedule'].includes(item?.type);
const minutes = value => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || '')
  ? Number(value.slice(0,2))*60+Number(value.slice(3)) : null;
const time = value => `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
function identity(item) {
  if (!boundary(item) && Object.hasOwn(item, 'placeIntent') && item.placeStatus !== 'verified') return null;
  return normalizeSelectedPlace(item.selectedPlace) || normalizeSelectedPlace(item.verifiedPlace)
    || normalizeSelectedPlace(item.resolvedPlace);
}

// A geographic suggestion, NOT a shortest-transit or opening-hours solver.
// Never cross anchors, invent coordinates, remove visits, or mutate the input.
export function suggestRouteOrder(items, resolvedPlaces = []) {
  const unchanged = { items, changed: false, beforeMeters: 0, afterMeters: 0, skippedBlocks: 0 };
  if (!Array.isArray(items) || items.length > 100) return unchanged;
  const result = { ...unchanged, items: items.slice() };
  const bounds = items.flatMap((item,index) => boundary(item) ? [index] : []);
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
        const candidate=length(trial);
        if(candidate < score-1) {next=trial;score=candidate;}
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
      cursor=end+(gaps[position]||0);
    });
  }
  return result;
}
