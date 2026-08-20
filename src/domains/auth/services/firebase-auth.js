import { initializeApp } from "firebase/app";
import { 
    getAuth, 
    GoogleAuthProvider, 
    signInWithPopup, 
    signOut, 
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendEmailVerification,
    deleteUser,
    applyActionCode
} from "firebase/auth";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export async function loginWithGoogle() {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        return result.user;
    } catch (error) {
        console.error("Login failed", error);
        throw error;
    }
}

export async function logout() {
    try {
        sessionStorage.removeItem('currentFormData');
        sessionStorage.removeItem('savedItineraryData');
        await signOut(auth);
    } catch (error) {
        console.error("Logout failed", error);
        throw error;
    }
}

export function subscribeToAuthChanges(callback) {
    return onAuthStateChanged(auth, callback);
}

export function getCurrentUser() {
    return auth.currentUser;
}

export async function signUpWithEmail(email, password) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await sendEmailVerification(user);
        await signOut(auth);
        return user;
    } catch (error) {
        console.error("Sign up failed", error);
        throw error;
    }
}

export async function loginWithEmail(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        if (!user.emailVerified) {
            await signOut(auth);
            throw new Error("EMAIL_NOT_VERIFIED");
        }
        
        return user;
    } catch (error) {
        console.error("Email login failed", error);
        throw error;
    }
}

export async function deleteCurrentUser() {
    const user = auth.currentUser;
    if (user) {
        localStorage.removeItem('hasSeenTutorial');
        sessionStorage.removeItem('currentFormData');
        sessionStorage.removeItem('savedItineraryData');
        await deleteUser(user);
    }
}


export async function verifyEmailCode(actionCode) {
    try {
        await applyActionCode(auth, actionCode);
        return true;
    } catch(err) {
        throw err;
    }
}
