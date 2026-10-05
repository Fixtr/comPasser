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
  if (!startLocation) return;
  try {
    const stored = JSON.parse(sessionStorage.getItem('currentFormData') || '{}');
    const draft = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    sessionStorage.setItem('currentFormData', JSON.stringify({ ...draft, startLocation }));
  } catch {
    event.preventDefault();
    status.textContent = 'Your browser could not keep the starting place. Clear it to continue and enter it on the planning screen.';
  }
});
