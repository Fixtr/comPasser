import { loadFirestore } from '../../../lib/firestore-lazy.mjs';
import { app, getCurrentUser } from '../../auth/services/firebase-auth.js';

export async function loadSavedDiscoveryIds(userId) {
  if (!userId || getCurrentUser()?.uid !== userId) throw new Error('Discovery save owner changed');
  const { db, doc, getDoc } = await loadFirestore();
  const snapshot = await getDoc(doc(db, 'discovery_saves', userId));
  if (getCurrentUser()?.uid !== userId) throw new Error('Discovery save owner changed');
  const ids = snapshot.exists() ? snapshot.data().placeIds : null;
  return Array.isArray(ids) ? ids : [];
}

export async function loadDiscoverySaves() {
  const userId = getCurrentUser()?.uid;
  const { db, collection, getDocs } = await loadFirestore();
  const [statistics, saved] = await Promise.all([
    getDocs(collection(db, 'discovery_popularity')),
    userId ? loadSavedDiscoveryIds(userId) : [],
  ]);
  if (getCurrentUser()?.uid !== userId) throw new Error('Account changed while loading saves');
  return { statistics: Object.fromEntries(statistics.docs.map(item => [item.id, item.data()])), saved, userId };
}

export async function setDiscoveryPlaceSaved(placeId, saved, userId = getCurrentUser()?.uid) {
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  if (!userId || getCurrentUser()?.uid !== userId) throw new Error('Discovery save owner changed');
  const result = await httpsCallable(getFunctions(app), 'setDiscoveryPlaceSaved', { timeout: 12000 })({ placeId, saved });
  return result.data;
}
