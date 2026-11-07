import { loadFirestore } from '../../../lib/firestore-lazy.mjs';
import { getCurrentUser } from '../../auth/services/firebase-auth.js';
import { validateCourseReview } from './course-community.mjs';
import { preparePublicRouteExtras } from './public-route.mjs';

export async function listPublicCourses(after = null) {
  const { db, collection, query, orderBy, limit, getDocsFromServer, startAfter } = await loadFirestore();
  const constraints = [orderBy('createdAt', 'desc')];
  if (after) constraints.push(startAfter(after));
  const snapshot = await getDocsFromServer(query(collection(db, 'public_courses'), ...constraints, limit(18)));
  return { courses: snapshot.docs.map(item => ({ id: item.id, ...item.data() })), cursor: snapshot.docs.at(-1), hasMore: snapshot.size === 18 };
}

export async function getPublicCourse(sourceId) {
  const { db, doc, getDocFromServer } = await loadFirestore();
  const snapshot = await getDocFromServer(doc(db, 'public_courses', sourceId));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function publishCourse(sourceId, { title, stops, review, titleEn, creditName, creditUrl }) {
  const ownerId = getCurrentUser()?.uid;
  if (!ownerId || !sourceId || !title?.trim() || stops.length < 2 || stops.length > 6) throw new Error('Invalid public course');
  const { db, doc, getDocFromServer, setDoc, serverTimestamp } = await loadFirestore();
  const ref = doc(db, 'public_courses', sourceId);
  // A cached copy can carry an old createdAt/stops pair that the update rule rejects.
  const previous = await getDocFromServer(ref);
  const signature = places => JSON.stringify(places.map(stop => [stop.name, stop.location, stop.stayMinutes,
    stop.englishName || '', stop.visitorInfo ? [stop.visitorInfo.englishMenu, stop.visitorInfo.reservation,
      stop.visitorInfo.sourceUrl, stop.visitorInfo.checkedOn] : null]));
  const samePlaces = previous.exists() && signature(previous.data().stops) === signature(stops);
  await setDoc(ref, {
    ownerId, sourceId, title: title.trim(), stops, review: review.trim(),
    ...preparePublicRouteExtras({ titleEn, creditName, creditUrl }),
    createdAt: samePlaces ? previous.data().createdAt : serverTimestamp(),
  });
}

export async function unpublishCourse(sourceId) {
  const { db, doc, deleteDoc } = await loadFirestore();
  await deleteDoc(doc(db, 'public_courses', sourceId));
}

export async function listCourseReviews(course, after = null) {
  const { db, collection, query, where, orderBy, startAfter, limit, getDocsFromServer } = await loadFirestore();
  const constraints = [where('courseId', '==', course.id), where('courseCreatedAt', '==', course.createdAt), orderBy('createdAt', 'desc')];
  if (after) constraints.push(startAfter(after));
  const snapshot = await getDocsFromServer(query(collection(db, 'course_reviews'), ...constraints, limit(10)));
  return { reviews: snapshot.docs.map(item => ({ id: item.id, ...item.data() })), cursor: snapshot.docs.at(-1), hasMore: snapshot.size === 10 };
}

export async function getMyCourseReview(course) {
  const user = getCurrentUser();
  if (!user) return null;
  const { db, doc, getDocFromServer } = await loadFirestore();
  const snapshot = await getDocFromServer(doc(db, 'course_reviews', `${course.id}_${user.uid}`));
  const data = snapshot.exists() ? snapshot.data() : null;
  return data?.courseCreatedAt?.isEqual(course.createdAt) ? data : null;
}

export async function saveCourseReview(course, input) {
  const userId = getCurrentUser()?.uid;
  if (!userId) throw new Error('loginRequiredToast');
  const today = new Date();
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const review = validateCourseReview(input, localToday);
  const { db, doc, setDoc, serverTimestamp } = await loadFirestore();
  await setDoc(doc(db, 'course_reviews', `${course.id}_${userId}`), {
    ...review, userId, courseId: course.id, courseCreatedAt: course.createdAt, createdAt: serverTimestamp(),
  });
}

export async function deleteCourseReview(courseId) {
  const userId = getCurrentUser()?.uid;
  if (!userId) throw new Error('loginRequiredToast');
  const { db, doc, deleteDoc } = await loadFirestore();
  await deleteDoc(doc(db, 'course_reviews', `${courseId}_${userId}`));
}
