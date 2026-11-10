import { TRAVEL_REGIONS } from '../../../../functions/travel-region.mjs';
import { getLocationName } from './location-name.mjs';
import { nightlyStays } from './trip-stays.mjs';
import { normalizeSelectedPlace } from './selected-place.mjs';
import { FLIGHT_BUFFER_MINUTES } from './flight-arrival.mjs';
const preserveLocation = value => normalizeSelectedPlace(value) || getLocationName(value);
// An entry the user is still filling in keeps its place; invalid values are reset, not kept.
const flightEntry = value => value && typeof value === 'object' ? {
  airport: preserveLocation(value.airport),
  time: /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.time || '') ? value.time : '',
  kind: Object.hasOwn(FLIGHT_BUFFER_MINUTES, value.kind || '') ? value.kind : 'international',
} : null;

/** Editable, flat input only. Derived dailyData must not override later edits. */
export function toPlannerDraft(request = {}) {
  const input = request && typeof request === 'object' ? request : {};
  const daily = Array.isArray(input.dailyData) ? input.dailyData : [];
  const first = daily[0] || {};
  const dates = input.date ?? input.datePref ?? daily.map(day => day.date);
  const date = (Array.isArray(dates) ? [...dates] : [dates]).filter(date => typeof date === 'string' && date);
  const nights = Math.min(Math.max(date.length - 1, 0), 3);
  const sameOvernightLocation = nights > 0 && input.sameOvernightLocation === true;
  // Legacy day endpoints are not lodging selections (often the airport).
  const stays = Array.isArray(input.overnightLocations) ? input.overnightLocations : [];
  return {
    date,
    country: Object.hasOwn(TRAVEL_REGIONS, input.country) ? input.country : input.destination?.country || '',
    destinationStage: ['country', 'city', 'places'].includes(input.destinationStage) ? input.destinationStage : null,
    destination: input.destination && typeof input.destination.id === 'string' && Object.hasOwn(TRAVEL_REGIONS, input.destination.country)
      ? { id: input.destination.id, country: input.destination.country, name: String(input.destination.name || '').slice(0, 100) } : null,
    step: ['/destination', '/preference/1', '/preference/2', '/plan', '/plan?review=1'].includes(input.step) ? input.step : null,
    ...(Array.isArray(input.stays) ? { stays: input.stays.slice(0, 3).map(stay => ({
      location: preserveLocation(stay.location), checkin: String(stay.checkin || ''), checkout: String(stay.checkout || ''),
    })) } : {}),
    theme: input.theme ?? null,
    budget: input.budget ?? null,
    companion: ['solo', 'couple', 'friends', 'family_kids', 'parents'].includes(input.companion) ? input.companion : null,
    // Optional flights; the form copies their airports and times into the first and last day.
    flights: { arrival: flightEntry(input.flights?.arrival), departure: flightEntry(input.flights?.departure) },
    startTime: input.startTime ?? first.startTime ?? '',
    endTime: input.endTime ?? first.endTime ?? '',
    startLocation: preserveLocation(input.startLocation ?? first.startLocation),
    endLocation: preserveLocation(input.endLocation ?? daily.at(-1)?.endLocation),
    dailyLocations: nights > 0 && Array.isArray(input.dailyLocations)
      ? date.map((_, index) => {
        const day = input.dailyLocations.find(day => Number(day.day) === index + 1);
        return { day: index + 1, startLocation: preserveLocation(day?.startLocation),
          endLocation: preserveLocation(day?.endLocation) };
      }) : null,
    sameOvernightLocation,
    overnightLocations: Array.isArray(input.stays) ? nightlyStays(input.stays, date) : Array.from({ length: nights }, (_, index) =>
      preserveLocation(stays[sameOvernightLocation ? 0 : index])),
    selectedWaypoints: Array.isArray(input.selectedWaypoints)
      ? input.selectedWaypoints.slice(0, 1).filter(stop => typeof stop?.name === 'string' && typeof stop?.location === 'string')
        .map(stop => ({ name: stop.name.trim().slice(0, 100), location: stop.location.trim().slice(0, 200) }))
        .filter(stop => stop.name && stop.location)
      : [],
    dailyTimes: Array.isArray(input.dailyTimes)
      ? structuredClone(input.dailyTimes)
      : (daily.length > 1 ? daily.map((day, index) => ({
        day: index + 1, startTime: day.startTime || '', endTime: day.endTime || '', isCustom: true,
      })) : null),
    anchorSchedules: structuredClone(Array.isArray(input.anchorSchedules)
      ? input.anchorSchedules
      : daily.flatMap((day, index) => (day.anchors || []).map(anchor => ({ ...anchor, day: index + 1 }))))
      .map(anchor => ({ ...anchor, location: preserveLocation(anchor.location) })),
  };
}

const parseObject = raw => {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
};

