import { normalizePlannerRequest } from './planner-constraints.mjs';
import { minutesOf as minutes } from '../../itinerary/services/itinerary-schedule-adjust.mjs';

export async function findFixedVisitIssue(request, checks = {}) {
  const days=normalizePlannerRequest(request).dailyData;
  for (const day of days) {
    const fixed=(day.anchors || []).filter(anchor=>!anchor.flexible);
    for (const anchor of fixed) {
      if (minutes(anchor.time)===null || minutes(anchor.endTime)===null || anchor.time>=anchor.endTime) return {reason:'time',anchor,day:day.day};
      // Same rule as the server's anchor-bounds; otherwise the travel legs below read it as a negative gap.
      if (anchor.time<day.startTime || anchor.endTime>day.endTime) return {reason:'bounds',anchor,day:day.day};
    }
    fixed.sort((a,b)=>a.time.localeCompare(b.time));
    for (let index=1;index<fixed.length;index++) if(fixed[index-1].endTime>fixed[index].time) return {reason:'overlap',anchor:fixed[index],day:day.day};
    for (const anchor of fixed) {
      const hours = await checks.hoursStatus?.(anchor, day.date, anchor.time, anchor.endTime);
      if (hours === 'closed' || hours === 'conflict') return { reason: 'hours', anchor, day: day.day };
    }
    if (!fixed.length || !checks.travelMinutes) continue;
    const stops=[{location:day.startLocation,endTime:day.startTime},...fixed,{location:day.endLocation,time:day.endTime}];
    for (let index=0;index<stops.length-1;index++) {
      const from=stops[index],to=stops[index+1];
      if(minutes(from.endTime)===null || minutes(to.time)===null) continue;
      const travel=await checks.travelMinutes(from.location,to.location,day.date,from.endTime);
      if(!Number.isFinite(travel)) return {reason:'route',anchor:to.name?to:from,day:day.day};
      if(minutes(to.time)-minutes(from.endTime)<travel) return {reason:'travel',anchor:to.name?to:from,day:day.day};
    }
  }
  return null;
}
