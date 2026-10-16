import { dateRange } from '../../../../functions/travel-region.mjs';
import { normalizeSelectedPlace } from './selected-place.mjs';
export function stayIssue(stays, dates) {
  const end = dates.at(-1);
  for (const [index, stay] of stays.entries()) {
    if (!dateRange(stay.checkin, 1).length || !dateRange(stay.checkout, 1).length || stay.checkin >= stay.checkout
      || stay.checkin < dates[0] || stay.checkout > end
      || stays.some((other, i) => i !== index && stay.checkin < other.checkout && other.checkin < stay.checkout)) return index;
  }
  return -1;
}
export function nightlyStays(stays, dates) {
  if (stayIssue(stays, dates) !== -1) return dates.slice(1).map(() => '');
  return dates.slice(0, -1).map(date => {
    const stay = stays.find(stay => stay.checkin <= date && date < stay.checkout);
    return normalizeSelectedPlace(stay?.location) || (typeof stay?.location === 'string' ? stay.location : '');
  });
}
export function moveTripDates(draft, dates) {
  if (!dates.length || !draft.date?.length) return { ...draft, date: dates };
  const shift = (Date.parse(`${dates[0]}T12:00:00Z`) - Date.parse(`${draft.date[0]}T12:00:00Z`)) / 86400000;
  const shiftedDate = value => dateRange(value, 1).length && Number.isFinite(shift)
    ? new Date(Date.parse(`${value}T12:00:00Z`) + shift * 86400000).toISOString().slice(0, 10) : value;
  return { ...draft, date: dates, ...(Array.isArray(draft.stays) ? { stays: dates.length < 2 ? [] : draft.stays.map(stay => ({ ...stay,
    checkin: shiftedDate(stay.checkin),
    checkout: shiftedDate(stay.checkout),
  })) } : {}) };
}
