import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

export function isValidWitsEmail(email) {
  const e = email.toLowerCase();
  return e.endsWith("@students.wits.ac.za") || e.endsWith("@wits.ac.za");
}

export function getUserType(email) {
  const e = email.toLowerCase();
  const admins = [
    "2830236@students.wits.ac.za", "2826102@students.wits.ac.za",
    "2811042@students.wits.ac.za", "2849537@students.wits.ac.za",
    "2833644@students.wits.ac.za", "2668434@students.wits.ac.za",
  ];
  if (admins.includes(e))                 return "Admin";
  if (e.endsWith("@students.wits.ac.za")) return "student";
  if (e.endsWith("@wits.ac.za"))          return "Trade facility member";
  return "Unknown";
}
