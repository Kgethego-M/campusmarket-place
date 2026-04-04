// src/hooks/useRequireRole.js
// Protects any page by checking login + role
// Written by: Dev 3

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const useRequireRole = (allowedRoles) => {
const [loading, setLoading] = useState(true);
const [accessGranted, setAccessGranted] = useState(false);
const [currentUser, setCurrentUser] = useState(null);

useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Not logged in
    if (!user) {
        setLoading(false);
        setAccessGranted(false);
        return;
    }

    try {
        // Fetch user profile from Firestore
        const userSnap = await getDoc(doc(db, 'users', user.uid));

        if (!userSnap.exists()) {
        setLoading(false);
        setAccessGranted(false);
        return;
        }

        const userData = userSnap.data();
        const hasAccess = allowedRoles.includes(userData.role);

        setCurrentUser({ ...user, ...userData });
        setAccessGranted(hasAccess);
        setLoading(false);

    } catch (error) {
        console.error('Role check failed:', error);
        setLoading(false);
        setAccessGranted(false);
    }
    });

    return () => unsubscribe();
}, [allowedRoles]);

return { loading, accessGranted, currentUser };
};

export default useRequireRole;