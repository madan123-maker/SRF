/* ==========================================================================
   rbac.js — Role-Based Access Control
   Dynamic SRF Management Platform v2.0
   ========================================================================== */

const PERMISSION_CACHE = new Map();

/**
 * Check if a user has a specific permission.
 * @param {Object} user - User object with role
 * @param {string} permission - Permission string e.g. 'edition:create'
 * @param {Array} roles - All roles array from DB
 * @returns {boolean}
 */
export function hasPermission(user, permission, roles) {
  if (!user || !user.role) return false;

  const cacheKey = `${user.role}:${permission}`;
  if (PERMISSION_CACHE.has(cacheKey)) return PERMISSION_CACHE.get(cacheKey);

  const role = roles.find(r => r.key === user.role);
  if (!role) {
    PERMISSION_CACHE.set(cacheKey, false);
    return false;
  }

  const result = role.permissions.includes('*') || role.permissions.includes(permission);
  PERMISSION_CACHE.set(cacheKey, result);
  return result;
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(roleKey, roles) {
  const role = roles.find(r => r.key === roleKey);
  return role ? role.permissions : [];
}

/**
 * Check if user is admin-level or above
 */
export function isAdminOrAbove(user) {
  return user && ['superadmin', 'admin'].includes(user.role);
}

/**
 * Check if user is super admin
 */
export function isSuperAdmin(user) {
  return user && user.role === 'superadmin';
}

/**
 * Guard a function — run it only if user has permission
 */
export function guard(user, permission, roles, fn, fallback = null) {
  if (hasPermission(user, permission, roles)) {
    return fn();
  }
  if (fallback) fallback();
  return null;
}

/**
 * Clear permission cache (call when user changes)
 */
export function clearPermissionCache() {
  PERMISSION_CACHE.clear();
}

export const ROLE_LABELS = {
  superadmin: { label: 'Super Admin', color: '#7c3aed', bg: 'rgba(124,58,237,0.1)' },
  admin:      { label: 'Admin',       color: '#7e22ce', bg: 'rgba(126,34,206,0.08)' },
  reviewer:   { label: 'Reviewer',    color: '#0284c7', bg: 'rgba(2,132,199,0.08)' },
  section_manager: { label: 'Section Manager', color: '#0891b2', bg: 'rgba(8,145,178,0.08)' },
  user:       { label: 'User',        color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
};
