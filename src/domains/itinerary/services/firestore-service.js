import { loadFirestore } from "../../../lib/firestore-lazy.mjs";
import { getCurrentUser } from "../../auth/services/firebase-auth.js";
import { createItineraryDocumentLoader } from "./itinerary-document-loader.mjs";
import { watchSharedAccess } from './shared-access-watch.mjs';
import { normalizeData } from './itinerary-normalize.mjs';
import { legacyStopNoteKeys, migrateStopNotes, normalizeStopNote, stopNoteKeys } from './stop-notes.mjs';

export async function saveItinerary(userId, itineraryPlan, title) {
    try {
        const { db, collection, addDoc, serverTimestamp } = await loadFirestore();
        const itinerariesRef = collection(db, "itineraries");
        const docRef = await addDoc(itinerariesRef, {
            userId: userId,
            itineraryPlan: itineraryPlan,
            // 목록에서 서로 구분할 수 있도록 여행 날짜/방문지 기반 제목을 함께 남긴다.
            // 예전 문서에는 없으므로 읽는 쪽에서 폴백을 계산한다.
            title: typeof title === 'string' && title.trim() ? title.trim() : null,
            createdAt: serverTimestamp()
        });
        return docRef.id;
    } catch (error) {
        console.error("Error saving itinerary:", error);
        throw error;
    }
}

/**
 * 저장된 일정의 이름만 바꾼다.
 *
 * firestore.rules 는 소유자에게 title(100자 이내) 수정을 허용한다.
 * 소유자(userId)와 저장 시각(createdAt)은 바꿀 수 없다.
 *
 * @param {string} documentId
 * @param {string} title 새 이름(빈 문자열/100자 초과는 거부)
 */
export async function renameItinerary(documentId, title) {
    const trimmed = typeof title === "string" ? title.trim() : "";
    if (!trimmed) throw new Error("일정 이름을 입력해 주세요.");
    if (trimmed.length > 100) throw new Error("일정 이름은 100자 이내로 입력해 주세요.");

    try {
        const { db, doc, updateDoc } = await loadFirestore();
        await updateDoc(doc(db, "itineraries", documentId), { title: trimmed });
        return trimmed;
    } catch (error) {
        console.error("Error renaming itinerary:", error);
        throw error;
    }
}

/**
 * 저장한 일정의 내용만 같은 문서에 덮어쓴다. 이름·소유자·저장 시각은 그대로 둔다.
 * updateDoc은 바꾼 필드만 쓰므로 다른 기기에서 바꾼 이름을 덮지 않는다.
 *
 * @param {string} documentId
 * @param {object} itineraryPlan
 */
export async function updateItinerary(documentId, itineraryPlan) {
    try {
        const { db, doc, updateDoc } = await loadFirestore();
        await updateDoc(doc(db, "itineraries", documentId), { itineraryPlan });
        return documentId;
    } catch (error) {
        console.error("Error updating itinerary:", error);
        throw error;
    }
}

// The stored trip with its ids and notes migrated, and the old place key of the stop the key names.
function privateStop(trip, userId, key) {
    if (trip?.userId !== userId || getCurrentUser()?.uid !== userId) throw new Error('Private trip required');
    const migrated = migrateStopNotes(trip);
    for (const day of normalizeData(migrated.plan)?.days || []) {
        const index = stopNoteKeys(day).indexOf(key);
        if (key && index >= 0) return { ...migrated, placeKey: legacyStopNoteKeys(day)[index] };
    }
    throw Object.assign(new Error('Saved stop required'), { code: 'saved-stop-required' });
}

export async function readPrivateStopNote(id, userId, key) {
    const { db, doc, getDocFromServer } = await loadFirestore();
    if (!userId || getCurrentUser()?.uid !== userId) throw new Error('Account changed');
    const trip = (await getDocFromServer(doc(db, 'itineraries', id))).data();
    const note = privateStop(trip, userId, key).notes[key];
    return normalizeStopNote(note?.text, note?.url) || { text: '', url: '' };
}

// Saving migrated notes also saves the plan's new ids, so the ids notes depend on never move again.
const migrationUpdate = (trip, { plan, notes, idsAdded }) => ({
    ...(idsAdded ? { itineraryPlan: plan } : {}),
    ...(JSON.stringify(notes) !== JSON.stringify(trip.stopNotes || {}) ? { stopNotes: notes } : {}),
});

