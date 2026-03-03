import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, serverTimestamp } from "firebase/firestore";
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
