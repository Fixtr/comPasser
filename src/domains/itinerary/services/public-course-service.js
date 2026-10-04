import { loadFirestore } from '../../../lib/firestore-lazy.mjs';
import { getCurrentUser } from '../../auth/services/firebase-auth.js';

export async function listPublicCourses() {
  const { db, collection, query, orderBy, limit, getDocs } = await loadFirestore();
  const snapshot = await getDocs(query(collection(db, 'public_courses'), orderBy('createdAt', 'desc'), limit(18)));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

export async function getPublicCourse(sourceId) {
  const { db, doc, getDoc } = await loadFirestore();
  const snapshot = await getDoc(doc(db, 'public_courses', sourceId));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function publishCourse(sourceId, { title, stops, review }) {
  const ownerId = getCurrentUser()?.uid;
  if (!ownerId || !sourceId || !title?.trim() || stops.length < 2 || stops.length > 6) throw new Error('Invalid public course');
  const { db, doc, getDoc, setDoc, serverTimestamp } = await loadFirestore();
  const ref = doc(db, 'public_courses', sourceId);
  const previous = await getDoc(ref);
  await setDoc(ref, {
    ownerId, sourceId, title: title.trim(), stops, review: review.trim(),
    createdAt: previous.exists() ? previous.data().createdAt : serverTimestamp(),
  });
}

export async function unpublishCourse(sourceId) {
  const { db, doc, deleteDoc } = await loadFirestore();
  await deleteDoc(doc(db, 'public_courses', sourceId));
}
