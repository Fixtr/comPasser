import { getLocationName } from './planner-constraints.mjs';
import { normalizeSelectedPlace } from './selected-place.mjs';
const preserveLocation = value => normalizeSelectedPlace(value) || getLocationName(value);

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
    theme: input.theme ?? null,
    budget: input.budget ?? null,
    startTime: input.startTime ?? first.startTime ?? '',
    endTime: input.endTime ?? first.endTime ?? '',
    startLocation: preserveLocation(input.startLocation ?? first.startLocation),
    endLocation: preserveLocation(input.endLocation ?? daily.at(-1)?.endLocation),
    sameOvernightLocation,
    overnightLocations: Array.from({ length: nights }, (_, index) =>
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
export function createPlannerDraftStore({ getStorage = () => null } = {}) {
  let current = toPlannerDraft();
  let lastStored;
  const read = () => {
    try {
      const storage = getStorage();
      if (storage) {
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
      }
    } catch { /* Editing continues; the recovery copy may not be available. */ }
    return structuredClone(current);
  };
  return {
    read,
    save,
    updatePreferences(changes) {
      const draft = read();
      for (const field of ['date', 'theme', 'budget']) {
        if (Object.hasOwn(changes, field)) draft[field] = changes[field];
      }
      return save(draft);
    },
    resetDetails() {
      const { date, theme, budget } = read();
      return save({ date, theme, budget });
    },
  };
}

export const plannerDraftStore = createPlannerDraftStore({ getStorage: () => window.sessionStorage });
