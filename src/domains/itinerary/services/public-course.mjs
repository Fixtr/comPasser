const VISIT_TYPES = new Set(['attraction', 'dining', 'leisure']);

export function publishableStops(plan) {
  const stops = [];
  for (const day of plan?.days || []) {
    for (const item of day.scheduleItems || []) {
      if (!VISIT_TYPES.has(item.type) || (item.placeIntent && item.placeStatus !== 'verified')) continue;
      const name = String(item.title || '').trim();
      const location = String(item.location || '').trim();
      if (!name || !location || name.length > 100 || location.length > 200) continue;
      if (stops.some(stop => stop.name === name && stop.location === location)) continue;
      stops.push({ name, location, stayMinutes: Math.min(360, Math.max(20, Number(item.duration) || 60)) });
    }
  }
  return stops.slice(0, 6);
}
