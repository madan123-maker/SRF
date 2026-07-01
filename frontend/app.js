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

// ─── BOOT ──────────────────────────────────────────────────────────────────

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
let currentFormAllowRemainingUploads = false;
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

// ═══════════════════════════════════════════════════════════════════════════
// LANDING PAGE NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════


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

// ═══════════════════════════════════════════════════════════════════════════
// AUTH — LOGIN
// ═══════════════════════════════════════════════════════════════════════════


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

// ═══════════════════════════════════════════════════════════════════════════
// CHANGE PASSWORD
// ═══════════════════════════════════════════════════════════════════════════


document.getElementById('btn-change-pwd')?.addEventListener('click', openChangePasswordModal);

// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL SEARCH
// ═══════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════
// INIT PORTAL
// ═══════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════
// ─── ADMIN PORTAL ──────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════








// ─── SCHEMA EDITOR TAB (admin) ─────────────────────────────────────────────


// ─── USERS PANEL ──────────────────────────────────────────────────────────

















// ─── GUIDELINES PANEL ─────────────────────────────────────────────────────








// ─── AUDIT LOGS PANEL ─────────────────────────────────────────────────────
let currentAuditFilterUserId = '';
let currentAuditFilterUserSearch = '';
let currentAuditFilterAdminId = '';
let currentAuditFilterDistrict = '';
let currentAuditFilterCategory = '';
let currentAuditFilterStartDate = '';
let currentAuditFilterEndDate = '';



// ─── DATA MANAGEMENT PANEL ────────────────────────────────────────────────



// ═══════════════════════════════════════════════════════════════════════════
// ─── USER PORTAL ───────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════






// ─── USER DASHBOARD (COMMENTED OUT LEGACY CODE) ────────────────────────────
/*
export function renderUserDashboard(container) {
  const user = getCurrentUser();
  const apps = getApplicationsByUser(user.id);
  const unread = getUnreadCount(user.id);
  const rawUserAssignments = getAssignments ? getAssignments(user.id) : [];
  const userAssignments = rawUserAssignments.filter(isAssignmentValid);

  const assignedVal = userAssignments.filter(a => {
    const edition = getEditionById(a.editionId);
    if (!edition || edition.status !== 'published') return false;
    const existingApp = apps.find(ap => ap.editionId === a.editionId);
    if (!existingApp) return true;
    const ans = getAnswersByApplication(existingApp.id);
    if (a.type === 'Question') {
      const qId = a.questionId || a.fieldId;
      const answered = ans.some(an => an.fieldId === qId && an.value && an.value.trim() !== '');
      return !answered;
    } else {
      const secId = a.sectionId || a.reformAreaId;
      const fields = getFieldsBySection(secId);
      const answered = fields.some(f => ans.some(an => an.fieldId === f.id && an.value && an.value.trim() !== ''));
      return !answered;
    }
  }).length;

  const draftVal = apps.filter(a => a.status === 'Draft').length;

  const submittedVal = apps.filter(a => ['Submitted', 'Resubmitted', 'Under Review', 'Additional Documents Requested'].includes(a.status)).length;
  const approvedVal = apps.filter(a => a.status === 'Approved').length;
  const rejectedVal = apps.filter(a => a.status === 'Rejected').length;

  const kpis = [
    { label: 'Assigned', value: assignedVal, color: '#8b5cf6', tab: 'apply' },
    { label: 'Drafts', value: draftVal, color: '#d97706', tab: 'drafts' },
    { label: 'Submitted', value: submittedVal, color: '#0284c7', tab: 'submitted' },
    { label: 'Approved', value: approvedVal, color: '#10b981', tab: 'approved' },
    { label: 'Rejected', value: rejectedVal, color: '#ef4444', tab: 'rejected' }
  ];

  // Separate applications into active (Draft) and submitted (everything else)
  const activeApps = apps.filter(a => a.status === 'Draft');
  const submittedApps = apps.filter(a => a.status !== 'Draft');

  const createCardHtml = (app) => {
    const edition = getEditionById(app.editionId);
    const score = calculateApplicationScore(app.id);
    const maxScore = calculateApplicationMaxScore(app.id) || 1;
    const pct = ((score / maxScore) * 100).toFixed(1);
    const answers = getAnswersByApplication(app.id);
    const approvedCount = answers.filter(a => a.questionStatus === 'Approved').length;
    const pendingCount = answers.filter(a => a.questionStatus === 'Submitted').length;
    const hasAnyScore = score > 0 || approvedCount > 0;
    const hasBeenReviewed = ['Approved', 'Rejected', 'Additional Documents Requested'].includes(app.status) || hasAnyScore;
    const statusCls = _statusClass(app.status);
    const scoreDisplay = hasBeenReviewed ? score : '—';
    const maxScoreDisplay = hasBeenReviewed ? `/ ${maxScore}` : '';
    const pctDisplay = hasBeenReviewed ? `${pct}%` : '—';

    return `
      <div class="app-summary-card app-card-clickable" data-id="${app.id}" style="cursor:pointer; transition:transform 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
        <div class="app-card-header">
          <code class="app-id-code" style="font-size:11px;">${app.id}</code>
          <span class="status-badge ${statusCls}" style="font-size:10px;">${_statusLabel(app.status)}</span>
        </div>
        <div class="app-card-body">
          <p class="app-edition" style="font-weight:700; color:var(--text-main); margin-bottom:8px;">${edition?.name || 'Unknown Edition'}</p>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <span style="font-size:12.5px; color:var(--text-muted);">Score:</span>
            <span style="font-size:13.5px; font-weight:700; color:var(--accent-indigo)">${scoreDisplay} <span style="font-size:11.5px; font-weight:normal; color:var(--text-muted);">${maxScoreDisplay}</span></span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <span style="font-size:12.5px; color:var(--text-muted);">Percentage:</span>
            <span style="font-size:13.5px; font-weight:700; color:var(--success)">${pctDisplay}</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; font-size:11px; color:var(--text-muted); border-top:1px dashed var(--border-color); padding-top:6px; margin-top:6px;">
            <span>Approved: <strong>${approvedCount}</strong></span>
            <span>Pending: <strong>${pendingCount}</strong></span>
          </div>
          <p class="app-date" style="font-size:11px; color:var(--text-muted); margin-top:4px;">Updated: ${new Date(app.updatedAt).toLocaleDateString('en-IN')}</p>
        </div>
        <div class="app-card-footer">
          ${app.status === 'Draft' ? `<button class="btn btn-xs btn-primary btn-continue-app" data-id="${app.id}">Continue Editing</button>` : ''}
          ${app.status === 'Rejected' ? `<button class="btn btn-xs btn-warning btn-resubmit-app" data-id="${app.id}">Resubmit</button>` : ''}
          <button class="btn btn-xs btn-outline btn-view-my-app" data-id="${app.id}">View</button>
        </div>
      </div>
    `;
  };

  const activeCardsHtml = activeApps.slice(0, 6).map(createCardHtml).join('');
  const submittedCardsHtml = submittedApps.slice(0, 6).map(createCardHtml).join('');

  // Deduplicate user assignments to ensure each task is shown only once
  const uniqueAssignments = [];
  const assignmentKeys = new Set();
  for (const a of userAssignments) {
    const edition = getEditionById(a.editionId);
    if (!edition || edition.isDeleted) continue; // Only show active non-deleted tasks

    // Check if there's already a submitted application for this edition
    const existingApp = apps.find(app => app.editionId === a.editionId);
    if (existingApp && existingApp.status !== 'Draft') continue; // Hide if already submitted

    const key = `${a.editionId}_${a.sectionId || a.reformAreaId || ''}_${a.type || 'General'}_${a.responsibility || a.title || ''}`;
    if (!assignmentKeys.has(key)) {
      assignmentKeys.add(key);
      uniqueAssignments.push(a);
    }
  }

  const taskCards = uniqueAssignments.map(a => {
    const edition = getEditionById(a.editionId);
    const typeLabel = a.type || 'General';
    let typeColor = '#4f46e5';
    let typeBg = 'rgba(79,70,229,0.08)';
    if (a.type === 'Action Point') {
      typeColor = '#d97706';
      typeBg = 'rgba(217,119,6,0.08)';
    } else if (a.type === 'Question') {
      typeColor = '#10b981';
      typeBg = 'rgba(16,185,129,0.08)';
    }
    
    let taskName = a.responsibility;
    if (!taskName || taskName === 'undefined') {
      if (a.type === 'Question') {
        const field = getFieldById(a.questionId || a.fieldId);
        if (field) {
          taskName = field.num ? `Q${field.num}: ${field.label || field.text}` : (field.label || field.text);
        }
      } else if (a.type === 'Action Point') {
        taskName = a.title || a.actionPointId || 'Action Point Task';
      } else {
        const allSections = getSectionsByEdition(a.editionId) || [];
        const section = allSections.find(s => s.id === (a.sectionId || a.reformAreaId));
        if (section) {
          taskName = section.name || section.title;
        }
      }
    }
    if (!taskName || taskName === 'undefined') {
      taskName = a.title || a.sectionId || 'Compliance Task';
    }

    return `
      <div class="task-summary-card" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; padding:14px 16px; display:flex; flex-direction:column; justify-content:space-between; box-shadow:var(--shadow-sm); transition:all var(--transition-fast);">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <span style="font-size:11px; font-weight:600; color:var(--text-muted); text-transform:uppercase;">${edition?.name || 'SRF Edition'}</span>
            <span style="font-size:10px; font-weight:700; padding:2px 8px; border-radius:99px; color:${typeColor}; background:${typeBg}; text-transform:uppercase; letter-spacing:0.04em;">${typeLabel}</span>
          </div>
          <p style="font-size:13px; font-weight:600; color:var(--text-main); line-height:1.45; margin:0 0 14px 0;">${taskName}</p>
        </div>
        <button class="btn btn-xs btn-primary btn-do-task" data-edition-id="${a.editionId}" data-sec-id="${a.sectionId || a.reformAreaId || ''}" style="width:100%; font-weight:600; margin-top:auto;">
          ⚡ Fill Form Section
        </button>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    ${unread > 0 ? `
      <div class="alert-box alert-info" style="margin-bottom:20px;cursor:pointer;" id="notif-alert-banner">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        You have <strong>${unread} unread notification${unread > 1 ? 's' : ''}</strong>. Click to view.
      </div>
    ` : ''}

    <div class="section-card" style="margin-bottom:24px;">
      <div class="section-badge" style="background:rgba(16,185,129,0.08);color:var(--success);border:1px solid rgba(16,185,129,0.15);">Welcome Back</div>
      <h1>${user.name || user.username}</h1>
      <p style="color:var(--text-muted);font-size:14px;">${user.organization || ''} ${user.state ? '· ' + user.state : ''}</p>
    </div>

    <div class="stats-grid" style="margin-bottom:28px;">
      ${kpis.map(k => {
        let tab = 'apply';
        if (k.label === 'Total Applications') tab = 'apply';
        else if (k.label === 'Assigned') tab = 'apply';
        else if (k.label === 'Drafts') tab = 'drafts';
        else if (k.label === 'Submitted') tab = 'submitted';
        else if (k.label === 'Approved') tab = 'approved';
        else if (k.label === 'Rejected') tab = 'rejected';
        
        return `
        <div class="stat-card kpi-card-clickable" data-tab="${tab}" style="cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
          <div class="stat-info">
            <h3 style="color:${k.color};font-size:26px;font-weight:800;">${k.value}</h3>
            <p style="font-size:13px;color:var(--text-muted);">${k.label}</p>
          </div>
        </div>
        `;
      }).join('')}
    </div>

    ${uniqueAssignments.length > 0 ? `
      <div style="margin-bottom:32px;">
        <h2 style="font-family:var(--font-title); font-size:17px; font-weight:700; margin-bottom:16px; display:flex; align-items:center; gap:8px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-indigo)" stroke-width="2.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          Assigned Tasks & Responsibilities
        </h2>
        <div class="assigned-tasks-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(290px, 1fr)); gap:16px;">
          ${taskCards}
        </div>
      </div>
    ` : ''}

    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h2 style="font-family:var(--font-title);font-size:18px;font-weight:700;">Active Tasks</h2>
      <button class="btn btn-primary btn-sm" id="btn-new-app-dash">+ Explore Applications</button>
    </div>

    ${activeApps.length === 0 ? `
      <div class="empty-state">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--border-color)" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <h3>No active tasks</h3>
        <p>Start by clicking "+ Explore Applications" to submit your first SRF compliance application.</p>
        <button class="btn btn-primary" id="btn-start-first-app">Explore Applications</button>
      </div>
    ` : `<div class="app-cards-grid">${activeCardsHtml}</div>`}

    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:32px;margin-bottom:16px;">
      <h2 style="font-family:var(--font-title);font-size:18px;font-weight:700;">Submitted Tasks</h2>
    </div>

    ${submittedApps.length === 0 ? `
      <div class="empty-state" style="padding:20px;">
        <p style="color:var(--text-muted);font-size:14px;margin:0;">You haven't submitted any tasks yet.</p>
      </div>
    ` : `<div class="app-cards-grid">${submittedCardsHtml}</div>`}
  `;

  container.querySelector('#notif-alert-banner')?.addEventListener('click', () => switchUserTab('notifications'));
  container.querySelector('#btn-new-app-dash')?.addEventListener('click', () => switchUserTab('assigned-editions'));
  container.querySelector('#btn-start-first-app')?.addEventListener('click', () => switchUserTab('assigned-editions'));

  container.querySelectorAll('.kpi-card-clickable').forEach(card => {
    card.addEventListener('click', () => {
      const tab = card.dataset.tab;
      activeUserTab = tab;
      renderUserSidebar();
      switchUserTab(tab);
    });
  });

  // Make the entire app card clickable
  container.querySelectorAll('.app-card-clickable').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.tagName.toLowerCase() === 'button') return; // let the buttons handle their own clicks
      const appRecord = getApplicationById(card.dataset.id);
      if (appRecord?.status === 'Draft' || appRecord?.status === 'Rejected') {
        openApplicationForm(card.dataset.id, container);
      } else {
        openApplicationDetail(card.dataset.id, container);
      }
    });
  });

  container.querySelectorAll('.btn-continue-app, .btn-resubmit-app').forEach(btn => {
    btn.addEventListener('click', () => {
      const appId = btn.dataset.id;
      const appRecord = getApplicationById(appId);
      if (appRecord && appRecord.status === 'Rejected') {
        updateApplication(appId, { status: 'Draft' });
        addTimelineEntry(appId, 'Application reopened for resubmission', user.id);
        addAuditLog(user.id, `Application resubmission started: ${appId}`, 'application', appId);
      }
      openApplicationForm(appId, container);
    });
  });

  container.querySelectorAll('.btn-view-my-app').forEach(btn => {
    btn.addEventListener('click', () => openApplicationDetail(btn.dataset.id, container));
  });

  container.querySelectorAll('.btn-do-task').forEach(btn => {
    btn.addEventListener('click', () => {
      const editionId = btn.dataset.editionId;
      const secId = btn.dataset.secId;
      if (secId) {
        activeSectionId = secId;
      }
      const existing = apps.find(a => a.editionId === editionId);
      if (existing) {
        openApplicationForm(existing.id, container);
      } else {
        startNewApplication(editionId, container);
      }
    });
  });
}
*/

