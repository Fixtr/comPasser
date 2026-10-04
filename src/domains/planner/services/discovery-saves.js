import { loadFirestore } from '../../../lib/firestore-lazy.mjs';
import { app, getCurrentUser } from '../../auth/services/firebase-auth.js';

export async function loadDiscoverySaves() {
  const userId = getCurrentUser()?.uid;
  const { db, collection, getDocs, doc, getDoc } = await loadFirestore();
  const [statistics, mine] = await Promise.all([
    getDocs(collection(db, 'discovery_popularity')),
    userId ? getDoc(doc(db, 'discovery_saves', userId)) : null,
  ]);
  if (getCurrentUser()?.uid !== userId) throw new Error('Account changed while loading saves');
  return { statistics: Object.fromEntries(statistics.docs.map(item => [item.id, item.data()])),
    saved: mine?.exists() ? mine.data().placeIds : [], userId };
}

export async function setDiscoveryPlaceSaved(placeId, saved) {
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const result = await httpsCallable(getFunctions(app), 'setDiscoveryPlaceSaved', { timeout: 12000 })({ placeId, saved });
  return result.data;
}
