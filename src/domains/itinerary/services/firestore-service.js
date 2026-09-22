import { loadFirestore } from "../../../lib/firestore-lazy.mjs";
import { getCurrentUser } from "../../auth/services/firebase-auth.js";
import { createItineraryDocumentLoader } from "./itinerary-document-loader.mjs";
import { watchSharedAccess } from './shared-access-watch.mjs';

export async function saveItinerary(userId, itineraryPlan, title) {
    try {
        const { db, collection, addDoc, getDocs, query, where, orderBy,
                serverTimestamp, doc, deleteDoc, getDoc } = await loadFirestore();
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
 * firestore.rules 가 title 한 필드만, 소유자에 한해, 100자 이내로 수정을
 * 허용한다. 일정 내용(itineraryPlan)이나 소유자(userId)는 바꿀 수 없다.
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

export async function getUserItineraries(userId) {
    try {
        const { db, collection, addDoc, getDocs, query, where, orderBy,
                serverTimestamp, doc, deleteDoc, getDoc } = await loadFirestore();
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
        const { db, collection, addDoc, getDocs, query, where, orderBy,
                serverTimestamp, doc, deleteDoc, getDoc } = await loadFirestore();
        const docRef = doc(db, "itineraries", documentId);
        await deleteDoc(docRef);
        console.log(`Itinerary ${documentId} successfully deleted.`);
    } catch (error) {
        console.error("Error deleting itinerary: ", error);
        throw error;
    }
}

export async function deleteAllUserItineraries(userId) {
    try {
        const { db, collection, addDoc, getDocs, query, where, orderBy,
                serverTimestamp, doc, deleteDoc, getDoc } = await loadFirestore();
        const itinerariesRef = collection(db, "itineraries");
        const q = query(itinerariesRef, where("userId", "==", userId));
        const querySnapshot = await getDocs(q);
        
        const deletePromises = [];
        querySnapshot.forEach((doc) => {
            deletePromises.push(deleteDoc(doc.ref));
        });
        
        await Promise.all(deletePromises);
        console.log(`Deleted all ${deletePromises.length} itineraries for user ${userId}`);
    } catch (error) {
        console.error("Error deleting all user itineraries:", error);
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

export async function getSharedItinerary(documentId) {
    const result = await loadItineraryDocument(documentId, { sharedOnly: true });
    return result?.itineraryPlan ?? null;
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
        return snapshot.exists() ? snapshot.data() : null;
    }
});

export async function watchSharedItinerary(documentId, onInvalidated) {
    const { db, doc, getDocFromServer } = await loadFirestore();
    return watchSharedAccess(async () =>
        (await getDocFromServer(doc(db, 'shared_itineraries', documentId))).exists(), onInvalidated);
}

// 일정 내용만 받던 기존 호출부를 위한 호환 API.
export async function getItineraryById(documentId) {
    const result = await loadItineraryDocument(documentId, { userId: getCurrentUser()?.uid ?? null });
    return result?.itineraryPlan ?? null;
}