/**
 * One input draft shared by preference selection, the form, and edit mode.
 * currentFormData is the recovery copy. userPreference is a compatibility
 * projection for existing navigation guards, never a second source for submit.
 */
// Untimed picks without a day inside the trip go to the day with the fewest anchors (earliest on ties).
// Explicit days and timed anchors never move.
export function spreadVisitDays(draft) {
  const days = draft.date.length;
  if (days < 2) return draft;
  const placed = anchor => Number.isInteger(anchor.day) && anchor.day >= 1 && anchor.day <= days;
  const load = Array(days).fill(0);
  for (const anchor of draft.anchorSchedules) if (placed(anchor)) load[anchor.day - 1]++;
  return { ...draft, anchorSchedules: draft.anchorSchedules.map(anchor => {
    if (!anchor.flexible || placed(anchor)) return anchor;
    const day = load.indexOf(Math.min(...load)) + 1;
    load[day - 1]++;
    return { ...anchor, day };
  }) };
}

export function createPlannerDraftStore({ getStorage = () => null, getRecoveryStorage = () => null, onStorageError = () => {} } = {}) {
  let owner;
  const recoveryKey = 'compasser.planner.v1';
  let current = toPlannerDraft();
  let lastStored;
  let acceptStored = true;
  const read = () => {
    try {
      const storage = getStorage();
      if (storage && acceptStored) {
        const raw = storage.getItem('currentFormData');
        const pref = storage.getItem('userPreference');
        const signature = JSON.stringify([raw, pref]);
        if (signature !== lastStored) {
          // Older form copies can lack preferences; explicit null/empty values
          // still win. Never replace an existing draft field with old preferences.
          current = toPlannerDraft({ ...parseObject(pref), ...parseObject(raw) });
          lastStored = signature;
        }
      }
    } catch { /* Keep the in-memory draft if storage is unavailable. */ }
    return structuredClone(current);
  };
  const save = request => {
    // Remember the last recovery copy before attempting a write. If quota blocks
    // the write, reading that unchanged copy must not undo the in-memory edit.
    read();
    current = toPlannerDraft(request);
    try {
      const storage = getStorage();
      if (storage) {
        const raw = JSON.stringify(current);
        const pref = JSON.stringify({ date: current.date, theme: current.theme, budget: current.budget });
        storage.setItem('currentFormData', raw);
        storage.setItem('userPreference', pref);
        lastStored = JSON.stringify([raw, pref]);
        acceptStored = true;
      }
      // Until sign-in restores, the owner is unknown; a signed-in copy must not be replaced by this one.
      const recovery = getRecoveryStorage();
      if (owner !== undefined || !parseObject(recovery?.getItem(recoveryKey))?.owner) recovery?.setItem(recoveryKey, JSON.stringify({ owner: owner || null, draft: current }));
    } catch { onStorageError(); }
    return structuredClone(current);
  };
  return {
    read,
    save,
    setUser(userId) {
      const next = userId || null;
      if (owner === next) return;
      const initial = owner === undefined;
      const previous = owner;
      owner = next;
      if (!initial && previous) { current = toPlannerDraft(); acceptStored = false; }
      try {
        const recovery = getRecoveryStorage();
        const saved = parseObject(recovery?.getItem(recoveryKey));
        if (initial && saved?.owner === next) { save(saved.draft); return; }
        // A guest's draft may be claimed at sign-in; personal drafts never cross accounts.
        if ((initial && saved?.owner && saved.owner !== next) || (!initial && previous)) {
          current = toPlannerDraft();
          acceptStored = false;
          recovery?.removeItem(recoveryKey);
          getStorage()?.removeItem('currentFormData');
          getStorage()?.removeItem('userPreference');
          lastStored = undefined;
          current = toPlannerDraft();
        }
        if (initial && saved && saved.owner == null && next) save(saved.draft);
        else if (!initial && previous == null && next) save(read());
      } catch { onStorageError(); }
    },
    update(changes) { return save({ ...read(), ...changes }); },
    clear() {
      current = toPlannerDraft();
      try { getStorage()?.removeItem('currentFormData'); getStorage()?.removeItem('userPreference'); getRecoveryStorage()?.removeItem(recoveryKey); }
      catch { onStorageError(); }
      lastStored = undefined;
      acceptStored = false;
    },
    updatePreferences(changes) {
      const draft = read();
      for (const field of ['date', 'theme', 'budget', 'companion']) {
        if (Object.hasOwn(changes, field)) draft[field] = changes[field];
      }
      return save(draft);
    },
    resetDetails() {
      const { date, theme, budget, companion } = read();
      return save({ date, theme, budget, companion, destination: read().destination, step: read().step, stays: [] });
    },
  };
}

export const plannerDraftStore = createPlannerDraftStore({ getStorage: () => window.sessionStorage, getRecoveryStorage: () => window.localStorage, onStorageError: () => window.dispatchEvent(new CustomEvent('planner-storage-error')) });
