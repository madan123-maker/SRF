/* ==========================================================================
   auth.js — Authentication Controller
   Dynamic SRF Management Platform v2.0
   ========================================================================== */

import { initStore, addAuditLog, getDb, updateUser } from '../db/store.js';
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

export async function login(username, password) {
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });
    
    if (!res.ok) {
      const errData = await res.json();
      return { success: false, error: errData.error || 'Invalid username or password.' };
    }

    const resData = await res.json();
    const user = resData.user;
    const token = resData.token;

    _currentUser = { ...user, password: undefined, token };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(_currentUser));

    // Re-run initStore to fetch role-filtered database state
    await initStore();

    // Record last login timestamp
    updateUser(user.id, { lastLogin: new Date().toISOString() });

    addAuditLog(user.id, 'User login', 'auth', user.id);
    clearPermissionCache();
    _onLoginCallbacks.forEach(cb => cb(_currentUser));
    return { success: true, user: _currentUser };
  } catch (err) {
    console.error('[Login fetch error]:', err);
    return { success: false, error: 'Network error or server unavailable.' };
  }
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
