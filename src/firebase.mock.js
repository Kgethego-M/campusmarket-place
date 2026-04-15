// Mock firebase/auth
export const auth = {};

export const onAuthStateChanged = (auth, callback) => {
  callback(null);
  return () => {};
};

export const signInWithPopup = vi.fn();
export const signOut = vi.fn(() => Promise.resolve());

export const GoogleAuthProvider = vi.fn(function() {
  this.setCustomParameters = vi.fn();
});

// Mock firebase/firestore
export const db = {};
export const doc = vi.fn();
export const getDoc = vi.fn();
export const setDoc = vi.fn(() => Promise.resolve());
export const getFirestore = vi.fn(() => ({}));

// Mock firebase/app
export const initializeApp = vi.fn(() => ({}));