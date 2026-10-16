export function addCourseToDraft(draft, course, language = 'ko') {
  const anchors = [...draft.anchorSchedules];
  for (const stop of course.stops) {
    const name = language === 'en' ? stop.englishName || stop.name : stop.name;
    if (!anchors.some(item => [stop.name, name].includes(item.name) && item.location === stop.location)) {
      anchors.push({ day: 1, name, location: stop.location, time: '', endTime: '', flexible: true, stayMinutes: stop.stayMinutes });
    }
  }
  return { ...draft, ...(course.destination ? { country: course.destination.country, destination: course.destination, destinationStage: 'places' } : {}), anchorSchedules: anchors, selectedWaypoints: [] };
}