// ─── NEW APPLICATION PAGE ─────────────────────────────────────────────────
















export async function openApplicationForm(appId, container, allowRemainingUploads = null) {
  window.workspaceLock = true;
  activeApplicationId = appId;
  activeUserFormContainer = container;

  const app = getApplicationById(appId);
  if (!app) return;
  const user = getCurrentUser();

  // Clear existing heartbeat
  if (window.formLockHeartbeat) {
    clearInterval(window.formLockHeartbeat);
    window.formLockHeartbeat = null;
  }

  // Check Lock Status
  const lockStatus = await getLockStatus(appId);
  if (lockStatus.locked && lockStatus.userId !== user.id) {
    const lockUser = lockStatus.username || lockStatus.lockedBy;
    const expiryMin = lockStatus.durationRemaining !== undefined ? Math.ceil(lockStatus.durationRemaining / 60) : '?';
    container.innerHTML = `
      <div class="section-card" style="margin-bottom: 24px; text-align: center; padding: 40px 20px;">
        <div style="font-size: 48px; margin-bottom: 16px;">🔒</div>
        <h2 style="color: var(--danger);">Application is Locked for Editing</h2>
        <p style="font-size: 14px; color: var(--text-muted); max-width: 500px; margin: 8px auto 24px auto;">
          This application is currently locked by <strong>${lockUser}</strong> (Reason: ${lockStatus.reason || 'Editing'}).
          The lock will automatically expire in approximately <strong>${expiryMin} minutes</strong>.
        </p>
        <div style="display:flex; justify-content:center; gap:12px;">
          <button class="btn btn-secondary" id="btn-lock-back">Go Back</button>
          ${user.role === 'superadmin' ? `<button class="btn btn-danger" id="btn-lock-force-unlock">Force Unlock (Super Admin)</button>` : ''}
        </div>
      </div>
    `;
    container.querySelector('#btn-lock-back').addEventListener('click', () => {
      window.workspaceLock = false;
      activeUserTab = 'dashboard';
      const sb = document.getElementById('sidebar-nav-container');
      if (sb) sb.innerHTML = '';
      renderUserSidebar();
      switchUserTab('dashboard');
    });
    if (user.role === 'superadmin') {
      container.querySelector('#btn-lock-force-unlock').addEventListener('click', async () => {
        const confirmResult = await showConfirm({
          title: 'Force Unlock Application',
          message: 'Are you sure you want to release the edit lock? Unsaved modifications by the active editor will not be persisted.',
          confirmText: 'Release Lock',
          cancelText: 'Cancel'
        });
        if (confirmResult) {
          const unlockRes = await releaseLock(appId, true, 'Super Admin Force Override');
          if (unlockRes.success) {
            showToast('Lock overridden!', 'success');
            openApplicationForm(appId, container);
          } else {
            showAlert({ title: 'Override Failed', message: 'Failed to release lock.', type: 'error' });
          }
        }
      });
    }
    return;
  }

  // Not locked: Acquire Lock
  const acquireRes = await acquireLock(appId, 'Editing Application Form');
  if (!acquireRes.success) {
    showAlert({ title: 'Lock Acquisition Failed', message: acquireRes.error || 'Could not lock application.', type: 'error' });
    return;
  }

  // Start heartbeat renewal
  window.formLockHeartbeat = setInterval(async () => {
    await acquireLock(appId, 'Heartbeat renewal');
  }, 30000);

  if (allowRemainingUploads !== null) {
    currentFormAllowRemainingUploads = allowRemainingUploads;
  } else {
    if (app && app.status === 'Additional Documents Requested') {
      currentFormAllowRemainingUploads = true;
    } else {
      currentFormAllowRemainingUploads = false;
    }
  }
  pushToNavHistory({ role: 'user', tab: 'form', appId });
  activeUserTab = 'form';

  if (user.role === 'user' && app.userId !== user.id) {
    showAlert({ title: 'Access Denied', message: 'You are not authorized to view this application.', type: 'error' });
    activeUserTab = 'dashboard';
    renderUserSidebar();
    switchUserTab('dashboard');
    return;
  }
  const edition = getEditionById(app.editionId);
  if (!edition || edition.status !== 'published') {
    showAlert({
      title: 'Edition Unavailable',
      message: 'This edition is currently unavailable.',
      type: 'warning'
    });
    activeUserTab = 'dashboard';
    renderUserSidebar();
    switchUserTab('dashboard');
    return;
  }
  const allSections = getSectionsByEdition(app.editionId);
  const sections = allSections.filter(sec => isSectionAssignedToUser(sec, user));

  if (!activeSectionId || !sections.find(s => s.id === activeSectionId)) {
    // Try to restore last active section from sessionStorage (for drafts)
    let restoredSection = false;
    try {
      const posRaw = sessionStorage.getItem(`srf_draft_pos_${appId}`);
      if (posRaw) {
        const pos = JSON.parse(posRaw);
        if (pos && pos.sectionId && sections.find(s => s.id === pos.sectionId)) {
          activeSectionId = pos.sectionId;
          restoredSection = true;
        }
      }
    } catch(e) {}
    if (!restoredSection) activeSectionId = sections[0]?.id;
  }

  const answers = getAnswersByApplication(appId);
  const answersMap = {};
  answers.forEach(a => { answersMap[a.fieldId] = a; });

  const isAppDraft = app.status === 'Draft';
  const hasResubmissionRequests = answers.some(ans => ans.questionStatus === 'Rejected' || ans.questionStatus === 'Additional Documents Requested' || ans.questionStatus === 'Docs Requested');
  const isFrozen = !isAppDraft && !hasResubmissionRequests;

  // Sidebar section nav (integrated with main nav bar via renderUserSidebar)
  renderUserSidebar();

  const activeSection = sections.find(s => s.id === activeSectionId) || sections[0];
  let sectionFields = activeSection ? getFieldsBySection(activeSection.id) : [];
  sectionFields = sectionFields.filter(f => isFieldAssignedToUser(f, user));

  const currentIdx = sections.findIndex(s => s.id === activeSectionId);
  const prevSec = currentIdx > 0 ? sections[currentIdx - 1] : null;
  const nextSec = currentIdx < sections.length - 1 ? sections[currentIdx + 1] : null;

  const navButtonsHtml = `
    <div class="form-navigation-row" style="display:flex; justify-content:space-between; margin-top:24px; border-top:1px solid var(--border-color); padding-top:16px;">
      ${prevSec ? `
        <button class="btn btn-secondary btn-sm" id="btn-prev-section" data-sec="${prevSec.id}">
          ← Previous: ${prevSec.name || prevSec.title || ''}
        </button>
      ` : '<div></div>'}
      ${nextSec ? `
        <button class="btn btn-primary btn-sm" id="btn-next-section" data-sec="${nextSec.id}">
          Next: ${nextSec.name || nextSec.title || ''} →
        </button>
      ` : '<div></div>'}
    </div>
  `;

  // Render questions
  // Group fields by Action Point
  const apGroups = [];
  const apMap = {};
  sectionFields.forEach(field => {
    const apId = field.actionPointId || 'general_ap';
    const apTitle = field.actionPointTitle || 'Action Point';
    if (!apMap[apId]) {
      apMap[apId] = { id: apId, title: apTitle, fields: [] };
      apGroups.push(apMap[apId]);
    }
    apMap[apId].fields.push(field);
  });

  // Render questions grouped under Action Point blue lines
  const questionsHtml = apGroups.map(group => {
    const apHeaderHtml = `
      <div class="ap-group-header" style="margin-top:32px; margin-bottom:16px; border-bottom:2px solid var(--accent-indigo); padding-bottom:6px;">
        <h3 style="font-family:var(--font-title); font-size:14px; font-weight:700; color:var(--accent-indigo); margin:0; display:flex; align-items:center; gap:8px; text-transform:uppercase; letter-spacing:0.03em;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:2px;"><polyline points="20 6 9 17 4 12"/></svg>
          ${group.title}
        </h3>
      </div>
    `;

    const fieldsHtml = group.fields.map(field => {
      const existingAnswer = answersMap[field.id];
      const val = existingAnswer?.value || '';
      const guidelines = getGuidelines({ fieldId: field.id });

      // Automatic Guidelines PDF Hyperlink (offset from page 9)
      const pageNum = getGuidelinePageForQuestion(field.num);
      const pdfGuideHtml = pageNum ? `
        <a href="/SRF_6_Framework_VF.pdf#page=${pageNum}" target="_blank" class="guideline-link" title="Open DPIIT Guidelines PDF on page ${pageNum}" style="background:rgba(99,102,241,0.08); color:var(--accent-indigo); padding:4px 8px; border-radius:4px; font-weight:600; font-size:11.5px; display:inline-flex; align-items:center; gap:4px;">
          📄 DPIIT Guidelines (Page ${pageNum})
        </a>
      ` : '';

      const guidelineLinks = guidelines.map(g => `
        <a href="${g.url || '#'}" target="${g.url ? '_blank' : '_self'}" class="guideline-link" title="${g.title}">
          ${g.type === 'pdf' ? '📄' : g.type === 'video' ? '▶' : g.type === 'url' ? '🔗' : 'ℹ'} ${g.title}
        </a>
      `).join('');

      // Question statuses
      const isQuestionSubmitted = existingAnswer?.questionStatus === 'Submitted';
      const isQuestionApproved = existingAnswer?.questionStatus === 'Approved';
      const isQuestionRejected = existingAnswer?.questionStatus === 'Rejected';
      const isQuestionDocsReq = existingAnswer?.questionStatus === 'Additional Documents Requested' || existingAnswer?.questionStatus === 'Docs Requested';
      const isQuestionEditable = isAppDraft || isQuestionRejected || isQuestionDocsReq || !isQuestionFilled(existingAnswer, field);
      const freezeInputs = !isQuestionEditable;

      const inputHtml = renderFieldInput(field, val, freezeInputs, appId);

      let questionStatusBadge = '';
      if (existingAnswer?.questionStatus && existingAnswer?.questionStatus !== 'Draft') {
        const qStatusCls = _statusClass(existingAnswer.questionStatus);
        questionStatusBadge = `<span class="status-badge ${qStatusCls}" style="font-size:9px; vertical-align:middle; margin-left:8px;">${existingAnswer.questionStatus}</span>`;
      }

      // Score / Marks Text
      const scoreText = isQuestionApproved ? 
        `<span style="color:var(--success); font-weight:700; margin-left:8px;">[Score: ${existingAnswer?.questionScore || 0} / ${field.weight || 1}]</span>` : 
        `<span style="color:var(--text-dark); margin-left:8px;">[Marks: ${field.weight || 1}]</span>`;

      // Standard doc uploads
      const mandatoryDocs = (field.docs || []).filter(d => d.requirement === 'mandatory');
      const optionalDocs  = (field.docs || []).filter(d => d.requirement !== 'mandatory');

      const hasRejectedDocs = existingAnswer?.files?.some(f => f.fileStatus === 'Rejected');

      const docsHtml = [...mandatoryDocs, ...optionalDocs].map(doc => {
        const existing = existingAnswer?.files?.find(f => f.docId === doc.id);
        const isCustomSlot = doc.id.startsWith('custom_doc_');
        const isRejected = existing?.fileStatus === 'Rejected';
        return `
          <div class="doc-upload-row ${doc.requirement === 'mandatory' ? 'doc-mandatory' : 'doc-optional'}">
            <div class="doc-info">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span>${doc.name}</span>
            </div>
            <div class="doc-upload-action">
              ${existing ? `
                <div style="display:flex; flex-direction:column; align-items:flex-end; margin-right:8px;">
                  <span class="doc-uploaded" style="${isRejected ? 'color:var(--danger); font-weight:600;' : ''}">
                    ${isRejected ? '✕' : '✓'} <a href="#" class="user-view-doc-link" data-app-id="${appId}" data-field-id="${field.id}" data-doc-id="${doc.id}" data-doc-name="${existing.name}" style="text-decoration:underline; cursor:pointer; color:inherit;">${existing.name}</a>
                    ${existing.fileStatus ? `<span class="status-badge ${_statusClass(existing.fileStatus)}" style="font-size:9px; margin-left:4px;">${existing.fileStatus}</span>` : ''}
                  </span>
                  ${isRejected && existing.fileRejectionReason ? `
                    <span style="color:var(--danger); font-size:11px; margin-top:2px;">Reason: ${existing.fileRejectionReason}</span>
                  ` : ''}
                </div>
              ` : ''}
              ${isCustomSlot && isQuestionEditable ? `
                <button class="btn btn-xs btn-outline btn-delete-doc-slot" data-field-id="${field.id}" data-doc-id="${doc.id}" style="color:var(--danger); border-color:rgba(239,68,68,0.2); margin-right:4px;">✕ Delete Slot</button>
              ` : ''}
              ${(isQuestionEditable && existing?.fileStatus !== 'Approved') || isRejected ? `
                <label class="btn btn-xs btn-outline btn-upload-doc" style="cursor:pointer;">
                  ${existing ? 'Replace' : 'Upload'}
                  <input type="file" class="doc-file-input hidden" data-app-id="${appId}" data-field-id="${field.id}" data-doc-id="${doc.id}" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.zip,.xlsx,.csv">
                </label>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');

      // Custom Document Uploads Widget ("Other" for multiple file uploads)
      const standardDocIds = (field.docs || []).map(d => d.id);
      const customFiles = (existingAnswer?.files || []).filter(f => !standardDocIds.includes(f.docId));

      const customDocsHtml = customFiles.map(f => {
        const isRejected = f.fileStatus === 'Rejected';
        return `
          <div class="doc-upload-row doc-optional" style="border-style: dashed; border-color: var(--primary);">
            <div class="doc-info">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span>${f.customLabel || 'Other Document'}</span>
              <span class="doc-req-tag tag-optional" style="background:rgba(99, 102, 241, 0.08); color:var(--accent-indigo)">Other</span>
            </div>
            <div class="doc-upload-action">
              <div style="display:flex; flex-direction:column; align-items:flex-end; margin-right:8px;">
                <span class="doc-uploaded" style="${isRejected ? 'color:var(--danger); font-weight:600;' : ''}">
                  ${isRejected ? '✕' : '✓'} <a href="#" class="user-view-doc-link" data-app-id="${appId}" data-field-id="${field.id}" data-doc-id="${f.docId}" data-doc-name="${f.name}" style="text-decoration:underline; cursor:pointer; color:inherit;">${f.name}</a>
                  ${f.fileStatus ? `<span class="status-badge ${_statusClass(f.fileStatus)}" style="font-size:9px; margin-left:4px;">${f.fileStatus}</span>` : ''}
                </span>
                ${isRejected && f.fileRejectionReason ? `
                  <span style="color:var(--danger); font-size:11px; margin-top:2px;">Reason: ${f.fileRejectionReason}</span>
                ` : ''}
              </div>
              ${isQuestionEditable && f.fileStatus !== 'Approved' ? `
                <button class="btn btn-xs btn-outline btn-delete-custom-doc" data-field-id="${field.id}" data-doc-id="${f.docId}" style="color:var(--danger); border-color:rgba(239,68,68,0.2); margin-right:4px;">✕ Remove</button>
                <label class="btn btn-xs btn-outline btn-upload-doc" style="cursor:pointer;">
                  Replace
                  <input type="file" class="doc-file-input hidden" data-app-id="${appId}" data-field-id="${field.id}" data-doc-id="${f.docId}" data-custom-label="${f.customLabel || 'Other Document'}" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.zip,.xlsx,.csv">
                </label>
              ` : isRejected ? `
                <label class="btn btn-xs btn-outline btn-upload-doc" style="cursor:pointer;">
                  Replace
                  <input type="file" class="doc-file-input hidden" data-app-id="${appId}" data-field-id="${field.id}" data-doc-id="${f.docId}" data-custom-label="${f.customLabel || 'Other Document'}" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.zip,.xlsx,.csv">
                </label>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');

      // Actions/Status block for all fields
      const canEdit = isQuestionEditable;
      const actionsRowHtml = `
        <div class="field-actions-row" style="margin-top:16px; padding:12px; background:rgba(15,23,42,0.02); border-radius:8px; border:1px dashed var(--border-color); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          ${canEdit ? `
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <label class="btn btn-xs btn-outline" style="cursor:pointer; height:32px; font-size:12px; display:inline-flex; align-items:center; gap:4px; border-style:dashed;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 12l2 2 4-4"/><path d="M20.42 10.18a8.87 8.87 0 0 0-14.7-2.06 6 6 0 0 0-.15 11.88"/></svg>
                Upload Multiple Files
                <input type="file" class="other-doc-file-input hidden" data-app-id="${appId}" data-field-id="${field.id}" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.zip,.xlsx,.csv" multiple>
              </label>
            </div>
          ` : '<div></div>'}
          
          <div class="submit-action-wrap">
            ${isQuestionEditable || hasRejectedDocs ? `
              <button class="btn btn-xs btn-primary btn-submit-question" data-field-id="${field.id}" style="height:32px; padding:0 14px; font-size:12px; font-weight:700;">
                ✓ Save Question
              </button>
            ` : isQuestionSubmitted ? `
              <span style="font-size:12.5px; color:var(--accent-blue); font-weight:600; display:inline-flex; align-items:center; gap:4px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Saved
              </span>
            ` : isQuestionApproved ? `
              <span style="font-size:12.5px; color:var(--success); font-weight:600; display:inline-flex; align-items:center; gap:4px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                ✓ Approved
              </span>
            ` : ''}
          </div>
        </div>
      `;

      let canvasFieldsHtml = '';
      let elementsList = field.elements || [];
      if (typeof elementsList === 'string') {
        try {
          elementsList = JSON.parse(elementsList);
        } catch (e) {
          elementsList = [];
        }
      }
      const hasCustomElements = Array.isArray(elementsList) && elementsList.length > 0 && !(elementsList.length === 1 && (elementsList[0].id.startsWith('el_srf6_') || elementsList[0].id.startsWith('main_el_')));
      if (hasCustomElements) {
        let valuesMap = {};
        if (val) {
          try { valuesMap = JSON.parse(val); } catch (e) { valuesMap = { "legacy": val }; }
        }
        canvasFieldsHtml = elementsList.map(el => {
          const elVal = valuesMap[el.id] || (el.type === field.fieldType ? val : '');
          return renderUserElementInput(el, field.id, elVal, freezeInputs, appId);
        }).join('');
      } else {
        canvasFieldsHtml = `<div class="question-input-wrap">${inputHtml}</div>`;
      }

      const hasDocs = (field.docs && field.docs.length > 0) || (field.uploadRequirement && field.uploadRequirement !== 'none');
      const isPureLayout = Array.isArray(elementsList) && elementsList.length > 0 && elementsList.every(el => ['heading','subheading','description','instruction','divider','card','banner','hyperlink'].includes(el.type));
      const isLegacyLayout = (!field.elements || field.elements.length === 0) && ['heading','subheading','description','instruction','divider','card','banner','notes','warning','image','hyperlink'].includes(field.fieldType);
      
      const fieldLinkHtml = (field.url && field.url !== '#') ? `
        <a href="${field.url}" target="_blank" class="guideline-link" title="Reference Link" style="background:rgba(99,102,241,0.08); color:var(--accent-indigo); padding:4px 8px; border-radius:4px; font-weight:600; font-size:11.5px; display:inline-flex; align-items:center; gap:4px;">
          🔗 Reference Link
        </a>
      ` : '';

      if (isPureLayout || isLegacyLayout) {
        return `
          <div class="layout-element-group" id="qg-${field.id}" style="margin-bottom:18px;">
            ${canvasFieldsHtml}
            ${fieldLinkHtml ? `<div style="margin-top:4px; margin-bottom:8px;">${fieldLinkHtml}</div>` : ''}
            ${hasDocs ? `
              <div class="doc-uploads-section" style="margin-top:12px;">
                <div class="doc-uploads-label">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Supporting Documents
                </div>
                ${docsHtml}
                ${customDocsHtml}
                ${actionsRowHtml}
              </div>
            ` : ''}
          </div>
        `;
      }

      return `
        <div class="question-group" id="qg-${field.id}" data-field-id="${field.id}" style="margin-bottom:24px; padding-bottom:16px; border-bottom:1px solid var(--border-color);">
          <div class="question-header">
            <div class="question-title-block">
              <span class="question-num">${field.num || ''}</span>
              <span class="question-text">${field.text}${field.mandatory ? ' <span class="required-star">*</span>' : ''} ${scoreText} ${questionStatusBadge}</span>
            </div>
            <div class="question-guidelines" style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
              ${pdfGuideHtml}
              ${fieldLinkHtml}
              ${guidelineLinks}
            </div>
          </div>
          ${field.helpText ? `<div class="question-help-text">${field.helpText}</div>` : ''}
          <div class="question-input-wrap">${canvasFieldsHtml}</div>
          
          <div class="doc-uploads-section" style="margin-top:12px;">
            <div class="doc-uploads-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Supporting Documents
            </div>
            ${docsHtml}
            ${customDocsHtml}
            ${actionsRowHtml}
          </div>
        </div>
      `;
    }).join('');

    return apHeaderHtml + fieldsHtml;
  }).join('');

  container.innerHTML = `
    <div style="margin-bottom:16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
      <button class="btn btn-secondary btn-sm" id="btn-back-to-user-dash">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        Dashboard
      </button>
      <div class="breadcrumbs-container" style="font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;font-family:var(--font-body);">
        <a href="#" class="breadcrumb-link" data-breadcrumb="dashboard" style="color:var(--primary);text-decoration:none;font-weight:500;transition:color var(--transition-fast);">Dashboard</a>
        <span>&gt;</span>
        <a href="#" class="breadcrumb-link" data-breadcrumb="explore" style="color:var(--primary);text-decoration:none;font-weight:500;transition:color var(--transition-fast);">Explore Applications</a>
        <span>&gt;</span>
        <span style="color:var(--text-muted);font-weight:500;">${edition?.name}</span>
        <span>&gt;</span>
        <span style="color:var(--text-main);font-weight:600;">${activeSection?.name || activeSection?.title || ''}</span>
      </div>
      ${isFrozen ? `<span class="status-badge status-submitted" style="margin-left:auto;">${app.status}</span>` : `
        <div style="margin-left:auto;display:flex;gap:8px;">
          <button class="btn btn-secondary btn-sm" id="btn-save-draft">💾 Save & Exit</button>
          <button class="btn btn-success-solid btn-sm" id="btn-submit-reform-area">✓ Submit Reform Area</button>
          <button class="btn btn-primary btn-sm" id="btn-submit-app">Submit Entire Application</button>
        </div>
      `}
    </div>

    <div class="section-card section-intro" style="margin-bottom:24px;">
      <div class="section-badge">${edition?.name}</div>
      <h1>${activeSection?.name || activeSection?.title || ''}</h1>
      <p>${activeSection?.description || activeSection?.desc || ''}</p>
    </div>

    ${(() => {
      const prog = calculateApplicationProgress(appId);
      const pct = prog.percentage;
      const barColor = pct >= 100 ? '#10b981' : pct >= 60 ? '#6366f1' : '#f59e0b';
      return `
        <div id="app-progress-bar-wrap" style="background:rgba(255,255,255,0.04); border:1px solid var(--border-color); border-radius:12px; padding:14px 18px; margin-bottom:20px; display:flex; align-items:center; gap:14px;">
          <div style="flex:1;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span style="font-size:12.5px; font-weight:600; color:var(--text-main);">Overall Progress</span>
              <span style="font-size:12px; font-weight:700; color:${barColor};">${prog.completed} / ${prog.total} questions answered (${pct}%)</span>
            </div>
            <div style="background:rgba(255,255,255,0.06); border-radius:99px; height:7px; overflow:hidden;">
              <div style="width:${pct}%; height:100%; background:${barColor}; border-radius:99px; transition:width 0.5s ease;"></div>
            </div>
          </div>
        </div>
      `;
    })()}
    ${app.status === 'Rejected' && app.rejectionReason ? `
      <div class="alert-box alert-danger" style="margin-bottom:20px;">
        <strong>Rejected:</strong> ${app.rejectionReason}
        <p style="margin-top:6px;font-size:13px;">Please address the issues above and resubmit your application.</p>
      </div>
    ` : ''}
    ${app.status === 'Additional Documents Requested' ? `
      <div class="alert-box alert-warning" style="margin-bottom:20px;">
        <strong>Additional Documents Requested:</strong> ${app.additionalDocsNote}
      </div>
    ` : ''}

    <div class="card glass-card">
      <div class="card-body p-0">
        <div id="form-questions">${questionsHtml || '<div class="empty-state"><p>No questions in this section yet.</p></div>'}</div>
      </div>
    </div>

    ${navButtonsHtml}




    ${!isFrozen ? `
      <div style="display:flex;gap:12px;margin-top:24px;justify-content:flex-end;">
        <button class="btn btn-secondary" id="btn-save-draft-bottom">💾 Save & Exit</button>
        <button class="btn btn-success-solid" id="btn-submit-reform-area-bottom">✓ Submit Reform Area</button>
        <button class="btn btn-primary" id="btn-submit-app-bottom">✓ Submit Entire Application</button>
      </div>
    ` : ''}
  `;

  // Dynamic Upload Disabler for "No" Selection
  const toggleUploadsForNoRadio = () => {
    container.querySelectorAll('.question-group, .layout-element-group').forEach(qg => {
      const checkedRadios = Array.from(qg.querySelectorAll('input[type="radio"]:checked'));
      const isNo = checkedRadios.some(r => r.value === 'No');
      
      const uploadActions = qg.querySelectorAll('.btn-upload-doc, .other-doc-file-input, .btn-delete-custom-doc, .btn-delete-doc-slot');
      uploadActions.forEach(el => {
        const target = el.tagName === 'LABEL' ? el : (el.closest('label') || el);
        if (target) {
          target.style.opacity = isNo ? '0.4' : '1';
          target.style.pointerEvents = isNo ? 'none' : 'auto';
        }
      });
    });
  };
  toggleUploadsForNoRadio();

  // Restore last scroll position for this draft
  try {
    const posRaw = sessionStorage.getItem(`srf_draft_pos_${appId}`);
    if (posRaw) {
      const pos = JSON.parse(posRaw);
      if (pos && typeof pos.scrollY === 'number') {
        requestAnimationFrame(() => window.scrollTo({ top: pos.scrollY, behavior: 'instant' }));
      }
    }
  } catch(e) {}

  // Compliance Radio Listeners
  container.querySelectorAll('.q-compliance-radio').forEach(radio => {
    radio.addEventListener('change', () => {
      const fieldId = radio.dataset.fieldId;
      saveAnswerCompliance(appId, fieldId, radio.value);
      showToast('Compliance self-assessment saved.', 'info');
    });
  });

  // Individual Save Question Listener
  container.querySelectorAll('.btn-submit-question').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const fieldId = btn.dataset.fieldId;

      // Read answer fresh from DB (answersMap can be stale if user just selected a radio)
      const freshAnswers = getAnswersByApplication(appId);
      const ans = freshAnswers.find(a => a.fieldId === fieldId);

      // Also check live DOM for radio value in case saveAnswerCompliance hasn't fired yet
      const liveRadio = container.querySelector(`input[type="radio"][data-field-id="${fieldId}"]:checked`);
      const liveInput = container.querySelector(`[data-field-id="${fieldId}"].user-field-input`);
      const liveVal = ans?.value || liveRadio?.value || liveInput?.value || '';

      // Only require text/choice input validation if the question actually renders input elements
      const hasInputs = container.querySelector(
        `input[data-field-id="${fieldId}"]:not([type="file"]), ` +
        `textarea[data-field-id="${fieldId}"], ` +
        `select[data-field-id="${fieldId}"], ` +
        `.user-field-input[data-field-id="${fieldId}"]`
      );

      if (hasInputs && !liveVal) {
        showAlert({
          title: "Can't Submit Question",
          message: "can't submit the question and whole application untill user fully fill the form",
          type: 'error'
        });
        return;
      }

      // If the live DOM has a value not yet persisted, save it first
      if (!ans?.value && liveVal) {
        saveAnswerCompliance(appId, fieldId, liveVal);
      }

      const res = submitQuestion(appId, fieldId, user.id);
      if (res.success) {
        showToast('Question saved successfully!', 'success');
        openApplicationForm(appId, container); // refresh
      } else {
        showAlert({
          title: "Can't Submit Question",
          message: `can't submit the question and whole application untill user fully fill the form<br><br><strong>Details:</strong> ${res.error || 'Failed to save question.'}`,
          type: 'error'
        });
      }
    });
  });

  // Custom Document File Input Listener
  container.querySelectorAll('.other-doc-file-input').forEach(fileInput => {
    fileInput.addEventListener('change', (e) => {
      const filesUploaded = e.target.files;
      if (!filesUploaded || filesUploaded.length === 0) return;
      const { fieldId } = fileInput.dataset;
      
      const existing = getAnswersByApplication(appId).find(a => a.fieldId === fieldId);
      const files = existing?.files ? [...existing.files] : [];
      
      const promises = Array.from(filesUploaded).map((file, i) => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const docId = 'custom_doc_' + Date.now() + '_' + i + '_' + Math.random().toString(36).substr(2,4);
            const label = file.name;
            resolve({
              docId,
              name: file.name,
              size: file.size,
              type: file.type,
              customLabel: label,
              fileStatus: 'Pending',
              fileRejectionReason: '',
              uploadedAt: new Date().toISOString(),
              dataUrl: event.target.result
            });
          };
          reader.readAsDataURL(file);
        });
      });

      Promise.all(promises).then(async (newFiles) => {
        files.push(...newFiles);
        saveAnswer(appId, fieldId, existing?.value || '', files);
        // Directly persist files with dataUrls to server
        try {
          await fetch(`/api/files/${appId}/${fieldId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files })
          });
        } catch(e) { console.warn('[Upload] Direct file save failed, will sync on next save:', e); }
        forceSave();
        showToast(filesUploaded.length > 1 ? `${filesUploaded.length} files uploaded!` : `File uploaded successfully!`, 'success');
        openApplicationForm(appId, container); // refresh
      });
    });
  });

  // User Document View Listener
  container.querySelectorAll('.user-view-doc-link').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const { appId: aId, fieldId, docId, docName } = link.dataset;
      const ans = getAnswersByApplication(aId).find(a => a.fieldId === fieldId);
      let fileObj = (ans?.files || []).find(f => f.docId === docId) || (ans?.files || []).find(f => f.name === docName);

      if (!fileObj?.dataUrl) {
        try {
          link.textContent = 'Loading...';
          const res = await fetch(`/api/files/${aId}/${fieldId}`);
          if (res.ok) {
            const data = await res.json();
            const serverFiles = data.files || [];
            fileObj = serverFiles.find(f => f.docId === docId) || serverFiles.find(f => f.name === docName);
          }
        } catch(err) {
          console.error('[View] Failed to fetch file:', err);
        } finally {
          link.textContent = docName;
        }
      }

      if (fileObj && fileObj.dataUrl) {
        // Need to import or use dataURLtoObjectURL if not available, but it is imported at top in app.js
        const objectUrl = dataURLtoObjectURL(fileObj.dataUrl);
        showFileViewer({
          title: `Document: ${fileObj.name}`,
          dataUrl: objectUrl,
          fileName: fileObj.name
        });
      } else if (docId) {
        fetch(`/api/files/${aId}/${fieldId}/${docId}`)
          .then(res => {
            if (!res.ok) {
              if (res.status === 401 || res.status === 403) {
                throw new Error("Access Denied: You do not have permission to view this file.");
              }
              throw new Error("Failed to download file.");
            }
            return res.blob();
          })
          .then(blob => {
            const objectUrl = URL.createObjectURL(blob);
            showFileViewer({
              title: `Document Preview: ${fileObj ? fileObj.name : 'File'}`,
              dataUrl: objectUrl,
              fileName: fileObj ? fileObj.name : `document_${docId}`
            });
          })
          .catch(err => {
            showAlert({ title: 'Preview Failed', message: err.message, type: 'error' });
          });
      } else {
        showAlert({ title: 'Preview Unavailable', message: 'The file has no preview data or was not fully uploaded.', type: 'warning' });
      }
    });
  });

  // Delete Custom Document Listener
  container.querySelectorAll('.btn-delete-custom-doc').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const { fieldId, docId } = btn.dataset;
      const existing = getAnswersByApplication(appId).find(a => a.fieldId === fieldId);
      if (existing && existing.files) {
        const deletedFile = existing.files.find(f => f.docId === docId);
        if (deletedFile) {
          addToRecycleBin(deletedFile, appId, fieldId, getCurrentUser()?.username || 'user');
        }
        const updatedFiles = existing.files.filter(f => f.docId !== docId);
        saveAnswer(appId, fieldId, existing.value || '', updatedFiles);
        showToast('Other document removed.', 'info');
        openApplicationForm(appId, container); // refresh
      }
    });
  });

  // Delete Document Slot Listener
  container.querySelectorAll('.btn-delete-doc-slot').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const { fieldId, docId } = btn.dataset;
      const existing = getAnswersByApplication(appId).find(a => a.fieldId === fieldId);
      if (existing && existing.files) {
        const deletedFile = existing.files.find(f => f.docId === docId);
        if (deletedFile) {
          addToRecycleBin(deletedFile, appId, fieldId, getCurrentUser()?.username || 'user');
        }
        const updatedFiles = existing.files.filter(f => f.docId !== docId);
        saveAnswer(appId, fieldId, existing.value || '', updatedFiles);
        showToast('Document deleted.', 'info');
        openApplicationForm(appId, container); // refresh
      }
    });
  });

  // Next / Prev Section Navigation Listeners
  container.querySelector('#btn-prev-section')?.addEventListener('click', () => {
    activeSectionId = prevSec.id;
    openApplicationForm(appId, container);
  });
  container.querySelector('#btn-next-section')?.addEventListener('click', () => {
    activeSectionId = nextSec.id;
    openApplicationForm(appId, container);
  });

  const saveCustomCanvasAnswer = (fieldId) => {
    const questionGroup = container.querySelector(`#qg-${fieldId}`);
    if (!questionGroup) return;

    const valuesMap = {};

    // 1. Inputs (Text, TextArea, Select, Date, URL, File)
    questionGroup.querySelectorAll(`.user-el-input`).forEach(inp => {
      const elId = inp.dataset.elId;
      valuesMap[elId] = inp.value;
    });

    // 2. Checkboxes
    const cbMap = {};
    questionGroup.querySelectorAll(`.user-el-cb-input:checked`).forEach(chk => {
      const elId = chk.dataset.elId;
      if (!cbMap[elId]) cbMap[elId] = [];
      cbMap[elId].push(chk.value);
    });
    Object.keys(cbMap).forEach(elId => {
      valuesMap[elId] = cbMap[elId].join(', ');
    });

    // 3. Radios
    questionGroup.querySelectorAll(`.user-el-radio-input:checked`).forEach(rad => {
      const elId = rad.dataset.elId;
      valuesMap[elId] = rad.value;
    });

    // 4. Tables
    const tableMap = {};
    questionGroup.querySelectorAll(`.user-el-table-input`).forEach(cell => {
      const elId = cell.dataset.elId;
      const idx = parseInt(cell.dataset.rowIdx);
      if (!tableMap[elId]) tableMap[elId] = [];
      tableMap[elId][idx] = cell.value;
    });
    Object.keys(tableMap).forEach(elId => {
      valuesMap[elId] = tableMap[elId].join('|');
    });

    // Save
    const serializedVal = JSON.stringify(valuesMap);
    const existingAnswer = answersMap[fieldId];
    saveAnswer(appId, fieldId, serializedVal, existingAnswer?.files || []);
  };

  // Canvas Element Event Listeners
  container.querySelectorAll('.user-el-input, .user-el-cb-input, .user-el-radio-input, .user-el-table-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const fieldId = inp.dataset.fieldId;
      saveCustomCanvasAnswer(fieldId);
      toggleUploadsForNoRadio();
    });
  });

  // Answer listeners
  container.querySelectorAll('.field-answer-input').forEach(input => {
    input.addEventListener('change', () => {
      const fieldId = input.dataset.fieldId;
      const existingAnswer = answersMap[fieldId];
      saveAnswer(appId, fieldId, input.value, existingAnswer?.files || []);
      toggleUploadsForNoRadio();
    });
  });

  // Multiselect Listeners
  container.querySelectorAll('.multiselect-chk').forEach(input => {
    input.addEventListener('change', () => {
      const fieldId = input.dataset.fieldId;
      const chks = [...container.querySelectorAll(`.multiselect-chk[data-field-id="${fieldId}"]:checked`)];
      const val = chks.map(c => c.value).join(', ');
      const existingAnswer = answersMap[fieldId];
      saveAnswer(appId, fieldId, val, existingAnswer?.files || []);
    });
  });

  // Table Cell Listeners
  container.querySelectorAll('.table-cell-input').forEach(input => {
    input.addEventListener('change', () => {
      const fieldId = input.dataset.fieldId;
      const cells = [...container.querySelectorAll(`.table-cell-input[data-field-id="${fieldId}"]`)];
      cells.sort((a, b) => (parseInt(a.dataset.rowIdx) - parseInt(b.dataset.rowIdx)));
      const val = cells.map(c => c.value).join('|');
      const existingAnswer = answersMap[fieldId];
      saveAnswer(appId, fieldId, val, existingAnswer?.files || []);
    });
  });

  container.querySelectorAll('.doc-file-input').forEach(fileInput => {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const { appId: aid, fieldId, docId } = fileInput.dataset;
      
      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target.result;
        const existing = getAnswersByApplication(aid).find(a => a.fieldId === fieldId);
        const existingFile = existing?.files?.find(f => f.docId === docId);
        if (existingFile) {
          addToRecycleBin(existingFile, aid, fieldId, getCurrentUser()?.username || 'user');
        }
        const files = existing?.files ? [...existing.files.filter(f => f.docId !== docId)] : [];
        files.push({
          docId,
          name: file.name,
          size: file.size,
          type: file.type,
          fileStatus: 'Pending',
          fileRejectionReason: '',
          uploadedAt: new Date().toISOString(),
          dataUrl
        });
        saveAnswer(aid, fieldId, existing?.value || '', files);
        // Directly persist files with dataUrls to server
        try {
          await fetch(`/api/files/${aid}/${fieldId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files })
          });
        } catch(e) { console.warn('[Upload] Direct file save failed, will sync on next save:', e); }
        forceSave();
        showToast(`"${file.name}" uploaded!`, 'success');
        openApplicationForm(appId, container); // refresh
      };
      reader.readAsDataURL(file);
    });
  });


  // Navigation

  container.querySelector('#btn-back-to-user-dash')?.addEventListener('click', () => {
    window.workspaceLock = false;
    activeUserTab = 'dashboard';
    document.getElementById('sidebar-nav-container').innerHTML = '';
    renderUserSidebar();
    switchUserTab('dashboard');
  });

  // Save draft — also persists active section and scroll position
  const _persistDraftPosition = () => {
    try {
      sessionStorage.setItem(`srf_draft_pos_${appId}`, JSON.stringify({
        sectionId: activeSectionId,
        scrollY: window.scrollY
      }));
    } catch(e) {}
  };

  const doSaveDraft = () => {
    // Flush all live DOM inputs into the store first
    container.querySelectorAll('.field-answer-input, .multiselect-chk, .user-el-input, .user-el-cb-input, .user-el-radio-input, .user-el-table-input').forEach(inp => {
      inp.dispatchEvent(new Event('change'));
    });
    updateApplication(appId, { status: 'Draft' });
    _persistDraftPosition();
    forceSave();
    showToast('Draft saved successfully! Exiting to Explore Applications.', 'success');
    addNotification(user.id, 'DRAFT_SAVED', `Your application draft has been saved successfully.`, appId);
    addAuditLog(user.id, 'Saved draft application', 'application', appId);
    
    // Redirect user to Explore Applications → Drafts tab
    window.exploreAppsState = window.exploreAppsState || {};
    window.exploreAppsState.activeTab = 'Drafts';
    window.workspaceLock = false;
    activeUserTab = 'explore';
    renderUserSidebar();
    switchUserTab('explore');
  };
  container.querySelector('#btn-save-draft')?.addEventListener('click', doSaveDraft);
  container.querySelector('#btn-save-draft-bottom')?.addEventListener('click', doSaveDraft);

  // Bind clickable breadcrumbs
  container.querySelectorAll('.breadcrumb-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = link.dataset.breadcrumb;
      window.workspaceLock = false;
      if (target === 'dashboard') {
        activeUserTab = 'dashboard';
        renderUserSidebar();
        switchUserTab('dashboard');
      } else if (target === 'explore') {
        window.exploreAppsState = window.exploreAppsState || {};
        window.exploreAppsState.activeTab = 'Drafts';
        activeUserTab = 'explore';
        renderUserSidebar();
        switchUserTab('explore');
      }
    });
  });

  const doSubmitReformArea = () => {
    const result = submitReformArea(appId, activeSectionId, user.id);
    if (result.success) {
      addNotification(user.id, NOTIFICATION_EVENTS.REFORM_AREA_SUBMITTED,
        `Reform Area "${activeSection?.title || activeSectionId}" has been submitted successfully.`, appId);
      addAuditLog(user.id, `Submitted Reform Area ${activeSectionId}`, 'application', appId);
      showToast('Reform Area Submitted Successfully!', 'success');
      openApplicationForm(appId, container);
    } else {
      showAlert({
        title: 'Cannot Submit Reform Area',
        message: `can't submit the question and whole application untill user fully fill the form<br><br><strong>Details:</strong> ${result.error || 'Submission failed.'}`,
        type: 'error'
      });
    }
  };
  container.querySelector('#btn-submit-reform-area')?.addEventListener('click', doSubmitReformArea);
  container.querySelector('#btn-submit-reform-area-bottom')?.addEventListener('click', doSubmitReformArea);

  const doSubmit = async () => {
    const btnTop = container.querySelector('#btn-submit-app');
    const btnBottom = container.querySelector('#btn-submit-app-bottom');
    
    // Disable buttons and show loader spinner
    if (btnTop) {
      btnTop.disabled = true;
      btnTop.innerHTML = '<span class="spinner" style="display:inline-block; width:12px; height:12px; border:2px solid #fff; border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite; margin-right:6px; vertical-align:middle;"></span> Submitting...';
    }
    if (btnBottom) {
      btnBottom.disabled = true;
      btnBottom.innerHTML = '<span class="spinner" style="display:inline-block; width:12px; height:12px; border:2px solid #fff; border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite; margin-right:6px; vertical-align:middle;"></span> Submitting...';
    }

    try {
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }

      // Auto-save all active inputs before validating submission
      container.querySelectorAll('.field-answer-input, .multiselect-chk, .user-el-input, .user-el-cb-input, .user-el-radio-input, .user-el-table-input').forEach(inp => {
        inp.dispatchEvent(new Event('change'));
      });

      await forceSave();

      const answers = getAnswersByApplication(appId);
      const app = getApplicationById(appId);
      if (!app) {
        throw new Error('Application not found.');
      }
      
      // Check assignments existence
      const hasAssignment = getAllAssignments().some(a => a.userId === user.id && a.editionId === app.editionId);
      if (!hasAssignment) {
        throw new Error('No assignments found for this user in this edition.');
      }

      const fields = getFieldsByEdition(app.editionId);
      
      // Validate mandatory questions and documents
      const missingQuestions = [];
      const missingDocs = [];
      
      fields.forEach(f => {
        if (f.isLayoutElement) return;
        
        // Check if question is assigned to the current user
        if (!isFieldAssignedToUser(f, user)) return;

        if (f.mandatory) {
          const ans = answers.find(a => a.fieldId === f.id);
          // Use isQuestionFilled: "No" = answered for completion purposes
          if (!isQuestionFilled(ans, f)) {
            missingQuestions.push(f);
          } else {
            // Check documents only when answer is not "No"
            const isNo = ans && ans.value && (ans.value === 'No' || (typeof ans.value === 'string' && ans.value.trim().toLowerCase() === 'no'));
            if (!isNo) {
              if (f.docs && f.docs.length > 0) {
                f.docs.forEach(d => {
                  if (d.requirement === 'mandatory') {
                    const file = ans.files?.find(fi => fi.docId === d.id);
                    if (!file || (!file.dataUrl && !file.name)) {
                      missingDocs.push({ field: f, doc: d });
                    }
                  }
                });
              }
              if (f.uploadRequirement === 'mandatory') {
                if (!ans.files || ans.files.length === 0) {
                  missingDocs.push({ field: f });
                }
              }
            }
          }
        }
      });

      if (missingQuestions.length > 0 || missingDocs.length > 0) {
        let msg = "Cannot submit the application until all required fields are filled.";
        if (missingQuestions.length > 0) {
          msg += `<br><br><strong>Missing Required Questions:</strong><ul style="margin-top:6px;padding-left:20px;text-align:left;">${missingQuestions.map(m => `<li>Q${m.num || m.id}: ${m.label || m.text}</li>`).join('')}</ul>`;
        }
        if (missingDocs.length > 0) {
          msg += `<br><br><strong>Missing Required Documents:</strong><ul style="margin-top:6px;padding-left:20px;text-align:left;">${missingDocs.map(m => `<li>Q${m.field.num || m.field.id}: ${m.doc ? m.doc.name : 'Supporting Document'}</li>`).join('')}</ul>`;
        }
        
        showAlert({
          title: 'Cannot Submit Application',
          message: msg,
          type: 'error'
        });
        return;
      }

      const result = submitApplication(appId, user.id);
      if (result.success) {
        // Create notification and audit log
        addNotification(user.id, NOTIFICATION_EVENTS.APPLICATION_SUBMITTED,
          `Your application ${appId} has been submitted successfully.`, appId);
        addAuditLog(user.id, 'Submitted application', 'application', appId);

        // Redirect user to Explore Applications → Submitted tab
        window.exploreAppsState = window.exploreAppsState || {};
        window.exploreAppsState.activeTab = 'Submitted';
        activeUserTab = 'explore';
        renderUserSidebar();
        switchUserTab('explore');
        
        showAlert({
          title: 'Application Submitted!',
          message: `Your application <strong>${appId}</strong> has been submitted successfully. You will be notified once it is reviewed.`,
          type: 'success'
        });
      } else {
        showAlert({
          title: 'Cannot Submit',
          message: result.error || 'Submission failed.',
          type: 'error'
        });
      }
    } catch(err) {
      console.error(err);
      showAlert({
        title: 'Error during submission',
        message: err.message || 'An unexpected error occurred.',
        type: 'error'
      });
    } finally {
      // Re-enable buttons
      if (btnTop) {
        btnTop.disabled = false;
        btnTop.innerHTML = 'Submit Entire Application';
      }
      if (btnBottom) {
        btnBottom.disabled = false;
        btnBottom.innerHTML = 'Submit Entire Application';
      }
    }
  };
  container.querySelector('#btn-submit-app')?.addEventListener('click', doSubmit);
  container.querySelector('#btn-submit-app-bottom')?.addEventListener('click', doSubmit);



  // Auto-save every 30 seconds — flush live DOM inputs, then persist
  clearInterval(autoSaveTimer);
  if (!isFrozen) {
    autoSaveTimer = setInterval(() => {
      // Collect live DOM values before flushing
      container.querySelectorAll('.field-answer-input, .multiselect-chk, .user-el-input, .user-el-cb-input, .user-el-radio-input, .user-el-table-input').forEach(inp => {
        inp.dispatchEvent(new Event('change'));
      });
      forceSave();
      // Update progress bar without full re-render
      const prog = calculateApplicationProgress(appId);
      const barWrap = container.querySelector('#app-progress-bar-wrap');
      if (barWrap) {
        const pct = prog.percentage;
        const barColor = pct >= 100 ? '#10b981' : pct >= 60 ? '#6366f1' : '#f59e0b';
        const bar = barWrap.querySelector('div > div:last-child > div');
        const label = barWrap.querySelector('span:last-child');
        if (bar) bar.style.width = pct + '%';
        if (bar) bar.style.background = barColor;
        if (label) { label.textContent = `${prog.completed} / ${prog.total} questions answered (${pct}%)`; label.style.color = barColor; }
      }
    }, 30000);
  }
}

