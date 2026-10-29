// Runs before the page paints (a blocking <head> script; CSP allows only same-origin scripts), so a
// visitor who chose a theme in the app sees no flash of the other one. The CSS follows the system otherwise.
try {
  const theme = localStorage.getItem('theme');
  if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;
} catch { /* Storage can be blocked; the system setting still applies. */ }
