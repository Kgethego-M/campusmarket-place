import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, browserLocalPersistence, setPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// Persist session in localStorage so it survives page redirects (e.g. Stripe
// Checkout sends the user away and back — without this Firebase loses the
// session on return and briefly fires onAuthStateChanged with null).
setPersistence(auth, browserLocalPersistence).catch((e) => {
  console.warn('Firebase persistence could not be set:', e);
});

export const isValidWitsEmail = (email) => {
  return email.endsWith('@wits.ac.za') || email.endsWith('@students.wits.ac.za') || email === 'nontokozombatha797@gmail.com' || email === 's08027456@gmail.com' || email === 'tshegomaphefo48@gmail.com' || email === 'hyginusvictor11@gmail.com' || email === 'dantesebopela@gmail.com' || email === 'kgethim25.o@gmail.com' || email === 'mphelanekgethego20060325@gmail.com' || email === 'anelevanwyk49@gmail.com' || email === 'mbathamathamsanqa@gmail.com'|| email === 'masegelakamogelo5@gmail.com'||email === 'kgethie35@gmail.com' || email === "lialabelle71@gmail.com";
};

export const getUserType = (email) => {
  if (email.endsWith('@wits.ac.za') || email === 'nontokozombatha797@gmail.com' || email === 's08027456@gmail.com' || email === 'tshegomaphefo48@gmail.com' || email === 'hyginusvictor11@gmail.com' || email === 'kgethim25.o@gmail.com') return 'staff';
  if (email === 'mbathamathamsanqa@gmail.com' || email === 'mphelanekgethego20060325@gmail.com' || email === 'anelevanwyk49@gmail.com'|| email === "lialabelle71@gmail.com" || email === 'dantesebopela@gmail.com') return 'admin';
  if (email.endsWith('@students.wits.ac.za')|| email === 'kgethie35@gmail.com' || email === 'masegelakamogelo5@gmail.com') return 'student';
  return 'unknown';
};