export async function writePrivateStopNote(id, userId, key, note) {
    const { db, doc, runTransaction } = await loadFirestore();
    if (!userId || getCurrentUser()?.uid !== userId) throw new Error('Account changed');
    const ref = doc(db, 'itineraries', id);
    // Notes are separate from the plan, and simultaneous writes to other stops
    // are kept. The trip's existing deletion and account rules apply.
    await runTransaction(db, async transaction => {
        const trip = (await transaction.get(ref)).data();
        const stop = privateStop(trip, userId, key);
        // The old place-key copy would come back after a cleared or edited note.
        if (stop.placeKey) delete stop.notes[stop.placeKey];
        if (note.text || note.url) stop.notes[key] = note;
        else delete stop.notes[key];
        transaction.update(ref, { ...migrationUpdate(trip, stop), stopNotes: stop.notes });
    });
}

// Fixes ids and copies old place-keyed notes once; a migrated trip needs no transaction.
async function migratePrivateStopNotes(id) {
    const { db, doc, runTransaction } = await loadFirestore();
    const ref = doc(db, 'itineraries', id);
    await runTransaction(db, async transaction => {
        const trip = (await transaction.get(ref)).data();
        if (!trip?.stopNotes || trip.userId !== getCurrentUser()?.uid) return;
        const update = migrationUpdate(trip, migrateStopNotes(trip));
        if (Object.keys(update).length) transaction.update(ref, update);
    });
}

export async function getUserItineraries(userId) {
    try {
        const { db, collection, getDocs, query, where, orderBy } = await loadFirestore();
        const itinerariesRef = collection(db, "itineraries");
        const q = query(itinerariesRef, where("userId", "==", userId), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);

        const itineraries = [];
        querySnapshot.forEach((doc) => {
            itineraries.push({
                id: doc.id,
                ...doc.data()
            });
        });

        return itineraries;
    } catch (error) {
        console.error("Error fetching user itineraries:", error);
        throw error;
    }
}

export async function deleteItinerary(documentId) {
    try {
        const { db, doc, getDocFromServer, writeBatch } = await loadFirestore();
        const docRef = doc(db, "itineraries", documentId);
        const publicRef = doc(db, 'public_courses', documentId);
        const publicSnapshot = await getDocFromServer(publicRef);
        const batch = writeBatch(db);
        if (publicSnapshot.exists()) batch.delete(publicRef);
        batch.delete(docRef);
        await batch.commit();
        console.log(`Itinerary ${documentId} successfully deleted.`);
    } catch (error) {
        console.error("Error deleting itinerary: ", error);
        throw error;
    }
}

export async function createSharedItinerary(itineraryPlan, sourceId) {
    try {
        const ownerId = getCurrentUser()?.uid;
        if (!ownerId || !/^[a-zA-Z0-9]+$/.test(sourceId || '')) throw new Error('A saved source itinerary is required');
        const { db, collection, serverTimestamp, doc, writeBatch } = await loadFirestore();
        const docRef = doc(collection(db, 'shared_itineraries'));
        const batch = writeBatch(db);
        batch.set(docRef, {
            itineraryPlan, sourceId, ownerId, createdAt: serverTimestamp()
        });
        batch.set(doc(db, 'shared_itinerary_status', docRef.id), { sourceId, ownerId });
        await batch.commit();
        return docRef.id;
    } catch (error) {
        console.error("Error creating shared itinerary:", error);
        throw error;
    }
}

/**
 * 명시적 공유 주소와 비로그인 조회에서는 공개 공유본만 읽는다.
 * 로그인한 예전 /view 주소는 본인 일정 → 공유본 순으로 조회한다.
 * 반환된 access로 화면에서도 공유본의 읽기 전용 상태를 유지한다.
 */
export const loadItineraryDocument = createItineraryDocumentLoader({
    async readDocument(collectionName, documentId) {
        const { db, doc, getDoc, getDocFromServer } = await loadFirestore();
        // Never resurrect revoked shared content from the persistent offline cache.
        const read = collectionName === 'itineraries' ? getDoc : getDocFromServer;
        const snapshot = await read(doc(db, collectionName, documentId));
        const trip = snapshot.exists() ? snapshot.data() : null;
        if (collectionName === 'itineraries' && Object.keys(trip?.stopNotes || {}).length
            && Object.keys(migrationUpdate(trip, migrateStopNotes(trip))).length) {
            // Reading and writing a note migrate too, so a failure here (offline) only defers it.
            migratePrivateStopNotes(documentId).catch(error => console.warn('Stop note migration deferred:', error));
        }
        return trip;
    }
});

export async function watchSharedItinerary(documentId, onInvalidated) {
    const { db, doc, getDocFromServer } = await loadFirestore();
    return watchSharedAccess(async () =>
        (await getDocFromServer(doc(db, 'shared_itineraries', documentId))).exists(), onInvalidated);
}
