const KEY = 'cp.blockedAuthors';
let memory = null;

// Blocking only hides an author's courses and reviews on this device; it is the reader's own filter, not moderation.
// shortcut: no unblock screen, clearing site data resets it; add one if readers ask.
export function blockedAuthors() {
  if (!memory) {
    try { memory = new Set(JSON.parse(localStorage.getItem(KEY)) || []); } catch { memory = new Set(); }
  }
  return memory;
}

export function blockAuthor(uid) {
  if (!uid) return;
  blockedAuthors().add(uid);
  try { localStorage.setItem(KEY, JSON.stringify([...memory])); } catch { /* still hidden for this session */ }
  globalThis.dispatchEvent?.(new Event('blocked-authors-changed'));
}
