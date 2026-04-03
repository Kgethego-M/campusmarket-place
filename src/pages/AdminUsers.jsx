import React from 'react';
import { useEffect, useState } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import useRequireRole from '../hooks/useRequireRole';
import AccessDenied from '../components/AccessDenied';

const VALID_ROLES = ['student', 'staff', 'admin'];

const AdminUsers = () => {
  const { loading, accessGranted } = useRequireRole(['admin']);
  const [users, setUsers] = useState([]);
  const [fetchError, setFetchError] = useState(null);

  useEffect(() => {
    if (!accessGranted) return;
    const loadUsers = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'users'));
        const userList = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setUsers(userList);
      } catch (error) {
        console.error('Failed to load users:', error);
        setFetchError('Failed to load users. Check your Firestore rules.');
      }
    };
    loadUsers();
  }, [accessGranted]);

  const handleRoleChange = async (uid, newRole) => {
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole });
      setUsers((prev) =>
        prev.map((u) => (u.id === uid ? { ...u, role: newRole } : u))
      );
    } catch (error) {
      console.error('Failed to update role:', error);
      alert('Failed to update role. Check your Firestore rules.');
    }
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  };

  if (loading) {
    return <div style={styles.center}>Checking permissions...</div>;
  }

  if (!accessGranted) {
    return <AccessDenied />;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>User Management</h1>
        <span style={styles.badge}>Admin panel</span>
      </div>
      {fetchError && <div style={styles.error}>{fetchError}</div>}
      <table style={styles.table}>
        <thead>
          <tr>
            {['User', 'Email', 'Role', 'Action'].map((h) => (
              <th key={h} style={styles.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.length === 0 ? (
            <tr>
              <td colSpan="4" style={styles.empty}>No users found.</td>
            </tr>
          ) : (
            users.map((user) => (
              <tr key={user.id}>
                <td style={styles.td}>
                  <div style={styles.userCell}>
                    <div style={styles.avatar}>{getInitials(user.displayName)}</div>
                    <span>{user.displayName || 'No name'}</span>
                  </div>
                </td>
                <td style={styles.td}>{user.email || '-'}</td>
                <td style={styles.td}>
                  <select
                    value={user.role}
                    onChange={(e) => handleRoleChange(user.id, e.target.value)}
                    style={styles.select}
                  >
                    {VALID_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={styles.td}>
                  <span style={styles.savedTag}>Auto-saved</span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

const styles = {
  container: { maxWidth: '900px', margin: '2rem auto', padding: '0 1.5rem' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' },
  title: { fontSize: '1.5rem', fontWeight: '600' },
  badge: { background: '#e8f0fe', color: '#1967d2', fontSize: '0.75rem', padding: '4px 10px', borderRadius: '999px' },
  error: { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: '8px', overflow: 'hidden' },
  th: { textAlign: 'left', padding: '12px 16px', fontSize: '0.8rem', fontWeight: '600', color: '#666', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb', background: '#f8f9fa' },
  td: { padding: '12px 16px', borderBottom: '1px solid #f3f4f6', fontSize: '0.9rem', verticalAlign: 'middle' },
  userCell: { display: 'flex', alignItems: 'center', gap: '10px' },
  avatar: { width: '34px', height: '34px', borderRadius: '50%', background: '#dbeafe', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: '600' },
  select: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem' },
  savedTag: { fontSize: '0.8rem', color: '#16a34a' },
  center: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', color: '#666' },
  empty: { textAlign: 'center', padding: '2rem', color: '#888' },
};

export default AdminUsers;
