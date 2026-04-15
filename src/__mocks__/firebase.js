// Complete Firebase mock that works with both auth and firestore
export const auth = {};

// Auth functions
export const onAuthStateChanged = (auth, callback) => {
  // Store callback for later if needed
  if (typeof callback === 'function') {
    callback(null); // Start with no user
  }
  return () => {}; // Unsubscribe function
};

export const signInWithPopup = vi.fn(() => {
  return Promise.resolve({
    user: {
      uid: 'mock-uid-123',
      email: 'student@students.wits.ac.za',
      displayName: 'Test Student',
      photoURL: null
    }
  });
});

export const signOut = vi.fn(() => Promise.resolve());

export const GoogleAuthProvider = vi.fn(function() {
  this.setCustomParameters = vi.fn();
  return this;
});

// Firestore functions
export const db = {};
export const getFirestore = vi.fn(() => ({}));

export const doc = vi.fn((db, collection, id) => ({
  id,
  path: `${collection}/${id}`
}));

export const getDoc = vi.fn(() => {
  return Promise.resolve({
    exists: () => true,
    data: () => ({
      email: 'student@students.wits.ac.za',
      firstName: 'Test',
      lastName: 'Student',
      userType: 'student',
      role: 'student'
    })
  });
});

export const setDoc = vi.fn(() => Promise.resolve());
export const collection = vi.fn(() => ({}));
export const addDoc = vi.fn(() => Promise.resolve({ id: 'mock-doc-id' }));

// App functions
export const initializeApp = vi.fn(() => ({}));