const status = document.getElementById('route-status');
async function copy(text) {
  try { await navigator.clipboard.writeText(text); status.textContent = 'Copied.'; }
  catch { status.textContent = 'Copy is unavailable. Select the address or link above and copy it.'; }
}
document.querySelectorAll('.copy-address').forEach(button => {
  button.addEventListener('click', () => void copy(button.dataset.address));
});
document.getElementById('copy-link')?.addEventListener('click', () => void copy(document.querySelector('link[rel=canonical]').href));
document.getElementById('print-route')?.addEventListener('click', () => window.print());
document.getElementById('plan-route')?.addEventListener('click', event => {
  const startLocation = document.getElementById('start-location').value.trim();
  try {
    const stored = JSON.parse(sessionStorage.getItem('currentFormData') || '{}');
    const draft = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    // The app restores its saved copy when it starts, so that copy needs the same start.
    const saved = JSON.parse(localStorage.getItem('compasser.planner.v1') || 'null');
    // An empty field clears only a start left by another city's route.
    if (!startLocation && (draft.destination?.id || saved?.draft?.destination?.id) === event.currentTarget.dataset.city) return;
    sessionStorage.setItem('currentFormData', JSON.stringify({ ...draft, startLocation }));
    if (saved?.draft) localStorage.setItem('compasser.planner.v1', JSON.stringify({ ...saved, draft: { ...saved.draft, startLocation } }));
  } catch {
    if (!startLocation) return;
    event.preventDefault();
    status.textContent = 'Your browser could not keep the starting place. Clear it to continue and enter it on the planning screen.';
  }
});
