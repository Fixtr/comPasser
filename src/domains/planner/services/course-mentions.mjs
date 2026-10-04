import { tFor } from '../../../utils/i18n.js';

export function countCourseMentions(courses, cities) {
  const counts = {};
  for (const city of cities) for (const place of city.places) {
    const aliases = ['ko', 'en'].map(lang => tFor(`${place.key}Name`, lang).toLocaleLowerCase());
    counts[place.id] = courses.filter(course => Array.isArray(course.stops)
      && course.stops.some(stop => aliases.includes(String(stop.name || '').trim().toLocaleLowerCase()))).length;
  }
  return counts;
}
