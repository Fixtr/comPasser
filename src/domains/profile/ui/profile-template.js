import { icons } from '../../../ui/icons.js';
import { t } from '../../../utils/i18n.js';
import { profileStyles } from './profile-style.js';

/** 개인 정보 탭. */
function personalTabMarkup() {
    return `<div id="personal" class="content-section active">
                        <div class="card">
                            <div class="card-header">
                                <h2 data-i18n="sectionBasicInfo">${t('sectionBasicInfo')}</h2>
                                <p data-i18n="sectionBasicInfoDesc">${t('sectionBasicInfoDesc')}</p>
                            </div>
                            <div class="list-item">
                                <div class="list-label" data-i18n="labelProfilePhoto">${t('labelProfilePhoto')}</div>
                                <div class="list-value">
                                    <img id="user-photo-small" class="photo-small" src="" alt="Profile" />
                                </div>
                            </div>
                            <div class="list-item">
                                <div class="list-label" data-i18n="labelName">${t('labelName')}</div>
                                <div class="list-value">
                                    <span id="user-name" class="value-text" data-i18n="loadingShort">${t('loadingShort')}</span>
                                </div>
                            </div>
                            <div class="list-item">
                                <div class="list-label" data-i18n="labelBirthday">${t('labelBirthday')}</div>
                                <div id="field-birthday" class="list-value">
                                    <span class="not-set" data-i18n="loadingShort">${t('loadingShort')}</span>
                                </div>
                            </div>
                            <div class="list-item">
                                <div class="list-label" data-i18n="generationCreditsLabel">${t('generationCreditsLabel')}</div>
                                <div class="list-value">
                                    <span id="generation-credit-balance" class="value-text">${t('generationCreditsLoading')}</span>
                                </div>
                            </div>
                        </div>

                        <div class="card">
                            <div class="card-header">
                                <h2 data-i18n="sectionContact">${t('sectionContact')}</h2>
                            </div>
                            <div class="list-item">
                                <div class="list-label" data-i18n="labelEmail">${t('labelEmail')}</div>
                                <div class="list-value">
                                    <span id="user-email" class="value-text" data-i18n="loadingShort">${t('loadingShort')}</span>
                                </div>
                            </div>
                        </div>
                    </div>`;
}

/** 저장한 일정 탭. 목록은 화면이 뜬 뒤에 채운다. */
function tripsTabMarkup() {
    return `<div id="trips" class="content-section">
                        <div class="card">
                            <div class="card-header">
                                <h2 data-i18n="sectionSavedItineraries">${t('sectionSavedItineraries')}</h2>
                                <p data-i18n="sectionSavedItinerariesDesc">${t('sectionSavedItinerariesDesc')}</p>
                            </div>
                            <div id="itineraries-list" class="itineraries-container"></div>
                        </div>
                    </div>`;
}

/** 계정 관리 탭. */
function securityTabMarkup() {
    return `<div id="security" class="content-section">
                        <div class="card">
                            <div class="card-header"><h2 data-i18n="sectionSecurity">${t('sectionSecurity')}</h2></div>
                            <div class="list-item">
                                <div class="list-label" data-i18n="labelLoginMethod">${t('labelLoginMethod')}</div>
                                <div class="list-value"><span id="profile-login-method"></span></div>
                            </div>
                            <div class="list-item">
                                <div class="list-label" data-i18n="labelPassword">${t('labelPassword')}</div>
                                <div class="list-value"><span class="not-set" data-i18n="passwordExternal">${t('passwordExternal')}</span></div>
                            </div>
                            <div class="list-item"><label class="list-label" for="profile-language" data-i18n="flowLanguage"></label><div class="list-value"><select id="profile-language"><option value="ko" data-i18n="flowKorean">${t('flowKorean')}</option><option value="en">English</option></select></div></div>
                            <div class="list-item">
                                <div class="list-label" data-i18n="labelBlockedAuthors">${t('labelBlockedAuthors')}</div>
                                <div class="list-value"><button id="btn-unblock-all" type="button" class="btn-modal-cancel" data-i18n="unblockAllBtn">${t('unblockAllBtn')}</button></div>
                            </div>
                            <button id="btn-logout" type="button" class="btn-modal-cancel btn-logout" data-i18n="logout" hidden>${t('logout')}</button>
                        </div>

                        <div class="card danger-section">
                            <div class="card-header danger-header">
                                <h2 data-i18n="sectionDeleteAccount">${t('sectionDeleteAccount')}</h2>
                                <p data-i18n="deleteAccountDesc">${t('deleteAccountDesc')}</p>
                            </div>
                            <button id="btn-delete-account-trigger" class="btn-danger-trigger" data-i18n="deleteAccountBtn">${t('deleteAccountBtn')}</button>
                            <p id="account-deletion-status" role="status" aria-live="polite"></p>
                        </div>
                    </div>`;
}

