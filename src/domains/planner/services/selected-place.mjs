// JSON-only snapshot. Never put Google Place/LatLng instances into persistence.
export function normalizeSelectedPlace(value) {
  if (!value || typeof value !== 'object') return null;
  const placeId = value.placeId ?? value.id;
  const displayName = value.displayName;
  const formattedAddress = value.formattedAddress;
  const lat = value.lat ?? (typeof value.location?.lat === 'function' ? value.location.lat() : value.location?.lat);
  const lng = value.lng ?? (typeof value.location?.lng === 'function' ? value.location.lng() : value.location?.lng);
  if (typeof placeId !== 'string' || !placeId.trim() || placeId.length > 512 ||
      typeof displayName !== 'string' || !displayName.trim() ||
      typeof formattedAddress !== 'string' || !formattedAddress.trim() ||
      !Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180) return null;
  return { placeId: placeId.trim(), displayName: displayName.trim(), formattedAddress: formattedAddress.trim(), lat, lng };
}

export function placeInputText(value) {
  if (typeof value === 'string') return value;
  return value?.displayName || value?.formattedAddress || value?.address || '';
}

export function restorePlaceInput(element, value) {
  if (!element) return;
  element.placeSelectionVersion = (element.placeSelectionVersion || 0) + 1;
  element.placeSelectionError = false;
  element.selectedPlace = normalizeSelectedPlace(value);
  element.value = placeInputText(value);
  element.selectedPlaceText = element.value;
}

export function readPlaceInput(element, text) {
  const place = normalizeSelectedPlace(element?.selectedPlace);
  return place && text === element.selectedPlaceText ? place : text;
}

export function bindPlaceSelection(element, notify) {
  if (!element || element.dataset.listenerBound) return;
  element.dataset.listenerBound = 'true';
  element.addEventListener('input', () => {
    element.placeSelectionVersion = (element.placeSelectionVersion || 0) + 1;
    element.selectedPlace = null;
    element.placeSelectionError = false;
    notify();
  });
  const select = event => {
    const version = element.placeSelectionVersion = (element.placeSelectionVersion || 0) + 1;
    element.selectedPlace = null;
    element.placeSelectionError = false;
    const pending = (async () => {
      try {
        const place = event.placePrediction?.toPlace() ?? event.place;
        if (!place) throw new Error('Missing selected place');
        if (typeof place.fetchFields === 'function') {
          let timer;
          try {
            await Promise.race([
              place.fetchFields({ fields: ['id', 'displayName', 'formattedAddress', 'location'] }),
              new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Place lookup timeout')), 12000); })
            ]);
          } finally { clearTimeout(timer); }
        }
        const selected = normalizeSelectedPlace(place);
        if (version !== element.placeSelectionVersion || element.isConnected === false) return;
        if (!selected) throw new Error('Invalid selected place');
        element.selectedPlace = selected;
        element.value = selected.displayName;
        element.selectedPlaceText = selected.displayName;
      } catch {
        // Keep editable text on lookup failure; never reuse the previous ID.
        if (version === element.placeSelectionVersion) element.placeSelectionError = true;
      } finally {
        if (version === element.placeSelectionVersion && element.isConnected !== false) notify();
      }
    })();
    element.placeSelectionPending = pending;
  };
  element.addEventListener('gmp-select', select);
  element.addEventListener('gmp-placeselect', select); // older widget compatibility
}
