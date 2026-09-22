/**
 * 조회 위치와 결과의 접근 모드를 함께 결정한다.
 * readDocument(collectionName, documentId)는 문서 데이터 또는 null을 반환한다.
 * Firestore 연결과 분리해 비로그인 조회가 개인 문서에 접근하지 않는지 검증한다.
 */
export function createItineraryDocumentLoader({ readDocument }) {
    return async function loadItineraryDocument(documentId, { sharedOnly = false, userId = null } = {}) {
        if (!sharedOnly && userId) {
            let privateDocument = null;
            try {
                privateDocument = await readDocument('itineraries', documentId);
            } catch (error) {
                // 개인 문서가 없거나 타인 소유인 예전 /view 링크는 공유본도 확인한다.
                // 네트워크 등 다른 오류는 "없는 일정"으로 바꾸지 않는다.
                if (error?.code !== 'permission-denied' && error?.code !== 'firestore/permission-denied') {
                    throw error;
                }
            }

            // 캐시에서 반환된 데이터도 현재 사용자 소유인지 확인한다.
            if (privateDocument?.userId === userId) {
                return { itineraryPlan: privateDocument.itineraryPlan, access: 'private' };
            }
        }

        let sharedDocument;
        try {
            sharedDocument = await readDocument('shared_itineraries', documentId);
        } catch (error) {
            if (['permission-denied', 'firestore/permission-denied'].includes(error?.code)) {
                // Rules expose this content-free receipt only after source deletion.
                try {
                    const receipt = await readDocument('shared_itinerary_status', documentId);
                    if (receipt?.sourceId && receipt?.ownerId) return { access: 'shared', deleted: true };
                } catch { /* Do not mislabel network/configuration failures as deletion. */ }
            }
            throw error;
        }
        return sharedDocument
            ? { itineraryPlan: sharedDocument.itineraryPlan, access: 'shared' }
            : null;
    };
}
