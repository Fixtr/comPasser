import { app, getCurrentUser } from '../../auth/services/firebase-auth.js';
import { createAccountDeletionClient } from './account-deletion-client.mjs';

async function call(name, data) {
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    return (await httpsCallable(getFunctions(app, 'us-central1'), name, { timeout: 70_000 })(data)).data;
}

export const accountDeletionClient = createAccountDeletionClient({
    getCurrentUser,
    storage: {
        getItem: key => localStorage.getItem(key),
        setItem: (key, value) => localStorage.setItem(key, value),
        removeItem: key => localStorage.removeItem(key),
    },
    randomReceipt: () => Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join(''),
    submit: data => call('requestAccountDeletion', data),
    async getStatus(data) {
        if (!data.receipt) return call('getAccountDeletionStatus', data);
        // Deliberately no ID token: receipt status remains readable after Auth
        // deletion. It returns only progress, never account or itinerary data.
        const response = await fetch(`https://us-central1-${app.options.projectId}.cloudfunctions.net/getAccountDeletionStatus`, {
            method: 'POST', credentials: 'omit', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }),
            signal: AbortSignal.timeout(15_000),
        });
        const body = await response.json();
        if (!response.ok || body.error || !body.result) throw new Error('Unable to verify deletion status');
        return body.result;
    },
});
