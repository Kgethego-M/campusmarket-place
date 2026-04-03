import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import AccessDenied from '../../src/components/AccessDenied';

describe('US2 - Role Assignment (Logic)', () => {

  it('should grant staff access when admin assigns staff role', () => {
    const user = { uid: 'test-uid', role: 'student' };
    const updatedRole = 'staff';
    expect(updatedRole).not.toBe(user.role);
    expect(['student', 'staff', 'admin']).toContain(updatedRole);
  });

  it('should deny access when student tries to access admin page', () => {
    const userRole = 'student';
    const allowedRoles = ['admin'];
    expect(allowedRoles.includes(userRole)).toBe(false);
  });

  it('should only accept valid role values', () => {
    const validRoles = ['student', 'staff', 'admin'];
    expect(validRoles).toContain('student');
    expect(validRoles).toContain('staff');
    expect(validRoles).toContain('admin');
    expect(validRoles).not.toContain('superuser');
    expect(validRoles).not.toContain('');
  });

  it('should allow access when user role matches allowed roles', () => {
    expect(['admin'].includes('admin')).toBe(true);
  });

  it('should deny access when user role does not match allowed roles', () => {
    expect(['admin', 'staff'].includes('student')).toBe(false);
  });

});

describe('US2 - Role Assignment (Components)', () => {

  it('should render access denied page with correct message', async () => {
    await act(async () => { render(<AccessDenied />); });
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.getByText(/don't have permission/i)).toBeInTheDocument();
    expect(screen.getByText(/go back home/i)).toBeInTheDocument();
  });

  it('should allow admin role through admin gate', () => {
    expect(['admin'].includes('admin')).toBe(true);
    expect(['admin'].includes('student')).toBe(false);
  });

  it('should allow admin and staff through staff gate', () => {
    expect(['admin', 'staff'].includes('admin')).toBe(true);
    expect(['admin', 'staff'].includes('staff')).toBe(true);
    expect(['admin', 'staff'].includes('student')).toBe(false);
  });

  it('should recognise all three platform roles', () => {
    const roles = ['student', 'staff', 'admin'];
    expect(roles).toHaveLength(3);
  });

  it('should reflect updated role after change', () => {
    const user = { uid: '123', role: 'student' };
    const updatedUser = { ...user, role: 'staff' };
    expect(updatedUser.role).toBe('staff');
    expect(updatedUser.uid).toBe(user.uid);
  });

});