export function renderUserElementInput(el, fieldId, value, disabled, appId) {
  const dis = disabled ? 'disabled' : '';
  const cls = 'user-el-input';
  const attr = `data-field-id="${fieldId}" data-el-id="${el.id}"`;
  const reqStar = el.required ? `<span style="color:var(--danger)">*</span>` : '';

  switch (el.type) {
    case 'heading':
      const hText = `<h3 style="font-family:var(--font-title); font-size:16px; font-weight:700; color:var(--text-main); margin-top:10px;">${el.label || ''}</h3>`;
      if (el.options && el.options.length > 0) {
        const hOpts = el.options.map(o => `
          <label class="radio-label" style="display:inline-flex; align-items:center; gap:8px; cursor:pointer; margin-right:12px;">
            <input type="radio" class="user-el-radio-input" name="radio-${fieldId}-${el.id}" data-field-id="${fieldId}" data-el-id="${el.id}" value="${o}" ${value === o ? 'checked' : ''} ${dis}>
            <span class="radio-custom"></span> ${o}
          </label>
        `).join('');
        return `
          ${hText}
          <div style="margin-top:6px; margin-bottom:12px; display:flex; flex-wrap:wrap; gap:6px;">
            ${hOpts}
          </div>
        `;
      }
      return hText;
    case 'subheading':
      return `<h4 style="font-family:var(--font-title); font-size:14px; font-weight:600; color:var(--text-main); margin-top:8px;">${el.label || ''}</h4>`;
    case 'description':
      return `<p style="font-size:13.5px; color:var(--text-muted); line-height:1.6; margin:4px 0;">${el.label || ''}</p>`;
    case 'instruction':
      return `
        <div style="background:rgba(99,102,241,0.05); border-left:4px solid var(--accent-indigo); padding:10px 14px; border-radius:4px; font-size:13px; color:var(--text-muted); line-height:1.5; margin:8px 0;">
          ${el.label || ''}
        </div>
      `;
    case 'divider':
      return `<hr style="border:none; border-top:1px solid var(--border-color); margin:12px 0;">`;
    case 'card':
      return `
        <div style="border:1px solid var(--border-color); border-radius:8px; padding:12px; background:rgba(255,255,255,0.01); font-size:13px; color:var(--text-main); margin:8px 0;">
          ${el.label || ''}
        </div>
      `;
    case 'banner':
      return `
        <div style="background:rgba(217,119,6,0.06); border:1px solid rgba(217,119,6,0.15); padding:10px 14px; border-radius:6px; font-size:13px; color:var(--warning); font-weight:500; margin:8px 0;">
          ⚠️ ${el.label || ''}
        </div>
      `;
    case 'hyperlink':
      const targetAttr = 'target="_blank"';
      const actualUrl = (el.url && el.url !== '#') ? el.url : (el.label && el.label.startsWith('http') ? el.label : '#');
      return `
        <div style="margin:8px 0;">
          <a href="${actualUrl}" ${targetAttr} style="color:var(--accent-indigo); font-weight:600; text-decoration:underline; display:inline-flex; align-items:center; gap:6px; font-size:13px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            ${el.label || 'Click here to view reference'}
          </a>
          ${el.description ? `<p style="font-size:12px; color:var(--text-muted); margin:4px 0 0 0; line-height:1.4;">${el.description}</p>` : ''}
        </div>
      `;
    case 'textbox':
      return `
        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:13px; font-weight:600; color:var(--text-main); margin-bottom:6px;">${el.label || 'Input'} ${reqStar}</label>
          <input type="text" class="${cls} form-input" ${attr} value="${value || ''}" placeholder="${el.placeholder || ''}" ${dis}>
        </div>
      `;
    case 'textarea':
      return `
        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:13px; font-weight:600; color:var(--text-main); margin-bottom:6px;">${el.label || 'Input'} ${reqStar}</label>
          <textarea class="${cls} form-textarea" ${attr} rows="3" placeholder="${el.placeholder || ''}" ${dis}>${value || ''}</textarea>
        </div>
      `;
    case 'dropdown':
      const opts = (el.options || []).map(o => `<option value="${o}" ${value === o ? 'selected' : ''}>${o}</option>`).join('');
      return `
        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:13px; font-weight:600; color:var(--text-main); margin-bottom:6px;">${el.label || 'Select Options'} ${reqStar}</label>
          <select class="${cls} form-input form-select" ${attr} ${dis}>
            <option value="">Select an option</option>
            ${opts}
          </select>
        </div>
      `;
    case 'checkbox':
      const cbOpts = (el.options || ['Option 1', 'Option 2']).map(o => {
        const isChecked = (value || '').split(', ').includes(o) ? 'checked' : '';
        return `
          <label class="checkbox-label" style="display:inline-flex; align-items:center; gap:8px; cursor:pointer; margin-right:12px;">
            <input type="checkbox" class="user-el-cb-input" data-field-id="${fieldId}" data-el-id="${el.id}" value="${o}" ${isChecked} ${dis}>
            <span class="checkbox-custom"></span> ${o}
          </label>
        `;
      }).join('');
      return `
        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:13px; font-weight:600; color:var(--text-main); margin-bottom:6px;">${el.label || 'Checkbox Options'} ${reqStar}</label>
          <div style="display:flex; flex-wrap:wrap; gap:6px;">${cbOpts}</div>
        </div>
      `;
    case 'radio':
      const rdOpts = (el.options || ['Yes', 'No']).map(o => `
        <label class="radio-label" style="display:inline-flex; align-items:center; gap:8px; cursor:pointer; margin-right:12px;">
          <input type="radio" class="user-el-radio-input" name="radio-${fieldId}-${el.id}" data-field-id="${fieldId}" data-el-id="${el.id}" value="${o}" ${value === o ? 'checked' : ''} ${dis}>
          <span class="radio-custom"></span> ${o}
        </label>
      `).join('');
      return `
        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:13px; font-weight:600; color:var(--text-main); margin-bottom:6px;">${el.label || 'Select Option'} ${reqStar}</label>
          <div style="display:flex; flex-wrap:wrap; gap:6px;">${rdOpts}</div>
        </div>
      `;
    case 'date':
      return `
        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:13px; font-weight:600; color:var(--text-main); margin-bottom:6px;">${el.label || 'Select Date'} ${reqStar}</label>
          <input type="date" class="${cls} form-input" ${attr} value="${value || ''}" ${dis}>
        </div>
      `;
    case 'number':
      return `
        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:13px; font-weight:600; color:var(--text-main); margin-bottom:6px;">${el.label || 'Number Input'} ${reqStar}</label>
          <input type="number" class="${cls} form-input" ${attr} value="${value || ''}" placeholder="${el.placeholder || '0'}" ${dis}>
        </div>
      `;
    case 'email':
      return `
        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:13px; font-weight:600; color:var(--text-main); margin-bottom:6px;">${el.label || 'Email Input'} ${reqStar}</label>
          <input type="email" class="${cls} form-input" ${attr} value="${value || ''}" placeholder="${el.placeholder || 'email@example.com'}" ${dis}>
        </div>
      `;
    case 'url':
      return `
        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:13px; font-weight:600; color:var(--text-main); margin-bottom:6px;">${el.label || 'URL Input'} ${reqStar}</label>
          <input type="url" class="${cls} form-input" ${attr} value="${value || ''}" placeholder="${el.placeholder || 'https://...'}" ${dis}>
        </div>
      `;
    case 'richtext':
      return `
        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:13px; font-weight:600; color:var(--text-main); margin-bottom:6px;">${el.label || 'Rich Text Content'} ${reqStar}</label>
          <textarea class="${cls} form-textarea" ${attr} rows="4" placeholder="${el.placeholder || ''}" style="font-family:inherit;" ${dis}>${value || ''}</textarea>
        </div>
      `;
    case 'table':
      const tRows = el.options || ['Dimension 1', 'Dimension 2'];
      const rowVals = value ? value.split('|') : [];
      return `
        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:13px; font-weight:600; color:var(--text-main); margin-bottom:6px;">${el.label || 'Table Grid'} ${reqStar}</label>
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; border:1px solid var(--border-color); font-size:13px; border-radius:8px; overflow:hidden;">
              <thead>
                <tr style="background:rgba(255,255,255,0.02);">
                  <th style="padding:10px; border:1px solid var(--border-color); text-align:left; color:var(--text-muted);">Parameter</th>
                  <th style="padding:10px; border:1px solid var(--border-color); text-align:left; color:var(--text-muted);">Response</th>
                </tr>
              </thead>
              <tbody>
                ${tRows.map((rowOpt, rIdx) => {
                  const cellVal = rowVals[rIdx] || '';
                  return `
                    <tr>
                      <td style="padding:10px; border:1px solid var(--border-color); font-weight:500; background:rgba(255,255,255,0.01);">${rowOpt}</td>
                      <td style="padding:8px; border:1px solid var(--border-color);">
                        <input type="text" class="user-el-table-input form-input" data-field-id="${fieldId}" data-el-id="${el.id}" data-row-idx="${rIdx}" value="${cellVal}" style="width:100%; height:32px; padding:4px 8px;" ${dis}>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    case 'file':
    case 'pdf':
    case 'imageupload':
      const allowedText = el.allowedFormats ? `Formats allowed: ${el.allowedFormats}` : '';
      const limitText = el.maxSize ? `Max size: ${el.maxSize}MB` : '';
      return `
        <div style="margin-bottom:12px; border:1px dashed var(--border-color); border-radius:8px; padding:16px; text-align:center; background:rgba(255,255,255,0.01);">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" style="margin-bottom:6px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <div style="font-size:13px; font-weight:600; color:var(--text-main);">${el.label || 'Upload File'} ${reqStar}</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:2px; margin-bottom:8px;">${allowedText} ${allowedText && limitText ? ' | ' : ''} ${limitText}</div>
          <input type="text" class="${cls} form-input" ${attr} value="${value || ''}" placeholder="Upload file path or link..." ${dis}>
        </div>
      `;
    default:
      return `<input type="text" class="${cls} form-input" ${attr} value="${value || ''}" ${dis}>`;
  }
}

