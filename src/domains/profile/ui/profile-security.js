import { unblockAllAuthors } from '../../itinerary/services/blocked-authors.mjs';
import { getCurrentUser, logout } from '../../auth/services/firebase-auth.js';
import { showToast, showErrorToast } from '../../../utils/toast.js';
import { t, getLang, setLang } from '../../../utils/i18n.js';
import { showConfirm } from '../../../utils/confirm-dialog.js';

/** 계정 관리 탭의 언어, 차단 해제, 로그아웃. */
export function setupSecurityListeners(view) {
    const language=view.shadowRoot.getElementById('profile-language');
    language.value=getLang(); language.onchange=()=>setLang(language.value);
    // The Ionic shell dropped the old header, so this is the only sign-out control.
    view.shadowRoot.getElementById('btn-unblock-all')?.addEventListener('click', async () => {
        if (!(await showConfirm({ title: t('unblockAllBtn'), message: t('unblockAllNotice'), confirmText: t('unblockAllConfirm'), cancelText: t('cancelBtn') }))) return;
        showToast(unblockAllAuthors() ? t('unblockAllDone') : t('unblockAllNone'));
    });
    view.shadowRoot.getElementById('btn-logout')?.addEventListener('click', async () => {
        try {
            await logout();
            if (window.navigate) window.navigate('/home');
        } catch (error) {
            console.error('Logout failed:', error);
            showErrorToast(t('logoutFailed'));
        }
    });
}

/** 계정 삭제 확인 창. 삭제 요청은 서버가 맡고, 여기서는 확인과 취소, 재로그인 안내만 한다. */
export function setupAccountDeletionListeners(view) {
    const deleteBtn = view.shadowRoot.getElementById('btn-delete-account-trigger');
    const modal = view.shadowRoot.getElementById('delete-modal');
    const cancelBtn = view.shadowRoot.getElementById('btn-modal-cancel');
    const confirmBtn = view.shadowRoot.getElementById('btn-modal-confirm');
    const closeX = view.shadowRoot.getElementById('modal-close-x');

    let deletionCancelled = false;
    let deletionStarted = false;
    const openModal = () => {
        if (confirmBtn?.disabled || deleteBtn?.disabled) return;
        deletionCancelled = false;
        modal.classList.add('show');
    };
    const closeModal = () => {
        if (deletionStarted) return;
        deletionCancelled = true;
        modal.classList.remove('show');
    };

    if (deleteBtn) deleteBtn.addEventListener('click', openModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    if (closeX) closeX.addEventListener('click', closeModal);

    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            const user = getCurrentUser();
            if (!user || confirmBtn.disabled) return;

            confirmBtn.disabled = true;
            confirmBtn.textContent = t('checkingAccountDeletionBtn');

            try {
                const result = await view.profileService.deleteAccount({
                    isCancelled: () => deletionCancelled,
                    onDeletionStarted: () => {
                        deletionStarted = true;
                        if (cancelBtn) cancelBtn.disabled = true;
                        confirmBtn.textContent = t('deletingDataBtn');
                    },
                });
                if (result && getCurrentUser()?.uid === result.userId) {
                    await view.applyDeletionStatus(result, result.userId, result.identityCreatedAt);
                    if (result.state === 'pending') view.watchDeletion(user, { restart: true });
                }
            } catch (err) {
                console.error("Account deletion failed:", err);
                if (deletionCancelled) return;
                if (getCurrentUser()?.uid !== user.uid || getCurrentUser()?.metadata?.creationTime !== user.metadata?.creationTime) return;
                if (err.code === 'auth/requires-recent-login') {
                    showErrorToast(t('accountDeletionSignInRequired'), { duration: 5000 });
                    try {
                        await logout();
                        // 인증 구독이 먼저 /login으로 보내도 next를 붙여 계정 관리로 복귀한다.
                        // 다른 계정으로 바뀌었으면 새 세션의 화면을 건드리지 않는다.
                        if (!getCurrentUser()) {
                            const path = '/login?next=%2Fprofile%2Fsecurity';
                            if (window.navigate) window.navigate(path);
                            else window.location.href = path;
                        }
                    } catch (logoutError) {
                        console.error('Re-login preparation failed:', logoutError);
                        // 토스트는 한 번에 하나라, 앞의 재로그인 안내를 함께 담는다.
                        if (getCurrentUser()?.uid === user.uid) showErrorToast(`${t('accountDeletionSignInRequired')} ${t('accountDeletionSignOutFailed')}`, { duration: 8000 });
                    }
                } else {
                    showErrorToast(t(err.deletionStatusUnknown ? 'accountDeletionUnknown' : 'accountDeletionCheckFailed'));
                    if (err.deletionStatusUnknown) {
                        view.deletionState = 'unknown';
                        view.watchDeletion(user, { restart: true });
                    }
                }
            } finally {
                deletionStarted = false;
                if (cancelBtn) cancelBtn.disabled = false;
                confirmBtn.disabled = false;
                confirmBtn.textContent = t('confirmDeleteAccountBtn');
                closeModal();
            }
        });
    }
}
