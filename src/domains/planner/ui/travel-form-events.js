import { t } from '../../../utils/i18n.js';
import { animateScreen } from '../../../ui/screen-motion.js';
import { getAutocompleteValue } from './travel-form-data.js';
import { bindPlaceSelection, restorePlaceInput } from '../services/selected-place.mjs';
import { showErrorToast } from '../../../utils/toast.js';
import { todayString } from '../services/trip-date.mjs';
import { getLocationName } from '../services/planner-constraints.mjs';

export function bindStaySearch(view) {
  const stayDialog = view.shadowRoot.getElementById('stay-dialog');
  const stayRegion = view.shadowRoot.getElementById('stay-region');
  const stayChosen = view.shadowRoot.getElementById('stay-chosen');
  const bookingLink = view.shadowRoot.getElementById('stay-booking-link');
  let stayIndex = 0;
  let checkin = '';
  let checkout = '';
  bindPlaceSelection(stayChosen, () => {});
  view.shadowRoot.getElementById('close-stay').addEventListener('click', () => stayDialog.close());
  view.shadowRoot.getElementById('overnight-locations').addEventListener('click', event => {
    const button = event.target.closest('[data-find-stay]');
    if (!button) return;
    view.saveDraft();
    stayIndex = Number(button.dataset.findStay);
    checkin = view.draft.date[stayIndex];
    checkout = view.draft.date[view.draft.sameOvernightLocation ? view.draft.date.length - 1 : stayIndex + 1];
    const selected = view.draft.overnightLocations[stayIndex];
    stayRegion.value = selected?.formattedAddress || getLocationName(selected);
    restorePlaceInput(stayChosen, selected);
    bookingLink.hidden = true;
    bookingLink.removeAttribute('href');
    view.shadowRoot.getElementById('stay-dates').textContent = `${t('stayDates')} · ${checkin} → ${checkout}`;
    view.shadowRoot.getElementById('stay-tonight').hidden = checkin !== todayString();
    stayDialog.showModal();
    animateScreen(stayDialog, true);
  });
  view.shadowRoot.getElementById('stay-search-form').addEventListener('submit', event => {
    event.preventDefault();
    const region = stayRegion.value.trim();
    if (!region) { stayRegion.focus(); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(checkin) || !/^\d{4}-\d{2}-\d{2}$/.test(checkout) || checkout <= checkin || checkin < todayString()) {
      showErrorToast(t('stayInvalidDates'));
      return;
    }
    const url = new URL('https://www.booking.com/searchresults.html');
    url.search = new URLSearchParams({ ss: region, checkin, checkout,
      group_adults: view.shadowRoot.getElementById('stay-guests').value, no_rooms: '1', group_children: '0' });
    bookingLink.href = url.href;
    bookingLink.hidden = false;
  });
  view.shadowRoot.getElementById('stay-search-form').addEventListener('input', () => {
    bookingLink.hidden = true;
    bookingLink.removeAttribute('href');
  });
  view.shadowRoot.getElementById('apply-stay').addEventListener('click', async () => {
    const version = stayChosen.placeSelectionVersion;
    const night = stayIndex;
    await stayChosen.placeSelectionPending;
    if (!stayDialog.open || !view.isConnected || version !== stayChosen.placeSelectionVersion || night !== stayIndex) return;
    const location = getAutocompleteValue(stayChosen);
    if (!getLocationName(location) || stayChosen.placeSelectionError) {
      showErrorToast(t('stayInputRequired'));
      stayChosen.focus();
      return;
    }
    const stays = Array.from(view.shadowRoot.querySelectorAll('.overnight-location'));
    const targets = view.draft.sameOvernightLocation ? stays : [stays[stayIndex]];
    targets.forEach(input => restorePlaceInput(input, location));
    view.saveDraft();
    stayDialog.close();
  });
}
