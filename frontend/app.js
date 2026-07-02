/* ==========================================================================
   app.js — Main Application Engine v2.0
   Dynamic SRF Management Platform
   ========================================================================== */

import { runDatabaseIntegrityCheck, repairDataIntegrity, isAnswerNormalizerValid, isQuestionFilled, getLockStatus, acquireLock, releaseLock } from './src/db/store.js';
import { statesDistrictsData, allStates } from './src/data/geoData.js';
import { initStore, getEditions, getEditionById, getSectionsByEdition, getFieldsByEdition,
         getFieldsBySection, getApplicationsByUser, createApplication,
         saveAnswer, submitApplication, getAnswersByApplication,
         addNotification, getNotifications, getUnreadCount,
         markAllNotificationsRead, addAuditLog, getEditionStats,
         getApplicationById, updateApplication, forceSave, calculateApplicationScore, calculateApplicationMaxScore,
         getUsers, createUser, importUsersBulk, getUserById, getAssignments, getAllAssignments, createAssignment, createAssignmentsBulk,
         updateAssignment, removeAssignment, getReformAreas, getAuditLogs, getGuidelines,
         createGuideline, deleteGuideline, getDocumentRules, submitReformArea, getDb, deleteUser,
         addReassignmentHistory, getReassignmentHistory, getPendingAssignmentsCount, isSectionAssignedToUser as isSectionAssignedToUserStore, isFieldAssignedToUser as isFieldAssignedToUserStore,
         saveAnswerCompliance, submitQuestion, updateUser, getFieldById, updateField,
         getDepartments, createDepartment, updateDepartment, deleteDepartment,
         getMessagesBetween, getUnreadMessageCountFrom, sendMessage, markMessagesRead,
         getRecycleBin, addToRecycleBin, restoreFromRecycleBin, deleteFromRecycleBin,
         calculateApplicationProgress } from './src/db/store.js';
import { initAuth, login, logout, getCurrentUser, isAdmin, isSuperAdmin,
         isUser, getRoleInfo, getRoleBadgeHtml } from './src/auth/auth.js';
import { hasPermission } from './src/auth/rbac.js';
import { initToasts, showToast } from './src/ui/toastManager.js';
import { showConfirm, showAlert, showPrompt, showFileViewer } from './src/ui/confirmDialog.js';
import { dataURLtoBlob, dataURLtoObjectURL } from './src/ui/fileUtil.js';

import { initEditionManager } from './src/modules/editionManager.js';
import { renderApplicationTracker, renderApplicationDetail } from './src/modules/applicationManager.js';
import { NOTIFICATION_EVENTS } from './src/db/schema.js';
import { initFormEditor } from './formEditor.js';
import { renderUserDashboardEnhanced, renderAdminAnalyticsDashboard, renderTabbedApplicationWorkspace } from './src/modules/advancedDashboard.js';
import { renderTaskReviewPanel } from './src/modules/taskReviewManager.js';
import { renderGovernancePanel } from './src/modules/governanceManager.js';
import { boot, cleanupAllHeartbeats, debounce, postJson, checkExistingSession, pushToNavHistory, updateGlobalBackButton, goBack, showLandingView, initGlobalSearch, initPortal } from './src/core/bootstrap.js';
import { openFirstLoginResetModal, openForgotPasswordModal, openRequestNodalModal, openChangePasswordModal, sendPasswordOtp } from './src/auth/authModals.js';
import { renderAdminPortal, renderAdminSidebar, switchAdminTab, openEditionTracker, renderSchemaEditorAdmin, renderUsersPanel, openBulkImportUsersModal, openCreateUserModal, openCreateAdminModal, openAssignmentModal, openEditUserModal, renderGuidelinesPanel, openAddGuidelineModal, exportAllSubmissionsExcelFunc, openExportEditionModal, renderAuditPanel, renderSettingsPanel, renderDepartmentsPanel, openCreateDepartmentModal, openEditDepartmentModal } from './src/panels/adminPanel.js';
import { renderUserPortal, renderUserSidebar, switchUserTab, renderApplyPage, startNewApplication, renderAssignedEditionsPage, isAssignmentValid, isSectionAssignedToUser, isFieldAssignedToUser, getGuidelinePageForQuestion, renderExploreApplications, renderUserAppsFiltered, openApplicationDetail, renderUserProfilePage } from './src/panels/userPanel.js';
import { renderPublisherPanel, renderAssignedDetailsPanel, openReassignModal } from './src/panels/publisherPanel.js';
import { renderNotificationsPage, updateNotificationBadge, showNotificationsDropdown, openNotificationsModal } from './src/panels/notifications.js';
import { openProfileModal, renderMessagesTab } from './src/panels/profileMessages.js';
import { openRecycleBinViewModal, renderRecycleBinPanel } from './src/panels/recycleBin.js';
import { renderDiagnosticsPanel } from './src/panels/diagnostics.js';
import { openApplicationForm, renderUserElementInput, renderFieldInput, _userFacingStatus, _timeAgo, _statusClass, _statusLabel } from './src/panels/applicationForm.js';

