import { accountDeletionClient } from '../services/account-deletion-api.js';
import { t } from '../../../utils/i18n.js';

const statusKeys = {
    pending: 'accountDeletionPending',
    blocked: 'accountDeletionBlocked',
    completed: 'accountDeletionCompletedPublic',
    unknown: 'accountDeletionUnknown',
};

class AccountDeletionStatusView extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.states = null;
    }

    connectedCallback() {
        this.render();
        this.onLanguageChange = () => this.render();
        window.addEventListener('i18n-changed', this.onLanguageChange);
    }

    disconnectedCallback() {
        this.stop();
        window.removeEventListener('i18n-changed', this.onLanguageChange);
    }

    stop() {
        clearTimeout(this.timer);
        this.requestId = (this.requestId || 0) + 1;
    }

    async refresh() {
        this.stop();
        const requestId = this.requestId;
        if (!this.states) this.render();
        const states = await accountDeletionClient.localStatuses();
        if (requestId !== this.requestId || window.location.pathname !== '/account-deletion-status') return;
        this.states = states;
        this.render();
        if (states.some(state => state === 'pending' || state === 'unknown')) {
            this.timer = setTimeout(() => this.refresh(), 15_000);
        }
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host { display: block; max-width: 36rem; margin: 3rem auto; padding: 1.5rem; color: var(--cp-ink); font-family: var(--cp-font); }
                .card { padding: 1.5rem; background: var(--cp-surface); border: var(--cp-hair) solid var(--cp-rule); border-radius: var(--cp-radius); }
                h1 { margin: 0 0 0.75rem; font-size: 1.5rem; }
                p { line-height: 1.6; }
                ol { padding-left: 1.5rem; }
                li { margin: 1rem 0; line-height: 1.6; }
                a { color: var(--cp-ink); }
            </style>
            <main class="card">
                <h1>${t('accountDeletionStatusTitle')}</h1>
                <p>${t('accountDeletionStatusIntro')}</p>
                <div id="statuses" role="status" aria-live="polite"></div>
                <a href="/login">${t('accountDeletionBackToLogin')}</a>
            </main>
        `;
        const box = this.shadowRoot.getElementById('statuses');
        if (!this.states) {
            box.textContent = t('accountDeletionChecking');
        } else if (this.states.length === 0) {
            box.textContent = t('accountDeletionNoReceipt');
        } else {
            const list = document.createElement('ol');
            this.states.forEach((state, index) => {
                const item = document.createElement('li');
                item.textContent = `${t('accountDeletionRequestNumber').replace('{0}', index + 1)}: ${t(statusKeys[state] || statusKeys.unknown)}`;
                list.append(item);
            });
            box.append(list);
        }
    }
}

customElements.define('account-deletion-status-view', AccountDeletionStatusView);
