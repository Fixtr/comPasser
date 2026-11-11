import { t } from '../../../utils/i18n.js';
import { escapeHtml } from '../../../utils/html-safety.mjs';
import { getCurrentUser } from '../../auth/services/firebase-auth.js';
import { readPrivateStopNote, writePrivateStopNote } from '../services/firestore-service.js';
import { MAX_RESERVATION_URL_LENGTH, MAX_STOP_NOTE_LENGTH, normalizeStopNote, stopNoteKeys } from '../services/stop-notes.mjs';

export function attachStopNoteControl(view, card, index, key) {
  const { id, ownerId } = view.state.current.source;
  const request = view._mapRequest;
  const dayIndex = view.activeDayIndex;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'stop-note-btn';
  button.textContent = t('stopNoteBtn');
  button.setAttribute('aria-expanded', 'false');
  card.append(button);

  const isCurrent = () => {
    const source = view.state.current?.source;
    return button.isConnected && source?.kind === 'private' && source.id === id && source.ownerId === ownerId
      && getCurrentUser()?.uid === ownerId && view.activeDayIndex === dayIndex && view._mapRequest === request
      && stopNoteKeys(view.normalizeData(view.currentItinerary)?.days[dayIndex])[index] === key;
  };
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
