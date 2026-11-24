import { t } from '../../../utils/i18n.js';
import { escapeHtml } from '../../../utils/html-safety.mjs';
import { getCurrentUser } from '../../auth/services/firebase-auth.js';
import { readPrivateStopNote, readPrivateStopNotes, writePrivateStopNote } from '../services/firestore-service.js';
import { MAX_RESERVATION_URL_LENGTH, MAX_STOP_NOTE_LENGTH, normalizeStopNote, stopNoteKeys } from '../services/stop-notes.mjs';

// One read per opened trip (again after a save or a failure): read mode hides the note button, so a
// saved note has to be readable on its card without it.
function savedNotes(view, id, ownerId) {
  if (view._stopNotes?.id !== id) {
    const notes = readPrivateStopNotes(id, ownerId);
    view._stopNotes = { id, notes };
    const status = () => view.shadowRoot.querySelector('.stop-notes-status');
    // The same trip keeps its status while it is read again (each render after a failure reads):
    // removing and re-adding it would announce it every time.
    if (status()?.dataset.trip !== id) status()?.remove();
    // A note save empties the cache while this read is under way; the read still owns the status.
    const replaced = () => view._stopNotes && view._stopNotes.notes !== notes;
    notes.then(() => {
      if (replaced() || !status()) return;
      const hadFocus = view.shadowRoot.activeElement?.closest('.stop-notes-status');
      status().remove();
      // The retry button went with its status: keyboard focus moves to the notes it loaded.
      const timeline = view.shadowRoot.getElementById('timeline-container');
      if (hadFocus && timeline) { timeline.tabIndex = -1; timeline.focus(); }
    }, () => {
      if (replaced()) return;
      view._stopNotes = null;
      showNotesFailed(view, id, ownerId);
    });
  }
  return view._stopNotes.notes;
}

// Unchanged text is not written again: a live region would announce it again.
const say = (element, key) => {
  element.dataset.i18n = key;
  if (element.textContent !== t(key)) element.textContent = t(key);
};

// One status for the trip, not one per card: without it "no notes" and "notes did not load" look the same.
function showNotesFailed(view, id, ownerId) {
  const source = view.state.current?.source;
  const timeline = view.shadowRoot.getElementById('timeline-container');
  if (!timeline?.querySelector('.stop-note-btn') || source?.kind !== 'private' || source.id !== id || source.ownerId !== ownerId || getCurrentUser()?.uid !== ownerId) return;
  let status = view.shadowRoot.querySelector('.stop-notes-status');
  if (!status) {
    status = document.createElement('p');
    status.className = 'stop-notes-status';
    status.setAttribute('role', 'alert');
    status.dataset.trip = id;
    const retry = document.createElement('button');
    retry.type = 'button';
    say(retry, 'shellRetry');
    retry.addEventListener('click', () => {
      if (view._stopNotes) return;
      say(status.firstChild, 'stopNoteLoading');
      savedNotes(view, id, ownerId).catch(() => {});
      view.shadowRoot.querySelectorAll('.stop-note-text').forEach(text => text.dispatchEvent(new Event('stop-notes-retry')));
    });
    status.append(document.createElement('span'), retry);
    timeline.before(status);
  }
  say(status.firstChild, 'stopNotesLoadFailed');
}

