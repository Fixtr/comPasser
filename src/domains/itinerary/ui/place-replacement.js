import { getMapsLoader } from '../../map/services/google-maps-loader.js';
import { bindPlaceSelection, normalizeSelectedPlace } from '../../planner/services/selected-place.mjs';
import { t } from '../../../utils/i18n.js';

// Selection and fetchFields are shared with the planner. Text alone is never
// sufficient to commit a replacement. Detached/changed schedules reject it.
// Inserting a new stop uses the same panel with its own labels, an extra
// control (the stay length) and an onCancel to restore its slot.
export async function openPlaceReplacement(host, { isCurrent, onSelect, labels = {}, extra, onCancel }) {
  if (host.querySelector('.place-replacement')) return;
  const panel = document.createElement('div');
  panel.className = 'place-replacement';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = t('replacePlaceLoading');
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = t('cancelBtn');
  cancel.addEventListener('click', () => { panel.remove(); onCancel?.(); });
  if (extra) panel.append(extra);
  panel.append(status, cancel);
  // Escape works like Cancel and stays inside the panel instead of reaching page navigation.
  panel.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault(); event.stopPropagation();
    cancel.click();
  });
  host.append(panel);
  let timer;
  try {
    await Promise.race([
      getMapsLoader().importLibrary('places'),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 12000); }),
    ]);
    if (!panel.isConnected || !isCurrent()) { panel.remove(); return; }
    const input = document.createElement('gmp-place-autocomplete');
    input.setAttribute('placeholder', t(labels.search || 'replacePlaceSearch'));
    input.setAttribute('aria-label', t(labels.search || 'replacePlaceSearch'));
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'replace-place-confirm';
    confirm.textContent = t(labels.confirm || 'replacePlaceConfirm');
    confirm.disabled = true;
    bindPlaceSelection(input, () => {
      const place = normalizeSelectedPlace(input.selectedPlace);
      confirm.disabled = !place;
      status.textContent = place ? `${place.displayName} · ${place.formattedAddress}`
        : t(input.placeSelectionError ? 'replacePlaceFailed' : labels.select || 'replacePlaceSelect');
    });
    confirm.addEventListener('click', () => {
      const place = normalizeSelectedPlace(input.selectedPlace);
      if (!place || input.value !== input.selectedPlaceText) {
        confirm.disabled = true;
        status.textContent = t(labels.select || 'replacePlaceSelect');
        return;
      }
      if (!panel.isConnected || !isCurrent()) { panel.remove(); return; }
      confirm.disabled = true;
      onSelect(place);
      panel.remove();
    });
    status.textContent = t(labels.select || 'replacePlaceSelect');
    panel.prepend(input);
    panel.insertBefore(confirm, cancel);
  } catch {
    if (panel.isConnected) status.textContent = t('replacePlaceFailed');
  } finally { clearTimeout(timer); }
}
