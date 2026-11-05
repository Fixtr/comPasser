import { loadFirestore } from '../../../lib/firestore-lazy.mjs';
import { getCurrentUser } from '../../auth/services/firebase-auth.js';

// The report keeps no reporter id, so account deletion has nothing to clean up; the operator reviews them in the console.
// It copies the post and its author id, so an edit or delete after the report leaves the operator something to judge.
// shortcut: one account can file repeated reports; add a per-user report id if spam reports become a problem.
export async function reportContent({ kind, targetId, authorId, text }) {
  if (!getCurrentUser()) throw new Error('loginRequiredToast');
  const { db, collection, addDoc, serverTimestamp } = await loadFirestore();
  await addDoc(collection(db, 'content_reports'), { kind, targetId, authorId, text: String(text || '').slice(0, 1000), createdAt: serverTimestamp() });
}