// Expose globals for external modules
window.switchUserTab = switchUserTab;
window.openApplicationForm = openApplicationForm;
window.renderUserSidebar = renderUserSidebar;
window.renderSchemaEditorAdmin = renderSchemaEditorAdmin;
window.switchAdminTab = switchAdminTab;
window.boot = boot;

// Cleanup helper for application heartbeats/locks

// Global Fetch Hook to inject custom session headers and route API calls
const originalFetch = window.fetch;
window.fetch = function(url, options) {
  options = options || {};
  options.headers = options.headers || {};
  try {
    const sessionRaw = sessionStorage.getItem('srf_session_v2');
    if (sessionRaw) {
      const sess = JSON.parse(sessionRaw);
      if (sess && sess.token) {
        options.headers['Authorization'] = 'Bearer ' + sess.token;
      }
    }
  } catch (e) {}

  // Prefix URL with backend address if VITE_RENDER_BACKEND is configured and it is an API call
  if (url && (url.startsWith('/api/') || url === '/api')) {
    const backendUrl = import.meta.env.VITE_RENDER_BACKEND;
    if (backendUrl) {
      const base = backendUrl.endsWith('/') ? backendUrl.slice(0, -1) : backendUrl;
      url = base + url;
    }
  }

  return originalFetch(url, options);
};

boot();

// Helper for debouncing events/rendering

// ─── STATE ─────────────────────────────────────────────────────────────────
export let activeAdminTab = 'editions';
export let activeUserTab = 'dashboard';
let activeEditionId = null;
export let activeApplicationId = null;
let activeUserFormContainer = null;
let activeSectionId = null;
let autoSaveTimer = null;
window.currentFormAllowRemainingUploads = false;
window.workspaceLock = false;

// Global dynamic real-time refresh function
window.refreshCurrentView = function() {
  const updateSidebarOnly = () => {
    try {
      const user = getCurrentUser();
      if (!user) return;
      const isAdminOrSuper = ['admin', 'reviewer', 'superadmin'].includes(user.role);
      if (isAdminOrSuper) {
        renderAdminSidebar();
      } else {
        renderUserSidebar();
      }
      updateNotificationBadge();
    } catch (e) {
      console.warn('[refreshCurrentView] Error updating sidebar only:', e);
    }
  };

  if (window.workspaceLock) {
    updateSidebarOnly();
    return;
  }
  
  // Prevent refreshing if the user is typing in a form or review workspace
  if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT', 'OPTION'].includes(document.activeElement.tagName)) {
    updateSidebarOnly();
    return;
  }
  
  // Prevent refreshing if task review detail workspace, user form, active uploads, or document preview is active
  if (document.querySelector('.tr-workspace-layout') || 
      document.getElementById('tr-preview-container') || 
      document.getElementById('workspace-tabs-content') ||
      document.querySelector('.workspace-layout') ||
      document.getElementById('form-questions') ||
      document.querySelector('.user-form-container') ||
      document.querySelector('.modal-backdrop-custom') ||
      document.querySelector('.modal') ||
      document.querySelector('.upload-active') ||
      document.getElementById('btn-back-tracker')) {
    updateSidebarOnly();
    return;
  }

  try {
    const user = getCurrentUser();
    if (!user) return;
    const isAdminOrSuper = ['admin', 'reviewer', 'superadmin'].includes(user.role);
    if (isAdminOrSuper) {
      const schemaPanel = document.getElementById('schema-editor-panel');
      if (schemaPanel && !schemaPanel.classList.contains('hidden')) {
        updateSidebarOnly();
        return;
      }
      const schemaTab = document.getElementById('tab-schema-editor');
      if (schemaTab && schemaTab.classList.contains('active')) {
        updateSidebarOnly();
        return;
      }
      
      if (activeAdminTab) {
        switchAdminTab(activeAdminTab);
      }
    } else {
      if (activeUserTab && activeUserTab !== 'form') {
        switchUserTab(activeUserTab);
      }
    }
  } catch (e) {}
};

