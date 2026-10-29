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
// Many hosts' tools (Word, Canva, Instagram) take PNG, not SVG, so draw the same-origin SVG onto a canvas.
document.getElementById('download-qr')?.addEventListener('click', event => {
  const { qr, name } = event.currentTarget.dataset;
  const image = new Image();
  image.onload = () => { try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 760;
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff'; context.fillRect(0, 0, 760, 760);
    context.drawImage(image, 0, 0, 760, 760);
    canvas.toBlob(blob => {
      if (!blob) { status.textContent = 'The PNG could not be made. Use the SVG download instead.'; return; }
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob); link.download = `${name}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }, 'image/png');
  } catch { status.textContent = 'The PNG could not be made. Use the SVG download instead.'; } };
  image.onerror = () => { status.textContent = 'The QR code could not be loaded. Check your connection and try again.'; };
  image.src = qr;
});
document.getElementById('plan-route')?.addEventListener('click', event => {
  const startLocation = document.getElementById('start-location').value.trim();
  try {
    const stored = JSON.parse(sessionStorage.getItem('currentFormData') || '{}');
    const draft = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    // The app restores its saved copy when it starts, so that copy needs the same start.
    const saved = JSON.parse(localStorage.getItem('compasser.planner.v1') || 'null');
    // An empty field clears only a start left by another city's route, judged on the copy the app builds on.
    if (!startLocation && (saved?.draft || draft).destination?.id === event.currentTarget.dataset.city) return;
    sessionStorage.setItem('currentFormData', JSON.stringify({ ...draft, startLocation }));
    if (saved?.draft) localStorage.setItem('compasser.planner.v1', JSON.stringify({ ...saved, draft: { ...saved.draft, startLocation } }));
  } catch {
    if (!startLocation) return;
    event.preventDefault();
    status.textContent = 'Your browser could not keep the starting place. Clear it to continue and enter it on the planning screen.';
  }
});
