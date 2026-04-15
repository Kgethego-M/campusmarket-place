export const getFirestore = () => ({});
export const doc = () => ({});
export const getDoc = () => Promise.resolve({ exists: () => false, data: () => ({}) });
export const setDoc = () => Promise.resolve();
export const collection = () => ({});
export const addDoc = () => Promise.resolve({ id: "mock-id" });