const throttledSyncRefresh = debounce(() => {
  if (window.workspaceLock) return;
  if (window.refreshCurrentView) {
    window.refreshCurrentView();
  }
}, 1000);

// Disabled to prevent unexpected UI resets and dropdown closures during background auto-saves
// window.addEventListener('db-sync-complete', throttledSyncRefresh);

// Global Navigation History Stack
window.navHistory = [];
window.isNavigatingBack = false;

// ─── DOM REFERENCES ────────────────────────────────────────────────────────
export const loginScreen  = document.getElementById('login-screen');
export const portalScreen = document.getElementById('portal-screen');
export const adminPanel   = document.getElementById('admin-panel');
export const userPanel    = document.getElementById('user-panel');

document.getElementById('nav-btn-home').addEventListener('click', () => showLandingView('hero'));
document.getElementById('nav-btn-login').addEventListener('click', () => showLandingView('login'));
document.getElementById('global-back-btn')?.addEventListener('click', goBack);
document.getElementById('btn-hero-user-login').addEventListener('click', () => {
  showLandingView('login');
  document.getElementById('login-form').dataset.loginType = 'user';
  document.getElementById('login-view-title').textContent = 'Portal Sign In';
});
document.getElementById('btn-hero-admin-login').addEventListener('click', () => {
  showLandingView('login');
  document.getElementById('login-form').dataset.loginType = 'admin';
  document.getElementById('login-view-title').textContent = 'Admin / Evaluator Sign In';
});
document.querySelectorAll('.btn-back-landing').forEach(b =>
  b.addEventListener('click', () => showLandingView('hero'))
);

const toggleBtn = document.getElementById('btn-toggle-password');
const pwdInput = document.getElementById('password');
if (toggleBtn && pwdInput) {
  toggleBtn.addEventListener('click', () => {
    const isPwd = pwdInput.type === 'password';
    pwdInput.type = isPwd ? 'text' : 'password';
    const visibleIcon = document.getElementById('eye-icon-visible');
    const hiddenIcon = document.getElementById('eye-icon-hidden');
    if (isPwd) {
      visibleIcon.classList.remove('hidden');
      hiddenIcon.classList.add('hidden');
    } else {
      visibleIcon.classList.add('hidden');
      hiddenIcon.classList.remove('hidden');
    }
  });
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const submitBtn = document.getElementById('btn-login-submit');
  const btnText = document.getElementById('login-btn-text');
  const spinner = document.getElementById('login-spinner');
  
  if (submitBtn) submitBtn.disabled = true;
  if (btnText) btnText.textContent = 'Processing...';
  if (spinner) spinner.style.display = 'block';

  const username = document.getElementById('username').value.replace(/\s+/g, '').toLowerCase();
  const password = document.getElementById('password').value;
  const result = await login(username, password);

  if (result.success) {
    const loginType = document.getElementById('login-form').dataset.loginType;
    if (loginType === 'user' && result.user.role !== 'user') {
      logout();
      showToast('Admin and Super Admin cannot login from User Login', 'error');
      // Reset button state
      if (submitBtn) submitBtn.disabled = false;
      if (btnText) btnText.textContent = 'Sign In';
      if (spinner) spinner.style.display = 'none';
      return;
    }
    document.getElementById('password').value = '';
    
    // Reset button state before navigating
    if (submitBtn) submitBtn.disabled = false;
    if (btnText) btnText.textContent = 'Sign In';
    if (spinner) spinner.style.display = 'none';
    
    if (result.user.mustResetPassword) {
      openFirstLoginResetModal(result.user);
    } else {
      initPortal();
    }
  } else {
    showToast(result.error || 'Invalid credentials.', 'error');
    // Reset button state on failure
    if (submitBtn) submitBtn.disabled = false;
    if (btnText) btnText.textContent = 'Sign In';
    if (spinner) spinner.style.display = 'none';
  }
});

