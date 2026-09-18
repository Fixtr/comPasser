import { getMapsLoader } from '../../map/services/google-maps-loader.js';
import { bindPlaceSelection, normalizeSelectedPlace } from '../../planner/services/selected-place.mjs';
import { t } from '../../../utils/i18n.js';

// Selection and fetchFields are shared with the planner. Text alone is never
// sufficient to commit a replacement. Detached/changed schedules reject it.
export async function openPlaceReplacement(host, { isCurrent, onSelect }) {
  if (host.querySelector('.place-replacement')) return;
  const panel = document.createElement('div');
  panel.className = 'place-replacement';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = t('replacePlaceLoading');
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = t('cancelBtn');
  cancel.addEventListener('click', () => panel.remove());
  panel.append(status, cancel);
  host.append(panel);
  let timer;
  try {
    await Promise.race([
      getMapsLoader().importLibrary('places'),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 12000); }),
    ]);
    if (!panel.isConnected || !isCurrent()) { panel.remove(); return; }
    const input = document.createElement('gmp-place-autocomplete');
    input.setAttribute('placeholder', t('replacePlaceSearch'));
    input.setAttribute('aria-label', t('replacePlaceSearch'));
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'replace-place-confirm';
    confirm.textContent = t('replacePlaceConfirm');
    confirm.disabled = true;
    bindPlaceSelection(input, () => {
      const place = normalizeSelectedPlace(input.selectedPlace);
      confirm.disabled = !place;
      status.textContent = place ? `${place.displayName} · ${place.formattedAddress}`
        : t(input.placeSelectionError ? 'replacePlaceFailed' : 'replacePlaceSelect');
    });
    confirm.addEventListener('click', () => {
      const place = normalizeSelectedPlace(input.selectedPlace);
      if (!place || input.value !== input.selectedPlaceText) {
        confirm.disabled = true;
        status.textContent = t('replacePlaceSelect');
        return;
      }
      if (!panel.isConnected || !isCurrent()) { panel.remove(); return; }
      confirm.disabled = true;
      onSelect(place);
      panel.remove();
    });
    status.textContent = t('replacePlaceSelect');
    panel.prepend(input);
    panel.insertBefore(confirm, cancel);
  } catch {
    if (panel.isConnected) status.textContent = t('replacePlaceFailed');
  } finally { clearTimeout(timer); }
}
