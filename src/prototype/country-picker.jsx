import React from 'react';
import { destinationCountries } from '../domains/planner/services/travel-destinations.mjs';
import { TRAVEL_REGIONS } from '../../functions/travel-region.mjs';
import { t } from '../utils/i18n.js';

const groups = [
  { key: 'flowAsia', countries: ['KOR', 'JPN', 'TWN', 'THA', 'VNM', 'SGP'] },
  { key: 'flowEurope', countries: ['FRA', 'ITA', 'ESP', 'GBR'] },
  { key: 'flowNorthAmerica', countries: ['USA'] },
];

export function CountryPicker({ onSelect, kind }) {
  return <div className="country-picker">{groups.map(group => <section key={group.key} aria-label={t(group.key)}>
    <h2>{t(group.key)}</h2>
    <div className="country-grid">{group.countries.filter(code => destinationCountries.includes(code)).map(code => {
      const flag = String.fromCodePoint(...[...TRAVEL_REGIONS[code].countryCode].map(letter => 127397 + letter.charCodeAt(0)));
      return <button key={code} className="country-card" {...{[`data-${kind}-country`]: code}} aria-label={t(`country${code}`)} onClick={() => onSelect(code)}>
        <span className="country-card-title"><span aria-hidden="true">{flag}</span><strong>{t(`country${code}`)}</strong></span>
      </button>;
    })}</div>
  </section>)}</div>;
}