/** 일정 복제 창. */
function duplicateModalMarkup() {
    return `<div id="duplicate-modal" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="duplicate-heading">
                <div class="modal-content duplicate-content">
                    <h3 id="duplicate-heading" data-i18n="duplicateHeading">${t('duplicateHeading')}</h3>
                    <p data-i18n="duplicateDesc">${t('duplicateDesc')}</p>
                    <label class="duplicate-field"><span data-i18n="duplicateDateLabel">${t('duplicateDateLabel')}</span>
                        <input id="duplicate-date" type="date" required></label>
                    <div class="modal-actions">
                        <button id="btn-duplicate-cancel" type="button" class="btn-modal-cancel" data-i18n="cancelBtn">${t('cancelBtn')}</button>
                        <button id="btn-duplicate-confirm" type="button" class="btn-modal-confirm" data-i18n="duplicateConfirm">${t('duplicateConfirm')}</button>
                    </div>
                </div>
            </div>`;
}

/** 계정 삭제 확인 창. */
function deleteModalMarkup() {
    return `<div id="delete-modal" class="modal-overlay">
                <div class="modal-content">
                    <span id="modal-close-x" class="modal-close-x">&times;</span>
                    <h3 data-i18n="deleteAccountConfirmTitle">${t('deleteAccountConfirmTitle')}</h3>
                    <p data-i18n="deleteAccountConfirmDesc">${t('deleteAccountConfirmDesc')}</p>
                    <p data-i18n="accountDeletionAuthNotice">${t('accountDeletionAuthNotice')}</p>
                    <div class="modal-actions">
                        <button id="btn-modal-cancel" class="btn-modal-cancel" data-i18n="cancelBtn">${t('cancelBtn')}</button>
                        <button id="btn-modal-confirm" class="btn-modal-confirm" data-i18n="confirmDeleteAccountBtn">${t('confirmDeleteAccountBtn')}</button>
                    </div>
                </div>
            </div>`;
}

/** 프로필 화면 전체 마크업. 탭과 창은 위의 함수가 한 덩어리씩 맡는다. */
export function profileMarkup() {
    return `
            <style>
                ${profileStyles}
                .profile-wrapper { max-width: 700px; margin: 0 auto; display: block; }
                .sidebar { display:flex; gap:4px; flex-wrap:wrap; padding:4px; background:var(--cp-sunken); border-radius:8px; }
                .sidebar .nav-item { flex:1; min-width:0; font-size:12px; min-height:44px; }
                .sidebar #btn-back-home { display:none; }
                .standalone-trips .sidebar, .standalone-trips .header-banner { display:none; }
                .main-content { padding:16px 0; min-width:0; }
                .card { border-radius:10px; border-color:var(--cp-rule); }
                .list-label { font-size:12px; }
                #profile-language { font-size:12px; min-height:32px; padding:5px 8px; color:var(--cp-ink); background:var(--cp-surface); border:1px solid var(--cp-rule); border-radius:6px; }
                .trip-card { border-radius:10px; display:block; }
                .trip-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; }
                .trip-actions button { min-height:44px; font-size:12px; border:1px solid var(--cp-rule); border-radius:6px; color:var(--cp-ink); background:var(--cp-surface); padding:8px 12px; }
                .offline-badge { font-size:11px; color:var(--cp-muted); }
                :is(button,select,input):focus-visible { outline:3px solid var(--cp-ink); outline-offset:3px; }
                @media(pointer:coarse) { #profile-language { min-height:44px; } }

            </style>

            <div class="profile-wrapper">
                <nav class="sidebar" data-i18n-aria="profileMenuAria" aria-label="${t('profileMenuAria')}">
                    <button id="btn-back-home" class="btn-back-home">
                        <span aria-hidden="true">←</span> <span data-i18n="backHome">${t('backHome')}</span>
                    </button>
                    <button type="button" class="nav-item active" data-tab="personal" aria-current="page">
                        <span class="nav-icon" aria-hidden="true">${icons.user}</span> <span data-i18n="navPersonal">${t('navPersonal')}</span>
                    </button>
                    <button type="button" class="nav-item" data-tab="trips">
                        <span class="nav-icon" aria-hidden="true">${icons.map}</span> <span data-i18n="navItineraries">${t('navItineraries')}</span>
                    </button>
                    <button type="button" class="nav-item" data-tab="security">
                        <span class="nav-icon" aria-hidden="true">${icons.shield}</span> <span data-i18n="navSecurity">${t('navSecurity')}</span>
                    </button>
                </nav>

                <div class="main-content">
                    <div class="header-banner">
                        <img id="user-photo-hero" class="photo-hero" src="" alt="Profile" />
                        <h1 id="header-name" data-i18n="profileGreetingPlain">${t('profileGreetingPlain')}</h1>
                        <p data-i18n="profileHeaderDesc">${t('profileHeaderDesc')}</p>
                    </div>

                    ${personalTabMarkup()}

                    ${tripsTabMarkup()}

                    ${securityTabMarkup()}
                </div>
            </div>

            ${duplicateModalMarkup()}

            ${deleteModalMarkup()}
        `;
}