document.getElementById('link-forgot-password')?.addEventListener('click', (e) => {
  e.preventDefault();
  openForgotPasswordModal();
});

document.getElementById('link-request-nodal')?.addEventListener('click', (e) => {
  e.preventDefault();
  openRequestNodalModal();
});

// ═══════════════════════════════════════════════════════════════════════════
// LOGOUT
// ═══════════════════════════════════════════════════════════════════════════
document.getElementById('btn-logout').addEventListener('click', () => {
  showConfirm({
    title: 'Sign Out',
    message: 'Are you sure you want to sign out?',
    confirmText: 'Sign Out',
    cancelText: 'Stay',
    type: 'warning',
    onConfirm: () => {
      clearInterval(autoSaveTimer);
      if (window.chatPollingInterval) {
        clearInterval(window.chatPollingInterval);
        window.chatPollingInterval = null;
      }
      logout();
      const searchContainer = document.querySelector('.topbar-search-container');
      if (searchContainer) {
        searchContainer.classList.add('hidden');
        document.getElementById('top-search-input').value = '';
      }
      portalScreen.classList.add('hidden');
      loginScreen.classList.remove('hidden');
      document.getElementById('password').value = '';
      showLandingView('hero');
      showToast('Signed out successfully.', 'info');
    }
  });
});

document.getElementById('btn-change-pwd')?.addEventListener('click', openChangePasswordModal);

// ═══════════════════════════════════════════════════════════════════════════

// ─── AUDIT LOGS PANEL ─────────────────────────────────────────────────────
let currentAuditFilterUserId = '';
let currentAuditFilterUserSearch = '';
let currentAuditFilterAdminId = '';
let currentAuditFilterDistrict = '';
let currentAuditFilterCategory = '';
let currentAuditFilterStartDate = '';
let currentAuditFilterEndDate = '';

// Expose Schema Editor globally for the workspace embedding
window.renderSchemaEditorAdmin = renderSchemaEditorAdmin;
window.setActiveEditionId = (id) => { activeEditionId = id; };
window.switchUserTab = switchUserTab;
window.openApplicationForm = openApplicationForm;
window.openApplicationDetail = openApplicationDetail;
window.renderUserSidebar = renderUserSidebar;
Object.defineProperty(window, 'activeUserTab', {
  get: () => activeUserTab,
  set: (v) => { activeUserTab = v; },
  configurable: true
});

// ─── MESSAGES TAB ENGINE & POLLING ──────────────────────────────────────────
let activeContactId = null;
window.chatPollingInterval = null;

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL RIPPLE ANIMATION ON BUTTONS
// ═══════════════════════════════════════════════════════════════════════════
document.addEventListener('click', function(e) {
  const btn = e.target.closest('.btn');
  if (!btn) return;
  
  const circle = document.createElement('span');
  const diameter = Math.max(btn.clientWidth, btn.clientHeight);
  const radius = diameter / 2;

  const rect = btn.getBoundingClientRect();
  circle.style.width = circle.style.height = `${diameter}px`;
  circle.style.left = `${e.clientX - rect.left - radius}px`;
  circle.style.top = `${e.clientY - rect.top - radius}px`;
  circle.classList.add('ripple-element');

  const existingRipple = btn.querySelector('.ripple-element');
  if (existingRipple) {
    existingRipple.remove();
  }

  btn.appendChild(circle);
  
  setTimeout(() => {
    if(circle && circle.parentNode) circle.remove();
  }, 600);
});
