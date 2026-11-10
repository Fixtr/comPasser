import { t } from '../../../utils/i18n.js';

export async function openIndoorAlternatives(host, { search, isCurrent, onSelect }) {
  const trigger = host.querySelector('.indoor-alternatives-btn');
  const panel = document.createElement('div');
  panel.className = 'place-replacement indoor-alternatives';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = t('indoorAlternativesLoading');
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = t('cancelBtn');
  const close = () => { panel.remove(); if (trigger?.isConnected) trigger.focus(); };
  cancel.addEventListener('click', close);
  panel.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close();
  });
  panel.append(status, cancel);
  host.append(panel);
  cancel.focus();
  const valid = () => panel.isConnected && isCurrent();
  try {
    const options = await search(valid);
    if (!valid()) { panel.remove(); return; }
    status.textContent = t(options.length ? 'indoorAlternativesChoose' : 'indoorAlternativesEmpty');
    for (const { place, hours, totalMinutes, difference } of options) {
      const row = document.createElement('div');
      const apply = document.createElement('button');
      apply.type = 'button';
      apply.textContent = t('indoorAlternativesApply').replace('{0}', place.displayName);
      const detail = document.createElement('p');
      const total = t('indoorAlternativesTransit').replace('{0}', totalMinutes);
      const delta = difference === null ? '' : t('indoorAlternativesDelta')
        .replace('{0}', new Intl.NumberFormat(document.documentElement.lang || undefined, { signDisplay: 'exceptZero' }).format(difference));
      detail.textContent = [place.formattedAddress, total, delta,
        t(hours === 'current' ? 'indoorAlternativesCurrentHours' : 'indoorAlternativesRegularHours')].filter(Boolean).join(' · ');
      apply.addEventListener('click', () => {
        if (valid()) onSelect(place);
        close();
      });
      row.append(apply, detail);
      panel.append(row);
    }
  } catch {
    if (valid()) status.textContent = t('indoorAlternativesFailed');
    else panel.remove();
  }
}
