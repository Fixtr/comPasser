import { tFor } from '../../../utils/i18n.js';

export const cityDestination = city => ({ id: city.id, country: city.country, name: `${tFor(city.key, 'en')}, ${tFor(`country${city.country}`, 'en')}` });

// A draft plans one city: moving it to another city drops the old city's visits and stays.
export function setDraftDestination(draft, destination) {
  const moved = draft.destination && draft.destination.id !== destination.id;
  return { ...draft, country: destination.country, destination, destinationStage: 'places',
    ...(moved ? { anchorSchedules: [], stays: [], dailyLocations: null } : {}) };
}

export function addCourseToDraft(draft, course, language = 'ko') {
  const trip = course.destination ? setDraftDestination(draft, course.destination) : draft;
  const anchors = [...trip.anchorSchedules];
  for (const stop of course.stops) {
    const name = language === 'en' ? stop.englishName || stop.name : stop.name;
    if (!anchors.some(item => [stop.name, name].includes(item.name) && item.location === stop.location)) {
      anchors.push({ day: 1, name, location: stop.location, time: '', endTime: '', flexible: true, stayMinutes: stop.stayMinutes });
    }
  }
  return { ...trip, anchorSchedules: anchors, selectedWaypoints: [] };
}