// ─── FIELD INPUT RENDERER ─────────────────────────────────────────────────
export function renderFieldInput(field, value, disabled, appId) {
  const dis = disabled ? 'disabled' : '';
  const cls = 'field-answer-input';
  const attr = `data-field-id="${field.id}"`;

  switch (field.fieldType) {
    case 'radio':
      const radioOpts = (field.options && field.options.length > 0) ? field.options : ['Yes', 'No'];
      return `
        <div class="radio-group">
          ${radioOpts.map(opt => `
            <label class="radio-label ${disabled ? 'radio-disabled' : ''}">
              <input type="radio" class="${cls}" name="radio-${field.id}" ${attr} value="${opt}" ${value === opt ? 'checked' : ''} ${dis}>
              <span class="radio-custom"></span> ${opt}
            </label>
          `).join('')}
        </div>
      `;
    case 'checkbox':
      return `
        <label class="checkbox-label">
          <input type="checkbox" class="${cls}" ${attr} ${value === 'true' || value === true ? 'checked' : ''} ${dis}>
          <span class="checkbox-custom"></span>
          Confirmed
        </label>
      `;
    case 'textarea':
      return `<textarea class="${cls} form-textarea" ${attr} rows="4" placeholder="Enter your response..." ${dis}>${value}</textarea>`;
    case 'email':
      return `<input type="email" class="${cls} form-input" ${attr} value="${value}" placeholder="email@example.com" ${dis}>`;
    case 'number':
      return `<input type="number" class="${cls} form-input" ${attr} value="${value}" placeholder="0" ${dis}>`;
    case 'date':
      return `<input type="date" class="${cls} form-input" ${attr} value="${value}" ${dis}>`;
    case 'url':
      return `<input type="url" class="${cls} form-input" ${attr} value="${value}" placeholder="https://..." ${dis}>`;
    case 'dropdown':
      const opts = (field.options || []).map(o => `<option value="${o}" ${value === o ? 'selected':''}>${o}</option>`).join('');
      return `<select class="${cls} form-input form-select" ${attr} ${dis}><option value="">Select an option</option>${opts}</select>`;
    case 'multiselect':
      const msOpts = (field.options || []);
      const selectedVals = value ? value.split(',').map(s => s.trim()) : [];
      return `
        <div class="checkbox-group" style="display:flex; flex-direction:column; gap:8px;">
          ${msOpts.map(opt => {
            const isChecked = selectedVals.includes(opt) ? 'checked' : '';
            return `
              <label class="checkbox-label" style="display:inline-flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" class="multiselect-chk" data-field-id="${field.id}" value="${opt}" ${isChecked} ${dis}>
                <span class="checkbox-custom"></span>
                ${opt}
              </label>
            `;
          }).join('')}
        </div>
      `;
    case 'mobile':
      return `<input type="tel" class="${cls} form-input" ${attr} value="${value}" placeholder="Enter 10-digit mobile number" pattern="[0-9]{10}" ${dis}>`;
    case 'richtext':
      return `<textarea class="${cls} form-textarea" ${attr} rows="6" placeholder="Enter detailed rich response..." style="font-family:inherit; min-height:120px;" ${dis}>${value}</textarea>`;
    case 'divider':
      return `<hr style="border:none;border-top:1px solid var(--border-color);margin:12px 0;">`;
    case 'heading':
      const headingText = `<h3 style="font-family:var(--font-title);font-size:16px;font-weight:700;color:var(--text-main);margin-top:10px;">${field.text || field.label}</h3>`;
      if (field.options && field.options.length > 0) {
        const headingRadioOpts = field.options;
        return `
          ${headingText}
          <div class="radio-group" style="margin-top:8px; margin-bottom:12px; display:flex; flex-wrap:wrap; gap:8px;">
            ${headingRadioOpts.map(opt => `
              <label class="radio-label ${disabled ? 'radio-disabled' : ''}" style="margin-right:12px; display:inline-flex; align-items:center; gap:6px; cursor:pointer;">
                <input type="radio" class="${cls}" name="heading-radio-${field.id}" ${attr} value="${opt}" ${value === opt ? 'checked' : ''} ${dis}>
                <span class="radio-custom"></span> ${opt}
              </label>
            `).join('')}
          </div>
        `;
      }
      return headingText;
    case 'subheading':
      return `<h4 style="font-family:var(--font-title);font-size:14px;font-weight:600;color:var(--text-main);margin-top:8px;">${field.text || field.label}</h4>`;
    case 'description':
      return `<p style="font-size:13.5px;color:var(--text-muted);line-height:1.6;margin: 4px 0;">${field.text || field.label}</p>`;
    case 'instruction':
      return `
        <div style="background:rgba(99,102,241,0.05); border-left:4px solid var(--accent-indigo); padding:10px 14px; border-radius:4px; font-size:13px; color:var(--text-muted); line-height:1.5; margin: 8px 0;">
          ${field.text || field.label}
        </div>
      `;
    case 'hyperlink':
      const linkUrl = (field.url && field.url !== '#') ? field.url : (field.label && field.label.startsWith('http') ? field.label : (field.helpText || '#'));
      return `
        <div style="margin:8px 0;">
          <a href="${linkUrl}" target="_blank" style="color:var(--accent-indigo); font-weight:600; text-decoration:underline; display:inline-flex; align-items:center; gap:6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            ${field.label || 'Click here to view reference'}
          </a>
        </div>
      `;
    case 'table':
      const tableRows = (field.options || ['Row 1', 'Row 2']);
      return `
        <div style="overflow-x:auto; margin: 8px 0;">
          <table style="width:100%; border-collapse:collapse; border:1px solid var(--border-color); font-size:13px; border-radius:8px; overflow:hidden;">
            <thead>
              <tr style="background:rgba(255,255,255,0.02);">
                <th style="padding:10px; border:1px solid var(--border-color); text-align:left; color:var(--text-muted);">Parameter / Dimension</th>
                <th style="padding:10px; border:1px solid var(--border-color); text-align:left; color:var(--text-muted);">Response Value</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows.map((rowOpt, rIdx) => {
                const rowVals = value ? value.split('|') : [];
                const rowVal = rowVals[rIdx] || '';
                return `
                  <tr>
                    <td style="padding:10px; border:1px solid var(--border-color); font-weight:500; background:rgba(255,255,255,0.01);">${rowOpt}</td>
                    <td style="padding:8px; border:1px solid var(--border-color);">
                      <input type="text" class="table-cell-input form-input" data-field-id="${field.id}" data-row-idx="${rIdx}" value="${rowVal}" style="width:100%; height:32px; padding:4px 8px;" ${dis}>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    case 'file':
    case 'pdf':
    case 'imageupload':
      return `
        <div style="font-size:12px; color:var(--text-muted); margin-bottom:4px;">Direct Question File Upload:</div>
        <input type="text" class="${cls} form-input" ${attr} value="${value}" placeholder="File link or metadata (Or use Supporting Documents section below)" ${dis}>
      `;
    default:
      return `<input type="text" class="${cls} form-input" ${attr} value="${value}" placeholder="Enter your answer..." ${dis}>`;
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────────────
export function _userFacingStatus(status) {
  const map = {
    'Under Review': 'Submitted', 'Resubmitted': 'Submitted',
    'Admin Approved': 'Submitted', 'Super Admin Review': 'Submitted',
    'Final Approved': 'Approved',
    'Additional Documents Requested': 'Docs Requested',
  };
  return map[status] || status;
}

export function _timeAgo(dateStr) {
  if (!dateStr) return 'N/A';
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return mins + 'm ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  return Math.floor(hours / 24) + 'd ago';
}

// ─── EXPLORE APPLICATIONS PAGE ─────────────────────────────────────────────────────


// ─── USER APPS (filtered by status) ───────────────────────────────────────


// ─── USER: VIEW APPLICATION DETAIL ────────────────────────────────────────


// ─── NOTIFICATIONS PAGE ────────────────────────────────────────────────────


// ─── NOTIFICATION BADGE ────────────────────────────────────────────────────




// ─── STATUS HELPER ─────────────────────────────────────────────────────────
export function _statusClass(status) {
  const map = {
    'Draft': 'status-draft', 'Submitted': 'status-submitted',
    'Resubmitted': 'status-submitted', 'Under Review': 'status-review',
    'Admin Approved': 'status-submitted', 'Super Admin Review': 'status-review',
    'Final Approved': 'status-approved',
    'Approved': 'status-approved', 'Rejected': 'status-rejected',
    'Additional Documents Requested': 'status-add-docs',
    'Not Started': 'status-draft'
  };
  return map[status] || 'status-draft';
}



// ─── AUTO-RESUME SESSION ───────────────────────────────────────────────────


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

// ─── STATUS LABEL (abbreviated for cards) ──────────────────────────────────
export function _statusLabel(status) {
  const abbr = {
    'Additional Documents Requested': 'Docs Req.',
    'Under Review': 'In Review',
    'Resubmitted': 'Resubmitted',
  };
  return abbr[status] || status;
}

// ─── PUBLISH WIZARD ────────────────────────────────────────────────────────


// ═══════════════════════════════════════════════════════════════════════════
// ASSIGNED DETAILS PANEL (SUPERADMIN)
// ═══════════════════════════════════════════════════════════════════════════




// ═══════════════════════════════════════════════════════════════════════════
// DEPARTMENT MANAGEMENT PANEL (SUPERADMIN)
// ═══════════════════════════════════════════════════════════════════════════










// ─── MESSAGES TAB ENGINE & POLLING ──────────────────────────────────────────
let activeContactId = null;
window.chatPollingInterval = null;



// ═══════════════════════════════════════════════════════════════════════════
// RECYCLE BIN PANEL — Enhanced Premium UI
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// RECYCLE BIN VIEW MODAL (DETAILS VIEWER)
// ═══════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════
// RECYCLE BIN PANEL — Enhanced Premium UI with Search, Filters & Pagination
// ═══════════════════════════════════════════════════════════════════════════




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
