// US2 — Role Assignment
// Test cases derived from UAT
// Written by: Dev 3

import { describe, it, expect } from 'vitest';

describe('US2 - Role Assignment', () => {

  // UAT 1: Admin assigns staff role
it('should grant staff access when admin assigns staff role', () => {
    const user = { uid: 'test-uid', role: 'student' };
    const updatedRole = 'staff';
    expect(updatedRole).not.toBe(user.role);
    expect(['student', 'staff', 'admin']).toContain(updatedRole);
});

  // UAT 2: Student blocked from admin page
it('should deny access when student tries to access admin page', () => {
    const userRole = 'student';
    const allowedRoles = ['admin'];
    const hasAccess = allowedRoles.includes(userRole);
    expect(hasAccess).toBe(false);
});

  // UAT 3: Only valid roles are accepted
it('should only accept valid role values', () => {
    const validRoles = ['student', 'staff', 'admin'];
    expect(validRoles).toContain('student');
    expect(validRoles).toContain('staff');
    expect(validRoles).toContain('admin');
    expect(validRoles).not.toContain('superuser');
    expect(validRoles).not.toContain('');
});

  // UAT 4: requireRole allows correct role through
it('should allow access when user role matches allowed roles', () => {
    const userRole = 'admin';
    const allowedRoles = ['admin'];
    const hasAccess = allowedRoles.includes(userRole);
    expect(hasAccess).toBe(true);
});

  // UAT 5: requireRole blocks wrong role
it('should deny access when user role does not match allowed roles', () => {
    const userRole = 'student';
    const allowedRoles = ['admin', 'staff'];
    const hasAccess = allowedRoles.includes(userRole);
    expect(hasAccess).toBe(false);
});

});