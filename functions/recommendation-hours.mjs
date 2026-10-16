import { dateRange } from './travel-region.mjs';

const DAY = 1440, WEEK = DAY * 7;
const unknown = () => ({ status: 'unknown', intervals: [] });
const clock = minute => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const isoDate = value => {
  if (![value?.year, value?.month, value?.day].every(Number.isInteger)) return null;
  const date = `${String(value.year).padStart(4, '0')}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
  return dateRange(date, 1).length ? date : null;
};

function point(value, dated) {
  if (!value || typeof value !== 'object') return null;
  if (!dated && value.day === undefined) return null;
  const { day = 0, hour = 0, minute = 0 } = value;
  if (!Number.isInteger(day) || day < 0 || day > 6 || !Number.isInteger(hour) || hour < 0 || hour > 23
    || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (!dated) return day * DAY + hour * 60 + minute;
  const date = isoDate(value.date);
  if (!date || (value.day !== undefined && new Date(date).getUTCDay() !== day)) return null;
  return Date.parse(date) / 60000 + hour * 60 + minute;
}

// Date-only discovery checks any opening interval; itinerary scheduling still checks the actual visit time.
export function recommendationHours(place, date, today) {
  if (!dateRange(date, 1).length || !dateRange(today, 1).length) return unknown();
  const ahead = (Date.parse(date) - Date.parse(today)) / 86400000;
  const current = ahead >= 0 && ahead < 7 ? place.currentOpeningHours : null;
  if (current?.periods !== undefined && !Array.isArray(current.periods)) return unknown();
  const special = Array.isArray(current?.specialDays) && current.specialDays.some(day => isoDate(day?.date) === date);
  const dated = Array.isArray(current?.periods);
  if (special && !dated) return unknown();
  const periods = dated ? current.periods : place.regularOpeningHours?.periods;
  if (!Array.isArray(periods) || periods.length > 100) return unknown();
  const status = dated ? 'current' : 'regular';
  if (!periods.length) return { status: 'closed', intervals: [] };
  // Places documents this exact no-close sentinel as 24/7, not an arbitrary missing close.
  if (periods.length === 1 && periods[0]?.close == null && ['day', 'hour', 'minute'].every(key => periods[0]?.open?.[key] === 0)
    && !periods[0].open.date && !periods[0].open.truncated) return { status, intervals: ['00:00–24:00'] };
  const from = dated ? Date.parse(date) / 60000 : new Date(date).getUTCDay() * DAY;
  const ranges = [];
  for (const period of periods) {
    const open = point(period?.open, dated);
    let close = point(period?.close, dated);
    if (open === null || close === null || close === open) return unknown();
    if (dated) {
      const windowStart = Date.parse(today) / 60000;
      if (close < open || open < windowStart || close > windowStart + WEEK) return unknown();
      if (period.close.truncated && period.close.hour === 23 && period.close.minute === 59) close++;
    } else if (close < open) close += WEEK;
    for (const shift of dated ? [0] : [-WEEK, 0, WEEK]) {
      const start = Math.max(0, open + shift - from), end = Math.min(DAY, close + shift - from);
      if (start < end) ranges.push([start, end]);
    }
  }
  const merged = [];
  for (const range of ranges.sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push(range);
  }
  if (merged.length > 14) return unknown();
  // shortcut: regular hours cannot predict future holiday exceptions; show them as a weekly guide only.
  return { status: merged.length ? status : 'closed', intervals: merged.map(([start, end]) => `${clock(start)}–${clock(end)}`) };
}
