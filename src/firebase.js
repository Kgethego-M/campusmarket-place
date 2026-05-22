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

setPersistence(auth, browserLocalPersistence).catch((e) => {
  console.warn('Firebase persistence could not be set:', e);
});

// ── Whitelisted Gmail groups ──────────────────────────────────────────────────
export const WHITELISTED_STAFF_GMAILS = [
  'nontokozombatha797@gmail.com',
  's08027456@gmail.com',
  'tshegomaphefo48@gmail.com',
  'hyginusvictor11@gmail.com',
  'kgethim25.o@gmail.com',
  'sebopelatebogo68@gmail.com',
];

export const WHITELISTED_ADMIN_GMAILS = [
  'mbathamathamsanqa@gmail.com',
  'mphelanekgethego20060325@gmail.com',
  'anelevanwyk49@gmail.com',
  'lialabelle71@gmail.com',
  'dantesebopela@gmail.com',
  'hyginusvictor7@gmail.com',
  'nhlanhla.nkosi@wits.ac.za',
  '1064787@students.wits.ac.za',
  '2586407@students.wits.ac.za',
];

// Students who sign in with Gmail instead of their Wits student email
export const WHITELISTED_STUDENT_GMAILS = [
  'kgethie35@gmail.com',
  'masegelakamogelo5@gmail.com',
];

// ── Helpers ───────────────────────────────────────────────────────────────────
export const isWhitelistedStaff   = (email) => WHITELISTED_STAFF_GMAILS.includes(email);
export const isWhitelistedAdmin   = (email) => WHITELISTED_ADMIN_GMAILS.includes(email);
export const isWhitelistedStudent = (email) => WHITELISTED_STUDENT_GMAILS.includes(email);

export const isAnyWhitelisted = (email) =>
  isWhitelistedStaff(email) || isWhitelistedAdmin(email) || isWhitelistedStudent(email);

export const isValidWitsEmail = (email) =>
  email.endsWith('@wits.ac.za') ||
  email.endsWith('@students.wits.ac.za') ||
  isAnyWhitelisted(email);

export const getUserType = (email) => {
  if (email.endsWith('@wits.ac.za') && !email.endsWith('@students.wits.ac.za')) return 'staff';
  if (email.endsWith('@students.wits.ac.za')) return 'student';
  if (isWhitelistedStaff(email))   return 'staff';
  if (isWhitelistedAdmin(email))   return 'admin';
  if (isWhitelistedStudent(email)) return 'student';
  return 'unknown';
};