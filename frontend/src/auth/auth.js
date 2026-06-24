/* ==========================================================================
   auth.js — Authentication Controller
   Dynamic SRF Management Platform v2.0
   ========================================================================== */

import { authenticateUser, addAuditLog, getDb, updateUser } from '../db/store.js';
import { clearPermissionCache, ROLE_LABELS } from './rbac.js';

const SESSION_KEY = 'srf_session_v2';

let _currentUser = null;
let _onLoginCallbacks = [];
let _onLogoutCallbacks = [];

// ─── SESSION ──────────────────────────────────────────────────────────────
export function initAuth() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (raw) {
    try {
      _currentUser = JSON.parse(raw);
    } catch (e) {
      _currentUser = null;
      sessionStorage.removeItem(SESSION_KEY);
    }
  }
}

export function login(username, password) {
  const user = authenticateUser(username.trim().toLowerCase(), password);
  if (!user) return { success: false, error: 'Invalid username or password.' };
  
  // Record last login timestamp
  updateUser(user.id, { lastLogin: new Date().toISOString() });
  
  // Retrieve the updated user object (with lastLogin set)
  const updatedUser = (_db => {
    try {
      return getDb().users.find(u => u.id === user.id);
    } catch(e) {
      return user;
    }
  })();

  _currentUser = { ...(updatedUser || user), password: undefined }; // never store password in session
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(_currentUser));
  addAuditLog(user.id, 'User login', 'auth', user.id);
  clearPermissionCache();
  _onLoginCallbacks.forEach(cb => cb(_currentUser));
  return { success: true, user: _currentUser };
}

export function logout() {
  if (_currentUser) {
    addAuditLog(_currentUser.id, 'User logout', 'auth', _currentUser.id);
  }
  _currentUser = null;
  sessionStorage.removeItem(SESSION_KEY);
  clearPermissionCache();
  _onLogoutCallbacks.forEach(cb => cb());
}

export function getCurrentUser() { return _currentUser; }
export function isLoggedIn() { return !!_currentUser; }

export function onLogin(cb) { _onLoginCallbacks.push(cb); }
export function onLogout(cb) { _onLogoutCallbacks.push(cb); }

// ─── ROLE UTILITIES ────────────────────────────────────────────────────────
export function isAdmin() {
  return _currentUser && ['admin', 'superadmin'].includes(_currentUser.role);
}

export function isSuperAdmin() {
  return _currentUser && _currentUser.role === 'superadmin';
}

export function isUser() {
  return _currentUser && _currentUser.role === 'user';
}

export function getRoleInfo() {
  if (!_currentUser) return null;
  return ROLE_LABELS[_currentUser.role] || { label: _currentUser.role, color: '#64748b', bg: 'rgba(100,116,139,0.1)' };
}

export function getRoleBadgeHtml(user) {
  const r = user ? ROLE_LABELS[user.role] : null;
  if (!r) return '';
  return `<span class="role-badge" style="background:${r.bg};color:${r.color};border:1px solid ${r.color}30;">${r.label}</span>`;
}
