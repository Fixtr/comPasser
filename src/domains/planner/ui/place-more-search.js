import { GeocodingService } from '../../map/services/geocoding-service.js';
import { getMapsLoader } from '../../map/services/google-maps-loader.js';
import { travelRegion } from '../../../../functions/travel-region.mjs';
import { destinationPlaceError } from '../services/destination-place.js';
import { getLang, t, tFor } from '../../../utils/i18n.js';

/** The trip city in English (text search reads it in any language) and its country code. */
export function placeSearchArea(destination) {
  if (!destination) return { area: '', country: 'KR' };
  return { area: destination.key ? tFor(destination.key, 'en') : destination.name || '', country: travelRegion({ destination }).countryCode };
}

const styles = `
  :host { display: block; }
  p { margin: 4px 0; color: var(--cp-muted); font-size: 0.9rem; }
  p:empty { margin: 0; } /* not display:none: a hidden live region drops its next message */
  button { font: inherit; color: var(--cp-ink); cursor: pointer; text-align: left; }
  button:focus-visible { outline: 2px solid var(--cp-ink); outline-offset: 2px; }
  .more { min-height: 44px; padding: 0; border: 0; background: none; text-decoration: underline; text-underline-offset: 3px; }
  ul { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
  li button { display: grid; gap: 2px; width: 100%; min-height: 44px; padding: 8px 12px; border: var(--cp-hair, 1px) solid var(--cp-rule); border-radius: var(--cp-radius); background: var(--cp-surface); }
  small { color: var(--cp-muted); }
  /* Carries the host page's scroll margin (the destination screen's sticky bar) down to these buttons. */
  ul, li, button { scroll-margin-bottom: inherit; }
`;

// Sits right after a <gmp-place-autocomplete>. A picked result goes through that input's own gmp-select path.
class PlaceMoreSearch extends HTMLElement {
  connectedCallback() {
    this.target = this.previousElementSibling;
    this.target?.addEventListener('input', this.clear);
    globalThis.addEventListener('i18n-changed', this.relabel);
    if (this.shadowRoot) return this.relabel();
    this.attachShadow({ mode: 'open' }).innerHTML = `<style>${styles}</style><button type="button" class="more"></button><p role="status"></p><ul></ul>`;
    [this.more, this.status, this.list] = ['.more', 'p', 'ul'].map(selector => this.shadowRoot.querySelector(selector));
    this.more.addEventListener('click', () => this.search());
    this.relabel();
  }

  disconnectedCallback() {
    this.target?.removeEventListener('input', this.clear);
    globalThis.removeEventListener('i18n-changed', this.relabel);
  }

  relabel = () => { this.more.textContent = t('placeMoreSearch'); this.clear(); };

  clear = (message = '') => {
    this.version = (this.version || 0) + 1;
    this.list.replaceChildren();
    this.status.textContent = typeof message === 'string' ? message : '';
  };

  async search() {
    const query = String(this.target?.value || '').trim();
    this.clear(t(query ? 'placeMoreSearching' : 'flowPlaceEmpty'));
    if (!query) return;
    const version = this.version;
    try {
      const service = new GeocodingService(getMapsLoader(), { getLanguage: getLang, countryCode: this.getAttribute('country') || 'KR' });
      const places = await service.searchPlaces(query, this.getAttribute('area') || '');
      if (version !== this.version) return;
      this.status.textContent = t(places.length ? 'placeMorePick' : 'placeMoreNone');
      this.list.replaceChildren(...places.map(place => {
        const item = document.createElement('li');
        const button = item.appendChild(document.createElement('button'));
        button.type = 'button';
        button.append(Object.assign(document.createElement('strong'), { textContent: place.displayName }), Object.assign(document.createElement('small'), { textContent: place.formattedAddress }));
        button.addEventListener('click', () => this.choose(place));
        return item;
      }));
    } catch (error) {
      if (version === this.version) this.status.textContent = destinationPlaceError(error);
    }
  }

  choose(place) {
    this.target?.dispatchEvent(Object.assign(new Event('gmp-select'), { place }));
    this.clear(t('placeMoreChosen').replace('{0}', place.displayName));
    this.more.focus(); // the clicked row is gone
  }
}

if (!customElements.get('place-more-search')) customElements.define('place-more-search', PlaceMoreSearch);
