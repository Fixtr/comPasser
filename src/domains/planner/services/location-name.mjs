// Its own module so the planner draft store, on the first load, does not pull in all of planner-constraints.
const asNonEmptyString = value => (typeof value === 'string' ? value.trim() : '');

/**
 * Returns the user-facing name for either a plain autocomplete string or a
 * structured Google Place value.
 */
export function getLocationName(location) {
  if (typeof location === 'string') return location.trim();
  if (!location || typeof location !== 'object') return '';

  return asNonEmptyString(location.displayName)
    || asNonEmptyString(location.formattedAddress)
    || asNonEmptyString(location.address);
}
