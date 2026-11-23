import { t } from '../../../utils/i18n.js';
import { animateScreen } from '../../../ui/screen-motion.js';
import { getAutocompleteValue } from './travel-form-data.js';
import { bindPlaceSelection, restorePlaceInput } from '../services/selected-place.mjs';
import { plannerDraftStore } from '../services/planner-draft.mjs';
import { cities } from '../services/discovery-catalogue.mjs';
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

export function bindDiscovery(view) {
  const discoveryDialog = view.shadowRoot.getElementById('discovery-dialog');
  const citySelect = view.shadowRoot.getElementById('discovery-city');
  const suggestions = view.shadowRoot.getElementById('destination-suggestions');
  const placeContainer = view.shadowRoot.getElementById('discovery-places');
  const routeControls = view.shadowRoot.getElementById('route-discovery-controls');
  const routeStatus = view.shadowRoot.getElementById('route-discovery-status');
  const routeButton = view.shadowRoot.getElementById('find-route-stops');
  const cityGroup = view.shadowRoot.getElementById('discovery-city-group');
  let routeVersion = 0;
  let routeSuggestions = [];
  const clearRouteResults = () => {
    routeVersion++;
    routeSuggestions = [];
    routeStatus.textContent = '';
    routeButton.disabled = false;
    placeContainer.replaceChildren();
  };
  discoveryDialog.addEventListener('close', clearRouteResults);
  view.shadowRoot.getElementById('discovery-day').addEventListener('change', () => {
    if (!routeControls.hidden) clearRouteResults();
  });
  routeButton.addEventListener('click', async () => {
    clearRouteResults();
    const version = routeVersion;
    const request = view.getFormData();
    const signature = JSON.stringify(request);
    const day = Number(view.shadowRoot.getElementById('discovery-day').value);
    routeButton.disabled = true;
    routeStatus.textContent = t('routeDiscoveryLoading');
    try {
      const {findRouteStops} = await import('../services/route-discovery.js');
      const result = await findRouteStops(request, day);
      if (!discoveryDialog.open || !view.isConnected || version !== routeVersion) return;
      if (signature !== JSON.stringify(view.getFormData())) {
        clearRouteResults();
        routeStatus.textContent = t('routeDiscoveryChanged');
        return;
      }
      routeStatus.textContent = t({ready:'routeDiscoveryReady', empty:'routeDiscoveryEmpty',
        'missing-input':'routeDiscoveryMissing', unavailable:'routeDiscoveryUnavailable'}[result.status]);
      routeSuggestions = result.suggestions;
      routeSuggestions.forEach((suggestion, index) => {
        const article = document.createElement('article');
        article.className = 'form-group';
        const title = document.createElement('h3');
        title.textContent = suggestion.visit.name;
        const details = document.createElement('p');
        details.textContent = `${suggestion.from} → ${suggestion.to} · ${t('routeDiscoveryDetour').replace('{0}', suggestion.detourMinutes)} · ${suggestion.time}–${suggestion.endTime}`;
        const address = document.createElement('p');
        address.textContent = suggestion.visit.location.formattedAddress;
        const hours = document.createElement('p');
        hours.textContent = t(suggestion.hours === 'unknown' ? 'routeDiscoveryHoursUnknown' : 'routeDiscoveryHours');
        const link = document.createElement('a');
        const url = new URL('https://www.google.com/maps/search/');
        url.search = new URLSearchParams({api:'1', query:suggestion.visit.name, query_place_id:suggestion.visit.location.placeId});
        link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.textContent = t('routeDiscoveryPlaceDetails');
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'secondary-btn';
        button.dataset.routePick = index; button.textContent = t('routeDiscoveryAdd');
        button.addEventListener('click', () => {
          if (version !== routeVersion || signature !== JSON.stringify(view.getFormData())) {
            clearRouteResults(); routeStatus.textContent = t('routeDiscoveryChanged'); return;
          }
          const visit = routeSuggestions[index].visit;
          const anchors = [...request.anchorSchedules];
          if (!anchors.some(anchor => anchor.location?.placeId === visit.location.placeId)) anchors.push(visit);
          view.populateForm({...request, anchorSchedules:anchors});
          discoveryDialog.close();
        });
        article.append(title, details, address, hours, link, button);
        placeContainer.append(article);
      });
    } catch {
      if (version === routeVersion && discoveryDialog.open) routeStatus.textContent = t('routeDiscoveryUnavailable');
    } finally { if (version === routeVersion) routeButton.disabled = false; }
  });
  view.shadowRoot.getElementById('close-discovery').addEventListener('click', () => discoveryDialog.close());
  view.shadowRoot.getElementById('where-to-go').addEventListener('click', async () => {
    view.saveDraft();
    const button = view.shadowRoot.getElementById('where-to-go');
    button.disabled = true;
    try {
      await import('./home-recommendations.js');
      citySelect.replaceChildren(new Option(t('chooseCity'), ''), ...cities.map(city => new Option(t(city.key), city.id)));
      const days = view.shadowRoot.getElementById('discovery-day');
      days.replaceChildren(...view.draft.date.map((date, index) => new Option(`${t('day_n').replace('{0}', index + 1)} · ${date}`, String(index + 1))));
      clearRouteResults();
      routeControls.hidden = true;
      cityGroup.hidden = false;
      suggestions.replaceChildren();
      view.shadowRoot.getElementById('discovery-options').hidden = true;
      discoveryDialog.querySelectorAll('[data-discovery-mode]').forEach(button => button.setAttribute('aria-pressed', 'false'));
      if (view.isConnected) { discoveryDialog.showModal(); animateScreen(discoveryDialog, true); }
    } catch {
      showErrorToast(t('discoveryLoadError'));
    } finally { button.disabled = false; }
  });
  discoveryDialog.addEventListener('click', event => {
    const mode = event.target.closest('[data-discovery-mode]');
    const cityButton = event.target.closest('[data-destination-city]');
    if (cityButton) {
      citySelect.value = cityButton.dataset.destinationCity;
      citySelect.dispatchEvent(new Event('change'));
    }
    if (!mode) return;
    clearRouteResults();
    routeControls.hidden = mode.dataset.discoveryMode !== 'stops';
    cityGroup.hidden = mode.dataset.discoveryMode === 'stops';
    discoveryDialog.querySelectorAll('[data-discovery-mode]').forEach(button => button.setAttribute('aria-pressed', String(button === mode)));
    view.shadowRoot.getElementById('discovery-options').hidden = false;
    placeContainer.replaceChildren();
    suggestions.replaceChildren();
    citySelect.value = '';
    if (mode.dataset.discoveryMode === 'destination') {
      cities.forEach(city => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'secondary-btn';
        button.dataset.destinationCity = city.id;
        button.textContent = `${t(city.key)} · ${t(city.pairReason)}`;
        suggestions.append(button);
      });
    }
  });
  citySelect.addEventListener('change', () => {
    const index = cities.findIndex(city => city.id === citySelect.value);
    placeContainer.replaceChildren();
    if (index < 0) return;
    const recommendations = document.createElement('home-recommendations');
    recommendations.setAttribute('planner-pick', '');
    placeContainer.append(recommendations);
    recommendations.showCity(index);
    // Keep the destination selector authoritative within the planner dialog.
    recommendations.shadowRoot.querySelector('.cities').style.display = 'none';
    suggestions.replaceChildren();
    recommendations.addEventListener('places-picked', event => {
      const day = Number(view.shadowRoot.getElementById('discovery-day').value);
      const draft = plannerDraftStore.read();
      const anchors = [...draft.anchorSchedules];
      event.detail.forEach(visit => {
        if (!anchors.some(anchor => anchor.name === visit.name && getLocationName(anchor.location) === visit.location)) anchors.push({ ...visit, day });
      });
      view.populateForm({ ...draft, anchorSchedules: anchors });
      discoveryDialog.close();
    });
  });
}

export function bindVisitButtons(view) {
  view.shadowRoot.getElementById('remove-waypoint').addEventListener('click', () => {
    view.draft.selectedWaypoints = [];
    view.shadowRoot.getElementById('selected-waypoint').hidden = true;
    view.saveDraft();
  });
  view.shadowRoot.getElementById('add-anchor-btn').addEventListener('click', () => {
    view.addAnchor();
    view.saveDraft();
  });

  const preferenceBtn = view.shadowRoot.getElementById('reselect-preference-btn');
  view.shadowRoot.getElementById('reselect-date-btn').onclick = () => {
    view.saveDraft();
    window.navigate('/preference/1', { state: { returnTo: '/plan' } });
  };
  if (preferenceBtn) {
    preferenceBtn.addEventListener('click', () => {
      view.saveDraft();
      window.navigate('/preference/2', { state: { returnTo: '/plan' } });
    });
  }

  view.shadowRoot.getElementById('change-trip-destination').onclick = () => { view.saveDraft(); window.navigate('/destination', { state: { returnTo: '/plan' } }); };
  view.shadowRoot.getElementById('add-trip-stay').onclick = () => view.addTripStay();
}
