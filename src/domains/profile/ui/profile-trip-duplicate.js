import { getCurrentUser } from '../../auth/services/firebase-auth.js';
import { saveItinerary } from '../../itinerary/services/firestore-service.js';
import { shiftItineraryDates, itineraryStartDate, copyTitle } from '../../itinerary/services/itinerary-duplicate.mjs';
import { todayString } from '../../planner/services/trip-date.mjs';
import { showToast, showErrorToast } from '../../../utils/toast.js';
import { t } from '../../../utils/i18n.js';

export function openDuplicate(view, item, trigger) {
    const input = view.shadowRoot.getElementById('duplicate-date');
    view._duplicate = { item, trigger, uid: getCurrentUser()?.uid };
    input.value = itineraryStartDate(item.itineraryPlan);
    input.min = todayString();
    input.setCustomValidity('');
    view.shadowRoot.getElementById('duplicate-modal').classList.add('show');
    input.focus();
}

export function closeDuplicate(view) {
    if (view.shadowRoot.getElementById('btn-duplicate-confirm').disabled) return; // saving
    view.shadowRoot.getElementById('duplicate-modal').classList.remove('show');
    view._duplicate?.trigger?.focus?.();
    view._duplicate = null;
}

export async function confirmDuplicate(view) {
    const input = view.shadowRoot.getElementById('duplicate-date');
    const confirm = view.shadowRoot.getElementById('btn-duplicate-confirm');
    const user = getCurrentUser();
    const { item, trigger, uid } = view._duplicate || {};
    if (!item || confirm.disabled) return;
    // The account changed while the dialog was open: never save one account's trip into another.
    if (!user || user.uid !== uid || user.uid !== item.userId) { view.closeDuplicate(); return; }
    if (navigator.onLine === false) { showErrorToast(t('duplicateFailed')); return; }
    let plan;
    try { plan = shiftItineraryDates(item.itineraryPlan, input.value, todayString()); } catch {
        input.setCustomValidity(t('duplicateDateInvalid'));
        input.reportValidity();
        return;
    }
    confirm.disabled = true;
    if (trigger) trigger.disabled = true;
    try {
        // An untitled trip shows a title built from its dates, so the copy saves none and gets one from its new dates.
        const id = await saveItinerary(user.uid, plan, copyTitle(item.title, item.itineraryPlan, plan, t('duplicateSuffix')));
        confirm.disabled = false;
        view.closeDuplicate();
        showToast(t('duplicateDone'));
        if (getCurrentUser()?.uid !== user.uid) return;
        await view.fetchItineraries();
        // The refresh replaced every card, so focus the copy, else the original's duplicate button, else the list.
        const list = view.shadowRoot.getElementById('itineraries-list');
        const target = list?.querySelector(`.btn-view[data-id="${id}"]`)
            || list?.querySelector(`.btn-view[data-id="${item.id}"]`)?.closest('.trip-card')?.querySelector('.btn-duplicate');
        if (target) target.focus();
        else if (list) { list.tabIndex = -1; list.focus(); }
    } catch (error) {
        console.error('Duplicate failed:', error);
        showErrorToast(t('duplicateFailed'));
    } finally {
        confirm.disabled = false;
        if (trigger) trigger.disabled = false;
    }
}

/** 복제 창의 버튼과 키보드 동작을 건다. */
export function setupDuplicateListeners(view) {
    const duplicateModal = view.shadowRoot.getElementById('duplicate-modal');
    const duplicateInput = view.shadowRoot.getElementById('duplicate-date');
    const duplicateCancel = view.shadowRoot.getElementById('btn-duplicate-cancel');
    const duplicateConfirm = view.shadowRoot.getElementById('btn-duplicate-confirm');
    duplicateCancel?.addEventListener('click', () => view.closeDuplicate());
    duplicateConfirm?.addEventListener('click', () => view.confirmDuplicate());
    duplicateInput?.addEventListener('input', () => duplicateInput.setCustomValidity(''));
    duplicateModal?.addEventListener('click', e => { if (e.target === duplicateModal) view.closeDuplicate(); });
    // Escape closes and Tab stays inside the dialog, like the shared confirm dialog.
    duplicateModal?.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.preventDefault(); view.closeDuplicate(); return; }
        if (e.key === 'Enter' && e.target === duplicateInput) { e.preventDefault(); view.confirmDuplicate(); return; }
        if (e.key !== 'Tab') return;
        const focusables = [duplicateInput, duplicateCancel, duplicateConfirm].filter(control => !control.disabled);
        const index = focusables.indexOf(view.shadowRoot.activeElement);
        e.preventDefault();
        focusables[(index + (e.shiftKey ? -1 : 1) + focusables.length) % focusables.length].focus();
    });
}
