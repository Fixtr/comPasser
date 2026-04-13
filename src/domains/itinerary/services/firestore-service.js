import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, serverTimestamp, doc, deleteDoc, getDoc } from "firebase/firestore";
import { app } from "../../auth/services/firebase-auth.js";

const db = getFirestore(app);

export async function saveItinerary(userId, itineraryPlan) {
    try {
        const itinerariesRef = collection(db, "itineraries");
        const docRef = await addDoc(itinerariesRef, {
            userId: userId,
            itineraryPlan: itineraryPlan,
            createdAt: serverTimestamp()
        });
        return docRef.id;
    } catch (error) {
        console.error("Error saving itinerary:", error);
        throw error;
    }
}

export async function getUserItineraries(userId) {
    try {
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

export async function createSharedItinerary(itineraryPlan) {
    try {
        const sharedRef = collection(db, "shared_itineraries");
        const docRef = await addDoc(sharedRef, {
            itineraryPlan: itineraryPlan,
            createdAt: serverTimestamp()
        });
        return docRef.id;
    } catch (error) {
        console.error("Error creating shared itinerary:", error);
        throw error;
    }
}

export async function getSharedItinerary(documentId) {
    try {
        const docRef = doc(db, "shared_itineraries", documentId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            return docSnap.data().itineraryPlan;
        } else {
            console.log("No such shared itinerary!");
            return null;
        }
    } catch (error) {
        console.error("Error fetching shared itinerary:", error);
        throw error;
    }
}
export async function getItineraryById(documentId) {
    try {
        // 1. 먼저 프라이빗 itineraries 컬렉션 조회 시도
        const docRef = doc(db, "itineraries", documentId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            return docSnap.data().itineraryPlan;
        } else {
            // 없으면 공유된 일정(shared_itineraries) 컬렉션에서 교차 조회
            const sharedData = await getSharedItinerary(documentId);
            if (sharedData) return sharedData;

            console.log("No such itinerary document!");
            return null;
        }
    } catch (error) {
        // 본인 소유가 아닌 일정 접근 시 Firestore 권한 에러(permission-denied 등) 발동 가능
        // 이 경우에도 공유된 공유 객체인지 확인
        if (error.code === 'permission-denied' || error.message.includes('Missing or insufficient permissions')) {
            console.log("Permission denied for private map. Checking shared_itineraries fallback...");
            try {
                const sharedData = await getSharedItinerary(documentId);
                if (sharedData) return sharedData;
            } catch (sharedError) {
                console.error("Error fetching shared itinerary fallback:", sharedError);
                return null;
            }
        }
        
        console.error("Error fetching itinerary by ID:", error);
        throw error; // 실제 네트워크나 다른 치명적 예외인 경우 throw
    }
}
