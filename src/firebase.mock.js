// src/__mocks__/firebase.js
// Plain mock — no Vitest globals (vi is only available in test files)

// Mock firebase/app
export const initializeApp = () => ({});

// Mock firebase/auth
export const auth = {};
export const getAuth = () => ({});
export const GoogleAuthProvider = function () {
    this.setCustomParameters = () => {};
};
export const onAuthStateChanged = (_auth, callback) => {
    callback(null);
    return () => {};
};
export const signInWithPopup = () => Promise.resolve({ user: null });
export const signOut = () => Promise.resolve();

// Mock firebase/firestore
export const db = {};
export const getFirestore = () => ({});
export const doc = () => ({});
export const getDoc = () => Promise.resolve({ exists: () => false, data: () => ({}) });
export const setDoc = () => Promise.resolve();
export const collection = () => ({});
export const addDoc = () => Promise.resolve({ id: "mock-id" });