export const COURSE_CITIES = {
  seoul: ['서울', 'seoul'], busan: ['부산', 'busan'], jeju: ['제주', 'jeju'],
  incheon: ['인천', 'incheon'], daegu: ['대구', 'daegu'], daejeon: ['대전', 'daejeon'],
};
const normalize = text => String(text || '').normalize('NFKC').toLowerCase().trim();

export function filterCourses(courses, { search = '', city = '', duration = '' } = {}) {
  const terms = normalize(search).split(/\s+/).filter(Boolean);
  return courses.filter(course => {
    const places = course.stops.map(stop => `${stop.name} ${stop.location}`).join(' ');
    const haystack = normalize(`${course.title} ${places}`);
    if (!terms.every(term => haystack.includes(term))) return false;
    if (city && !COURSE_CITIES[city]?.some(alias => normalize(places).includes(alias))) return false;
    const minutes = course.stops.reduce((sum, stop) => sum + stop.stayMinutes, 0);
    return !duration || (duration === 'short' ? minutes <= 180 : duration === 'half' ? minutes > 180 && minutes <= 360 : minutes > 360);
  });
}

export function validateCourseReview(input, today) {
  const date = String(input.visitDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))
    || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date || date > today) throw new Error('courseReviewDateInvalid');
  const comment = String(input.comment || '').trim();
  if (!comment || comment.length > 600) throw new Error('courseReviewCommentInvalid');
  const result = { visitDate: date, comment };
  for (const [key, max, integer] of [['walkingKm', 100, false], ['spentWon', 10000000, true], ['visitMinutes', 1440, true]]) {
    const value = input[key] === '' || input[key] == null ? null : Number(input[key]);
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isInteger(value)))) throw new Error('courseReviewNumbersInvalid');
    result[key] = value;
  }
  return result;
}
