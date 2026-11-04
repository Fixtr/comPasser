import { dateRange } from '../../../../functions/travel-region.mjs';
import { normalizeSelectedPlace } from './selected-place.mjs';
const badStay = (stays, dates, index) => {
  const stay = stays[index];
  return !dateRange(stay.checkin, 1).length || !dateRange(stay.checkout, 1).length || stay.checkin >= stay.checkout
    || stay.checkin < dates[0] || stay.checkout > dates.at(-1)
    || stays.some((other, i) => i !== index && stay.checkin < other.checkout && other.checkin < stay.checkout);
};
export function stayIssue(stays, dates) {
  return stays.findIndex((_, index) => badStay(stays, dates, index));
}
// A flagged stay covers no night, but valid stays still apply so the review is the only thing blocked.
export function nightlyStays(stays, dates) {
  return dates.slice(0, -1).map(date => {
    const stay = stays.find((stay, index) => stay.checkin <= date && date < stay.checkout && !badStay(stays, dates, index));
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
