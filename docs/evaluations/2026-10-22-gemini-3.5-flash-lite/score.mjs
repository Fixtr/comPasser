// Scores the app-normalized schedules in this folder with the current checkout's code. No API calls.
// Usage: node docs/evaluations/2026-10-22-gemini-3.5-flash-lite/score.mjs "$PWD" itinerary- itinerary-fill3-
import fs from 'node:fs';
const [root, ...prefixes] = process.argv.slice(2);
const { enforcePlannerConstraints } = await import(root + '/src/domains/planner/services/planner-constraints.mjs');
const { prepareGeneratedPlaces } = await import(root + '/src/domains/map/services/recommendation-place.mjs');
const min = t => /^\d\d:\d\d$/.test(t || '') ? +t.slice(0, 2) * 60 + +t.slice(3) : null;
const cases = ['day-anchor', 'day-airport', 'day-short', 'day-tight-anchors', 'four-day-food', 'four-day-anchors'];
for (const pre of prefixes) for (const m of ['2.5', '3.5']) {
  const t = { visits: [], lunch: 0, days: 0, tight: 0, rawOverlap: 0, early: 0, idle: 0, airport: null, out: 0 };
  for (const c of cases) {
    const cap = JSON.parse(fs.readFileSync(`${root}/docs/evaluations/2026-10-22-gemini-3.5-flash-lite/${pre}gemini-${m}-flash-lite/${c}.capture.json`));
    t.out += cap.usage.candidatesTokenCount;
    cap.response.days.forEach((d, k) => { const anchors = cap.request.dailyData[k].anchors;
      for (const i of d.scheduleItems) if (anchors.some(a => min(i.time) < min(a.endTime) && min(i.endTime) > min(a.time))) t.rawOverlap++; });
    const days = enforcePlannerConstraints(prepareGeneratedPlaces(cap.response.days, cap.request.budget), cap.request, 'ko');
    let n = 0;
    for (const day of days) {
      t.days++;
      const timed = day.scheduleItems.filter(i => min(i.endTime) !== null).sort((a, b) => min(a.time) - min(b.time));
      const opt = timed.filter(i => i.type !== 'AnchorSchedule'); n += opt.length;
      if (opt.some(i => i.placeIntent?.category === 'restaurant' && min(i.time) >= 660 && min(i.time) <= 840)) t.lunch++;
      t.early += opt.filter(i => i.placeIntent?.category === 'restaurant' && min(i.time) < 660 && !/아침|브런치|조식|breakfast|brunch/i.test(i.title + i.placeIntent.purpose)).length;
      for (let k = 1; k < timed.length; k++) { const g = min(timed[k].time) - min(timed[k - 1].endTime); if (g >= 0 && g < 15) t.tight++; }
      const s = min(day.scheduleItems[0].time), e = min(day.scheduleItems.at(-1).time);
      let cur = s, idle = 0; for (const i of timed) { idle = Math.max(idle, min(i.time) - cur); cur = Math.max(cur, min(i.endTime)); } idle = Math.max(idle, e - cur);
      t.idle = Math.max(t.idle, idle); if (c === 'day-airport') t.airport = e - cur;
    }
    t.visits.push(n);
  }
  console.log((pre + m).padEnd(22), JSON.stringify({ visits: t.visits.join(','), sum: t.visits.reduce((a, b) => a + b), lunch: `${t.lunch}/${t.days}`, rawOverlap: t.rawOverlap, earlyMeal: t.early, under15: t.tight, maxIdle: t.idle, airportGap: t.airport, out: t.out }));
}