export function attachStopNoteControl(view, card, index, key) {
  const { id, ownerId } = view.state.current.source;
  const request = view._mapRequest;
  const dayIndex = view.activeDayIndex;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'stop-note-btn';
  button.textContent = t('stopNoteBtn');
  button.setAttribute('aria-expanded', 'false');
  // The card is itinerary content; this says the text under it is the traveler's own note.
  const savedLabel = document.createElement('p');
  savedLabel.className = 'stop-note-label';
  savedLabel.id = `stop-note-label-${index}`;
  savedLabel.textContent = t('stopNoteBtn');
  const saved = document.createElement('p');
  saved.className = 'stop-note-text';
  saved.setAttribute('role', 'note');
  saved.setAttribute('aria-labelledby', savedLabel.id);
  const savedLink = document.createElement('a');
  savedLink.className = 'stop-note-link';
  savedLink.target = '_blank';
  savedLink.rel = 'noopener noreferrer';
  savedLink.textContent = t('stopNoteOpenUrl');
  savedLink.setAttribute('aria-describedby', savedLabel.id);
  const showSaved = note => {
    savedLabel.hidden = !note?.text && !note?.url;
    saved.textContent = note?.text || '';
    saved.hidden = !note?.text;
    savedLink.hidden = !note?.url;
    if (note?.url) savedLink.href = note.url;
  };
  showSaved(null);
  card.append(savedLabel);
  card.append(saved, savedLink, button);

  const sameTrip = () => {
    const source = view.state.current?.source;
    return button.isConnected && source?.kind === 'private' && source.id === id && source.ownerId === ownerId
      && getCurrentUser()?.uid === ownerId;
  };
  const isCurrent = () => sameTrip() && view.activeDayIndex === dayIndex && view._mapRequest === request
    && stopNoteKeys(view.normalizeData(view.currentItinerary)?.days[dayIndex])[index] === key;
  // Offline or a failed read shows no note text and one status for the trip (showNotesFailed).
  // A read that started before a save here must not put the older text back.
  let savedHere = false;
  const load = () => savedNotes(view, id, ownerId).then(notes => {
    if (!savedHere && sameTrip()) showSaved(normalizeStopNote(notes[key]?.text, notes[key]?.url));
  }, () => {});
  load();
  saved.addEventListener('stop-notes-retry', load);
  button.addEventListener('click', async () => {
    if (!isCurrent() || card.querySelector('.stop-note-editor')) return;
    const form = document.createElement('form');
    form.className = 'stop-note-editor';
    const label = key => escapeHtml(t(key));
    form.innerHTML = `
      <p>${label('stopNotePrivate')}</p>
      <label>${label('stopNoteText')}<textarea maxlength="${MAX_STOP_NOTE_LENGTH}" rows="3" disabled></textarea></label>
      <label>${label('stopNoteUrl')}<input type="url" maxlength="${MAX_RESERVATION_URL_LENGTH}" disabled></label>
      <a target="_blank" rel="noopener noreferrer" hidden>${label('stopNoteOpenUrl')}</a>
      <p role="status">${label('stopNoteLoading')}</p>
      <button type="submit" disabled>${label('saveBtn')}</button>
      <button type="button">${label('cancelBtn')}</button>`;
    const textarea = form.querySelector('textarea');
    const url = form.querySelector('input');
    const link = form.querySelector('a');
    const status = form.querySelector('[role="status"]');
    const save = form.querySelector('[type="submit"]');
    const cancel = form.querySelector('[type="button"]');
    const close = () => {
      form.remove();
      // A stale editor closing late (its read ended after a reopen) must not unmark the card under the new editor.
      if (!card.querySelector('.stop-note-editor')) card.removeAttribute('data-note-open');
      button.setAttribute('aria-expanded', 'false');
      if (isCurrent()) button.focus();
    };
    const currentEditor = () => form.isConnected && isCurrent();
    const disableFields = disabled => {
      textarea.disabled = disabled;
      url.disabled = disabled;
      save.disabled = disabled;
    };
    cancel.addEventListener('click', close);
    form.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.stopPropagation(); close(); }
    });
    card.append(form);
    // The card hides its saved note while marked; a mark (not :has()) so iOS 15.0-15.3 and old WebViews hide it too.
    card.toggleAttribute('data-note-open', true);
    button.setAttribute('aria-expanded', 'true');
    cancel.focus();
    try {
      const note = await readPrivateStopNote(id, ownerId, key);
      if (!currentEditor()) { close(); return; }
      textarea.value = note.text;
      url.value = note.url;
      if (note.url) { link.href = note.url; link.hidden = false; }
      status.textContent = '';
      disableFields(false);
      if (view.shadowRoot.activeElement === cancel) textarea.focus();
    } catch (error) {
      if (!currentEditor()) { close(); return; }
      status.textContent = t(error.code === 'saved-stop-required' ? 'stopNoteUnsavedStop' : 'stopNoteLoadFailed');
      return;
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!currentEditor()) { close(); return; }
      if (save.disabled) return;
      const note = normalizeStopNote(textarea.value, url.value);
      if (!note) { status.textContent = t('stopNoteInvalid'); return; }
      disableFields(true);
      cancel.disabled = true;
      status.textContent = t('stopNoteSaving');
      try {
        await writePrivateStopNote(id, ownerId, key, note);
        savedHere = true;
        view._stopNotes = null;
        if (sameTrip()) showSaved(note);
        if (currentEditor()) view.showToast(t('stopNoteSaved'));
        close();
      } catch (error) {
        if (!currentEditor()) { close(); return; }
        status.textContent = t(error.code === 'saved-stop-required' ? 'stopNoteUnsavedStop' : 'stopNoteSaveFailed');
        disableFields(false);
        cancel.disabled = false;
        save.focus();
      }
    });
  });
}
