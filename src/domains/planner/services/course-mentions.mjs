import { tFor } from '../../../utils/i18n.js';

export function countCourseMentions(courses, cities) {
  const counts = {};
  for (const city of cities) for (const place of city.places) {
    const aliases = ['ko', 'en'].map(lang => tFor(`${place.key}Name`, lang).toLocaleLowerCase());
    counts[place.id] = courses.filter(course => Array.isArray(course.stops)
      && course.stops.some(stop => {
        const name = String(stop.name || '').trim().toLocaleLowerCase();
        const location = String(stop.location || '').trim().toLocaleLowerCase();
        return aliases.some(alias => name === alias || location === alias || location.startsWith(`${alias},`));
      })).length;
  }
  return counts;
}
