import { minutesOf as minutes } from '../../itinerary/services/itinerary-schedule-adjust.mjs';
const time = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const fixed = item => ['departure', 'arrival', 'AnchorSchedule'].includes(item.type);

// Use one existing AI time slot for the user's untimed stop. The map later
// verifies its actual venue and travel time; fixed appointments never move.
export function addSelectedWaypoint(days, request = {}) {
  const stop = request.selectedWaypoints?.[0];
  const name = typeof stop?.name === 'string' ? stop.name.trim().slice(0, 100) : '';
  const location = typeof stop?.location === 'string' ? stop.location.trim().slice(0, 200) : '';
  if (!name || !location || !Array.isArray(days)) return days;
  return days.map((day, dayIndex) => {
    if (dayIndex !== 0 || !Array.isArray(day.scheduleItems) || day.scheduleItems.length < 2) return day;
    const items = [...day.scheduleItems];
    let slot = items.findIndex(item => !fixed(item) && !item.addedByUser &&
      minutes(item.time) !== null && minutes(item.endTime) > minutes(item.time));
    if (slot < 0) {
      const gaps = items.slice(0, -1).map((item, index) => ({
        index: index + 1,
        start: minutes(item.endTime) ?? minutes(item.time),
        end: minutes(items[index + 1].time),
      })).filter(gap => gap.start !== null && gap.end !== null);
      const gap = gaps.sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
      if (!gap) return day;
      const stay = Math.min(60, Math.max(20, gap.end - gap.start - 30));
      const start = Math.min(1420, gap.start + Math.max(0, Math.floor((gap.end - gap.start - stay) / 2)));
      slot = gap.index;
      items.splice(slot, 0, { time: time(start), endTime: time(start + stay) });
    }
    const { time: start, endTime } = items[slot];
    items[slot] = {
      type: 'attraction', time: start, endTime, title: name, location,
      description: '', duration: '', transitInfo: '', officialWebsiteUrl: '',
      googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`,
      addedByUser: true,
    };
    return { ...day, scheduleItems: items };
  });
}
