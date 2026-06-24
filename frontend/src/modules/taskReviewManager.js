/* ==========================================================================
   taskReviewManager.js — Assigned Tasks Review Center Engine
   Dynamic SRF Management Platform — Enterprise Edition
   ========================================================================== */

import * as Store from '../db/store.js';
import { getCurrentUser, isSuperAdmin, isAdmin } from '../auth/auth.js';
import { showConfirm, showAlert, showPrompt, showFileViewer } from '../ui/confirmDialog.js';
import { showToast } from '../ui/toastManager.js';
import { dataURLtoBlob, dataURLtoObjectURL } from '../ui/fileUtil.js';

let activeReviewFilterStatus = 'Pending Review';
let activeReviewFilterEdition = '';
let activeReviewFilterDept = '';
let activeReviewFilterReviewer = '';
let activeReviewSearchQuery = '';
let activeSuperAdminTab = 'all'; // 'all', 'unassigned'

// Active workspace states
let activeWorkspaceAppId = null;
let activeWorkspaceFieldId = null;
let activeWorkspaceSelectedFileId = null;
let activeWorkspaceCompareVersion = 'current';

// Productivity metrics (simulated session memory where appropriate)
let reviewsCompletedSession = 0;
const sessionStartTime = Date.now();

/**
 * Injects dashboard styles dynamically.
 */
function injectStyles() {
  if (document.getElementById('task-review-styles')) return;
  const style = document.createElement('style');
  style.id = 'task-review-styles';
  style.textContent = `
    .tr-dashboard-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .tr-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 16px 20px;
      box-shadow: var(--shadow-sm);
      transition: all 0.3s ease;
      position: relative;
      overflow: hidden;
    }
    .tr-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-normal);
      border-color: rgba(99,102,241,0.2);
    }
    .tr-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; width: 4px; height: 100%;
      background: var(--accent-indigo);
    }
    .tr-card.blue::before { background: #3b82f6; }
    .tr-card.green::before { background: #10b981; }
    .tr-card.red::before { background: #ef4444; }
    .tr-card.yellow::before { background: #f59e0b; }
    .tr-card.purple::before { background: #8b5cf6; }

    .tr-card-title {
      font-size: 12px;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 8px;
    }
    .tr-card-value {
      font-size: 26px;
      font-weight: 800;
      color: var(--text-main);
      line-height: 1.2;
    }
    .tr-card-desc {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 4px;
    }

    .tr-charts-container {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 20px;
      margin-bottom: 24px;
    }
    .tr-chart-wrapper {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 20px;
      min-height: 260px;
      box-shadow: var(--shadow-sm);
    }
    .tr-chart-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--text-main);
      margin-bottom: 16px;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 8px;
    }

    /* Split Workspace Layout */
    .tr-workspace-layout {
      display: grid;
      grid-template-columns: 280px 1fr 340px;
      gap: 20px;
      height: calc(100vh - 130px);
      min-height: 600px;
    }
    @media (max-width: 1200px) {
      .tr-workspace-layout {
        grid-template-columns: 240px 1fr;
        height: auto;
      }
      .tr-workspace-right {
        grid-column: span 2;
      }
    }

    .tr-workspace-left, .tr-workspace-center, .tr-workspace-right {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: var(--shadow-sm);
    }

    .tr-panel-header {
      padding: 16px;
      border-bottom: 1px solid var(--border-color);
      background: var(--bg-deep);
      font-weight: 700;
      color: var(--text-main);
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .tr-panel-body {
      padding: 16px;
      flex: 1;
      overflow-y: auto;
    }

    /* Navigation list for questions */
    .tr-q-nav-item {
      padding: 12px;
      border-radius: 8px;
      border: 1px solid transparent;
      margin-bottom: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .tr-q-nav-item:hover {
      background: var(--bg-deep);
      border-color: var(--border-color);
    }
    .tr-q-nav-item.active {
      background: rgba(99,102,241,0.06);
      border-color: var(--accent-indigo);
    }
    .tr-q-nav-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
    }
    .tr-q-nav-num {
      font-size: 11px;
      font-weight: 700;
      color: var(--accent-indigo);
    }
    .tr-q-nav-label {
      font-size: 12.5px;
      font-weight: 500;
      color: var(--text-main);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 170px;
    }

    /* Document item styling */
    .tr-doc-card {
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 12px;
      background: var(--bg-deep);
      margin-bottom: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .tr-doc-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(0,0,0,0.05);
      padding-bottom: 6px;
    }
    .tr-doc-title {
      font-weight: 600;
      font-size: 13px;
      color: var(--text-main);
      word-break: break-all;
    }
    .tr-doc-meta {
      font-size: 11px;
      color: var(--text-muted);
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .tr-doc-actions {
      display: flex;
      gap: 6px;
      margin-top: 4px;
    }

    /* Status badges mapping */
    .tr-badge {
      display: inline-flex;
      align-items: center;
      padding: 3px 8px;
      border-radius: 99px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    .tr-badge-not-sub { background: rgba(148,163,184,0.1); color: #64748b; }
    .tr-badge-pending { background: rgba(59,130,246,0.1); color: #3b82f6; }
    .tr-badge-approved { background: rgba(16,185,129,0.1); color: #10b981; }
    .tr-badge-rejected { background: rgba(239,68,68,0.1); color: #ef4444; }
    .tr-badge-requested { background: rgba(245,158,11,0.1); color: #f59e0b; }
    .tr-badge-resubmitted { background: rgba(139,92,246,0.1); color: #8b5cf6; }

    /* Remarks history */
    .tr-comment-timeline {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 10px;
    }
    .tr-comment-item {
      background: var(--bg-deep);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 10px 12px;
      position: relative;
    }
    .tr-comment-header {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      margin-bottom: 4px;
    }
    .tr-comment-author {
      font-weight: 700;
      color: var(--text-main);
    }
    .tr-comment-date {
      color: var(--text-muted);
    }
    .tr-comment-text {
      font-size: 12px;
      color: var(--text-dark);
      line-height: 1.4;
      white-space: pre-wrap;
    }

    /* Comparison columns */
    .tr-workspace-columns {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      height: 100%;
    }
    .tr-comparison-pane {
      display: flex;
      flex-direction: column;
      gap: 12px;
      height: 100%;
    }

    .tr-q-details-box {
      background: var(--bg-deep);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 14px;
      margin-bottom: 12px;
    }
    .tr-q-title-label {
      font-size: 11px;
      font-weight: 700;
      color: var(--accent-indigo);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 4px;
    }
    .tr-q-text-value {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-main);
      line-height: 1.4;
    }

    .tr-bulk-bar {
      position: sticky;
      bottom: 0;
      background: var(--bg-card);
      border-top: 1px solid var(--border-color);
      padding: 12px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      z-index: 10;
      box-shadow: 0 -4px 10px rgba(0,0,0,0.03);
    }
    
    .sla-alert-banner {
      background: #fef2f2;
      border: 1px solid #fee2e2;
      border-left: 4px solid #ef4444;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 20px;
      color: #b91c1c;
      font-size: 13px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .tr-quick-links-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-bottom: 20px;
    }
    .tr-quick-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 12px 16px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      flex-direction: column;
      gap: 4px;
      box-shadow: var(--shadow-sm);
    }
    .tr-quick-card:hover {
      transform: translateY(-1px);
      box-shadow: var(--shadow-normal);
      border-color: var(--accent-indigo);
    }
    .tr-quick-card.active {
      border-color: var(--accent-indigo);
      background: rgba(99,102,241,0.04);
    }
    .tr-quick-card-title {
      font-size: 11px;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .tr-quick-card-value {
      font-size: 20px;
      font-weight: 800;
      color: var(--text-main);
    }
    .diagnostic-panel {
      background: var(--bg-deep);
      border: 1px dashed var(--border-color);
      border-radius: 10px;
      padding: 20px;
      margin-top: 15px;
      font-size: 13px;
      color: var(--text-dark);
    }
    .diagnostic-title {
      font-weight: 700;
      margin-bottom: 10px;
      color: var(--text-main);
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.05em;
    }
    .comparison-grid-workspace {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    .comparison-pane-half {
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 14px;
      background: var(--bg-card);
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .diff-highlight {
      background: #fffbeb;
      border: 1px solid #fef3c7;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 600;
      color: #d97706;
      font-size: 11px;
    }
    
    @media print {
      body * {
        visibility: hidden;
      }
      #print-certificate-container, #print-certificate-container * {
        visibility: visible;
      }
      #print-certificate-container {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        padding: 40px;
        box-sizing: border-box;
      }
    }
    .cert-frame {
      border: 10px double var(--border-color);
      padding: 40px;
      background: white;
      color: #0f172a;
      max-width: 800px;
      margin: 0 auto;
      font-family: 'Georgia', serif;
      text-align: center;
      box-shadow: 0 4px 20px rgba(0,0,0,0.05);
      position: relative;
    }
    .cert-title {
      font-size: 28px;
      font-weight: 700;
      color: #1e3a8a;
      margin-bottom: 20px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .cert-divider {
      width: 150px;
      height: 2px;
      background: #1e3a8a;
      margin: 20px auto;
    }
    .cert-text {
      font-size: 16px;
      line-height: 1.6;
      margin-bottom: 20px;
    }
    .cert-field {
      margin-bottom: 12px;
      font-size: 14px;
    }
    .cert-field strong {
      color: #1e3a8a;
    }
    .cert-seal {
      margin: 30px auto 10px auto;
      width: 80px;
      height: 80px;
      border-radius: 50%;
      border: 4px solid #1e3a8a;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      color: #1e3a8a;
      font-size: 11px;
      text-transform: uppercase;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Return user-friendly label and class for question status badge.
 */
function getStatusBadge(status) {
  const norm = (status || '').trim();
  if (norm === 'Approved') return `<span class="tr-badge tr-badge-approved">Approved</span>`;
  if (norm === 'Rejected') return `<span class="tr-badge tr-badge-rejected">Rejected</span>`;
  if (norm === 'Additional Documents Requested' || norm === 'Docs Requested') {
    return `<span class="tr-badge tr-badge-requested">Docs Requested</span>`;
  }
  if (norm === 'Resubmitted') return `<span class="tr-badge tr-badge-resubmitted">Resubmitted</span>`;
  if (norm === 'Submitted' || norm === 'Under Review') return `<span class="tr-badge tr-badge-pending">Pending Review</span>`;
  return `<span class="tr-badge tr-badge-not-sub">Not Submitted</span>`;
}

/**
 * Check if a question is filled (answered by the user).
 * Uses isQuestionFilled so that "No" counts as answered and can be approved
 * (with 0 marks). Only truly unanswered questions (null/empty/"Not Answered")
 * keep the Approve button disabled.
 */
function isAnswerValid(ans, field) {
  return Store.isQuestionFilled(ans, field);
}

/**
 * Calculate priorities for sorting:
 * 1. Overdue: dueDate is past and not approved
 * 2. Resubmitted
 * 3. Docs Requested
 * 4. Newly Submitted
 */
function getTaskPriority(qItem) {
  const isOverdue = qItem.dueDate && new Date(qItem.dueDate) < new Date() && qItem.status !== 'Approved' && qItem.status !== 'Rejected';
  if (isOverdue) {
    return { score: 10, label: 'Overdue', priorityBadge: 'HIGH', color: '#ef4444' };
  }
  if (qItem.status === 'Resubmitted') {
    return { score: 8, label: 'Resubmitted', priorityBadge: 'HIGH', color: '#ef4444' };
  }
  if (qItem.status === 'Additional Documents Requested' || qItem.status === 'Docs Requested') {
    return { score: 6, label: 'Docs Requested', priorityBadge: 'MEDIUM', color: '#f59e0b' };
  }
  
  const submissionDate = qItem.submissionDate ? new Date(qItem.submissionDate) : null;
  const isOlderThan7Days = submissionDate && (Date.now() - submissionDate.getTime() > 7 * 24 * 60 * 60 * 1000) && qItem.status !== 'Approved' && qItem.status !== 'Rejected';
  if (isOlderThan7Days) {
    return { score: 5, label: 'Pending > 7 Days', priorityBadge: 'MEDIUM', color: '#f59e0b' };
  }
  
  if (qItem.status === 'Submitted' || qItem.status === 'Under Review' || qItem.status === 'Pending Review') {
    return { score: 4, label: 'Newly Submitted', priorityBadge: 'LOW', color: '#3b82f6' };
  }
  return { score: 2, label: 'Standard', priorityBadge: 'LOW', color: '#64748b' };
}

function getApplicationPriority(app, db, allFields, allAnswers) {
  const fields = allFields.filter(f => f.editionId === app.editionId && !f.isLayoutElement);
  let hasOverdue = false;
  let hasResubmitted = false;
  let hasDocsRequested = false;
  
  fields.forEach(field => {
    const ans = allAnswers.find(a => a.applicationId === app.id && a.fieldId === field.id);
    const qStatus = ans?.questionStatus || 'Pending Review';
    const reformArea = (db.reformAreas || []).find(r => r.id === field.reformAreaId);
    const dueDate = reformArea?.dueDate || '';
    
    const isPending = qStatus === 'Submitted' || qStatus === 'Under Review' || qStatus === 'Pending Review' || qStatus === 'Resubmitted';
    if (dueDate && new Date(dueDate) < new Date() && isPending) {
      hasOverdue = true;
    }
    if (qStatus === 'Resubmitted') {
      hasResubmitted = true;
    }
    if (qStatus === 'Additional Documents Requested' || qStatus === 'Docs Requested') {
      hasDocsRequested = true;
    }
  });

  if (hasOverdue) {
    return { score: 10, label: 'Overdue', priorityBadge: 'HIGH', color: '#ef4444' };
  }
  if (hasResubmitted || app.status === 'Resubmitted') {
    return { score: 8, label: 'Resubmitted', priorityBadge: 'HIGH', color: '#ef4444' };
  }
  if (hasDocsRequested || app.status === 'Additional Documents Requested' || app.status === 'Docs Requested') {
    return { score: 6, label: 'Docs Requested', priorityBadge: 'MEDIUM', color: '#f59e0b' };
  }

  const submissionDate = app.submittedAt ? new Date(app.submittedAt) : (app.updatedAt ? new Date(app.updatedAt) : null);
  const isOlderThan7Days = submissionDate && (Date.now() - submissionDate.getTime() > 7 * 24 * 60 * 60 * 1000) && app.status !== 'Approved' && app.status !== 'Rejected';
  if (isOlderThan7Days) {
    return { score: 5, label: 'Under Review > 7 Days', priorityBadge: 'MEDIUM', color: '#f59e0b' };
  }

  if (app.status === 'Submitted' || app.status === 'Under Review' || app.status === 'Pending Review') {
    return { score: 4, label: 'Newly Submitted', priorityBadge: 'LOW', color: '#3b82f6' };
  }

  return { score: 2, label: 'Standard', priorityBadge: 'LOW', color: '#64748b' };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MAIN ANALYTICS AND QUEUE DASHBOARD
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function renderTaskReviewPanel(container) {
  injectStyles();
  const currentUser = getCurrentUser();
  if (!currentUser || !['admin', 'reviewer', 'superadmin'].includes(currentUser.role)) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 60px 20px;">
        <h3 style="color:var(--danger);">Access Denied</h3>
        <p>You do not have the required permissions to view the Assigned Tasks Review Center.</p>
      </div>`;
    return;
  }

  const db = Store.getDb();
  const allApplications = db.applications || [];
  const allAnswers = db.applicationAnswers || [];
  const allFields = db.formFields || [];
  const allEditions = db.editions || [];
  const allUsers = Store.getUsers();

  const approvedCount = allApplications.filter(app => app.status === 'Approved').length;
  const rejectedCount = allApplications.filter(app => app.status === 'Rejected').length;

  // Filter application list based on role and tab selection
  let reviewableApps = [...allApplications];
  
  // Filter strictly by review queue statuses
  const reviewStatuses = ['Submitted', 'Under Review', 'Resubmitted', 'Additional Documents Requested', 'Approved', 'Rejected'];
  reviewableApps = reviewableApps.filter(app => reviewStatuses.includes(app.status));

  if (currentUser.role === 'admin' || currentUser.role === 'reviewer') {
    reviewableApps = reviewableApps.filter(app => app.assignedReviewer === currentUser.id);
  } else if (currentUser.role === 'superadmin') {
    if (activeSuperAdminTab === 'unassigned') {
      reviewableApps = reviewableApps.filter(app => !app.assignedReviewer);
    }
  }

  // Map applications to queueItems and log diagnostic info
  const queueItems = [];
  reviewableApps.forEach(app => {
    // Diagnostic logging
    console.log({
      applicationId: app.id,
      status: app.status,
      assignedReviewer: app.assignedReviewer,
      visibleToAdmin: app.visibleToAdmin,
      visibleToSuperAdmin: app.visibleToSuperAdmin
    });

    const edition = allEditions.find(e => e.id === app.editionId);
    const applicant = allUsers.find(u => u.id === app.userId);
    if (!edition || !applicant) return;

    // Filter fields belonging to this edition
    const fields = allFields.filter(f => f.editionId === app.editionId && !f.isLayoutElement);

    let pendingQuestionsCount = 0;
    let docsRequestedCount = 0;
    let approvedQuestionsCount = 0;
    let rejectedQuestionsCount = 0;
    let resubmittedQuestionsCount = 0;
    
    fields.forEach(field => {
      const ans = allAnswers.find(a => a.applicationId === app.id && a.fieldId === field.id);
      const qStatus = ans?.questionStatus || 'Pending Review';
      if (qStatus === 'Submitted' || qStatus === 'Under Review' || qStatus === 'Pending Review' || qStatus === 'Resubmitted') {
        pendingQuestionsCount++;
      }
      if (qStatus === 'Additional Documents Requested' || qStatus === 'Docs Requested') {
        docsRequestedCount++;
      }
      if (qStatus === 'Approved') {
        approvedQuestionsCount++;
      }
      if (qStatus === 'Rejected') {
        rejectedQuestionsCount++;
      }
      if (qStatus === 'Resubmitted') {
        resubmittedQuestionsCount++;
      }
    });

    const reviewerId = app.assignedReviewer || '';
    const reviewerObj = allUsers.find(u => u.id === reviewerId);
    const reviewerName = reviewerObj ? (reviewerObj.name || reviewerObj.username) : (reviewerId ? 'System' : 'Unassigned');

    const pri = getApplicationPriority(app, db, allFields, allAnswers);

    queueItems.push({
      appId: app.id,
      editionId: app.editionId,
      editionName: edition.name || 'SRF',
      userName: applicant.name || applicant.username || '',
      applicantUsername: applicant.username || '',
      userOrganization: applicant.organization || 'No Department',
      status: app.status,
      submissionDate: app.submittedAt || app.updatedAt || '',
      reviewerId,
      reviewerName,
      pendingQuestionsCount,
      totalQuestionsCount: fields.length,
      priority: pri,
      fields: fields.map(f => ({ id: f.id, num: f.num }))
    });
  });

  // Main UI skeleton
  container.innerHTML = `
    <div class="section-card">
      <div class="section-badge admin-badge" style="display:flex; justify-content:space-between; align-items:center; width:100%; box-sizing:border-box;">
        <span>Assigned Tasks Review Center</span>
        <span style="font-size:11px; text-transform:none;">Logged in as: <strong>${currentUser.name || currentUser.username} (${currentUser.role.toUpperCase()})</strong></span>
      </div>

      <!-- Super Admin Tab Bar -->
      ${currentUser.role === 'superadmin' ? `
        <div class="tr-superadmin-tabs" style="display:flex; gap:8px; margin-top:14px; margin-bottom:14px; border-bottom:1px solid var(--border-color); padding-bottom:10px;">
          <button class="btn btn-sm ${activeSuperAdminTab === 'all' ? 'btn-primary' : 'btn-secondary'}" id="btn-sa-tab-all" style="font-weight:700; height:32px; font-size:12px; padding:4px 12px; border-radius:6px;">All Applications</button>
          <button class="btn btn-sm ${activeSuperAdminTab === 'unassigned' ? 'btn-primary' : 'btn-secondary'}" id="btn-sa-tab-unassigned" style="font-weight:700; height:32px; font-size:12px; padding:4px 12px; border-radius:6px;">Unassigned Review Queue</button>
        </div>
      ` : ''}

      <!-- WORK QUEUE INTERFACE -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; margin-bottom:14px;">
        <h3 style="margin:0;">Assigned Review Tasks Queue</h3>
        <span style="font-size:12px; color:var(--text-muted);">Queue sorted automatically by urgency and status priority</span>
      </div>

      <!-- FILTER BAR -->
      <div style="background:rgba(15,23,42,0.01); border:1px solid var(--border-color); border-radius:10px; padding:14px; margin-bottom:16px;">
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:12px;">
          <div>
            <label style="font-size:11px; font-weight:700; color:var(--text-muted); display:block; margin-bottom:4px;">Search Query</label>
            <input type="text" id="tr-search-input" value="${activeReviewSearchQuery}" placeholder="App ID, User Name, Question..." class="form-input" style="height:36px; font-size:12.5px;">
          </div>
          <div>
            <label style="font-size:11px; font-weight:700; color:var(--text-muted); display:block; margin-bottom:4px;">Filter Status</label>
            <select id="tr-filter-status" class="form-input form-select" style="height:36px; font-size:12.5px;">
              <option value="">All Statuses</option>
              <option value="Pending Review" ${activeReviewFilterStatus === 'Pending Review' ? 'selected' : ''}>Pending Review Only</option>
              <option value="Additional Documents Requested" ${activeReviewFilterStatus === 'Additional Documents Requested' ? 'selected' : ''}>Docs Requested Only</option>
              <option value="Rejected" ${activeReviewFilterStatus === 'Rejected' ? 'selected' : ''}>Rejected Only</option>
              <option value="Approved" ${activeReviewFilterStatus === 'Approved' ? 'selected' : ''}>Approved Only</option>
              <option value="Resubmitted" ${activeReviewFilterStatus === 'Resubmitted' ? 'selected' : ''}>Resubmitted Only</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px; font-weight:700; color:var(--text-muted); display:block; margin-bottom:4px;">SRF Version</label>
            <select id="tr-filter-edition" class="form-input form-select" style="height:36px; font-size:12.5px;">
              <option value="">All Editions</option>
              ${allEditions.map(ed => `<option value="${ed.id}" ${activeReviewFilterEdition === ed.id ? 'selected' : ''}>${ed.name}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:11px; font-weight:700; color:var(--text-muted); display:block; margin-bottom:4px;">Department</label>
            <select id="tr-filter-dept" class="form-input form-select" style="height:36px; font-size:12.5px;">
              <option value="">All Departments</option>
              ${Array.from(new Set(allUsers.map(u => u.organization).filter(Boolean))).map(dept => `
                <option value="${dept}" ${activeReviewFilterDept === dept ? 'selected' : ''}>${dept}</option>
              `).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:11px; font-weight:700; color:var(--text-muted); display:block; margin-bottom:4px;">Reviewer</label>
            <select id="tr-filter-reviewer" class="form-input form-select" style="height:36px; font-size:12.5px;">
              <option value="">All Reviewers</option>
              ${allUsers.filter(u => ['admin', 'reviewer', 'superadmin'].includes(u.role)).map(u => `
                <option value="${u.id}" ${activeReviewFilterReviewer === u.id ? 'selected' : ''}>${u.name || u.username}</option>
              `).join('')}
            </select>
          </div>
        </div>
      </div>

      <!-- TABLE CONTAINER -->
      <div id="tr-table-container"></div>
    </div>
  `;

  // Draw table view
  updateQueueTableView(container, queueItems);

  // Bind Super Admin Tabs listeners
  if (currentUser.role === 'superadmin') {
    container.querySelector('#btn-sa-tab-all')?.addEventListener('click', () => {
      activeSuperAdminTab = 'all';
      renderTaskReviewPanel(container);
    });
    container.querySelector('#btn-sa-tab-unassigned')?.addEventListener('click', () => {
      activeSuperAdminTab = 'unassigned';
      renderTaskReviewPanel(container);
    });
  }

  // Bind Filters change listeners
  const searchInp = container.querySelector('#tr-search-input');
  const filterStat = container.querySelector('#tr-filter-status');
  const filterEd = container.querySelector('#tr-filter-edition');
  const filterDep = container.querySelector('#tr-filter-dept');
  const filterRev = container.querySelector('#tr-filter-reviewer');

  let debounceTimer;
  searchInp.addEventListener('input', () => {
    activeReviewSearchQuery = searchInp.value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => updateQueueTableView(container, queueItems), 200);
  });
  filterStat.addEventListener('change', () => {
    activeReviewFilterStatus = filterStat.value;
    updateQueueTableView(container, queueItems);
  });
  filterEd.addEventListener('change', () => {
    activeReviewFilterEdition = filterEd.value;
    updateQueueTableView(container, queueItems);
  });
  filterDep.addEventListener('change', () => {
    activeReviewFilterDept = filterDep.value;
    updateQueueTableView(container, queueItems);
  });
  filterRev.addEventListener('change', () => {
    activeReviewFilterReviewer = filterRev.value;
    updateQueueTableView(container, queueItems);
  });
}

/**
 * Filter, sort, and render table body contents.
 */
function updateQueueTableView(container, queueItems) {
  const tableContainer = container.querySelector('#tr-table-container');
  if (!tableContainer) return;

  const qSearch = (activeReviewSearchQuery || '').toLowerCase();

  // Apply filters
  let filtered = queueItems.filter(item => {
    // 1. Search Query
    if (qSearch) {
      const matchApp = item.appId.toLowerCase().includes(qSearch);
      const matchUser = item.userName.toLowerCase().includes(qSearch);
      const matchUserOrg = item.userOrganization.toLowerCase().includes(qSearch);
      const matchEdition = item.editionName.toLowerCase().includes(qSearch);
      if (!matchApp && !matchUser && !matchUserOrg && !matchEdition) return false;
    }
    // 2. Filter Status
    if (activeReviewFilterStatus) {
      if (activeReviewFilterStatus === 'Pending Review') {
        if (item.status !== 'Submitted' && item.status !== 'Under Review' && item.status !== 'Pending Review' && item.status !== 'Resubmitted') return false;
      } else if (activeReviewFilterStatus === 'Additional Documents Requested') {
        if (item.status !== 'Additional Documents Requested' && item.status !== 'Docs Requested') return false;
      } else if (activeReviewFilterStatus === 'Recently Submitted') {
        const subMs = item.submissionDate ? new Date(item.submissionDate).getTime() : 0;
        const isRecent = (Date.now() - subMs) < 72 * 3600 * 1000;
        if (!isRecent || (item.status !== 'Submitted' && item.status !== 'Resubmitted')) return false;
      } else if (activeReviewFilterStatus === 'Completed') {
        if (item.status !== 'Approved' && item.status !== 'Rejected') return false;
      } else {
        if (item.status !== activeReviewFilterStatus) return false;
      }
    }
    // 3. Filter Edition
    if (activeReviewFilterEdition && item.editionId !== activeReviewFilterEdition) return false;
    // 4. Filter Department
    if (activeReviewFilterDept && item.userOrganization !== activeReviewFilterDept) return false;
    // 5. Filter Reviewer
    if (activeReviewFilterReviewer && item.reviewerId !== activeReviewFilterReviewer) return false;

    return true;
  });

  // Sort queue by priority
  filtered.sort((a, b) => {
    const scoreA = a.priority.score;
    const scoreB = b.priority.score;
    if (scoreA !== scoreB) return scoreB - scoreA; // descending
    // secondary sort by submission date descending
    return new Date(b.submissionDate || 0) - new Date(a.submissionDate || 0);
  });

  if (filtered.length === 0) {
    const db = Store.getDb();
    const totalApps = db.applications?.length || 0;
    const totalAss = Store.getAllAssignments()?.length || 0;
    const totalFields = db.formFields?.length || 0;

    tableContainer.innerHTML = `
      <div class="empty-state" style="padding: 40px 20px; border:1px solid var(--border-color); border-radius:10px;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" style="margin-bottom:12px;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <h3>No matching review items</h3>
        <p>No applications requiring action match your selected filter criteria.</p>

        <!-- DIAGNOSTIC CONSOLE -->
        <div class="diagnostic-panel" style="text-align:left; max-width:600px; margin:20px auto 0 auto; border:1px dashed var(--border-color); background:var(--bg-deep); padding:16px; border-radius:8px;">
          <h4 class="diagnostic-title" style="margin-top:0; font-size:12.5px; font-weight:800; text-transform:uppercase; color:var(--text-main); border-bottom:1px solid var(--border-color); padding-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
            <span>🔍 Database Diagnostic Console</span>
            <span style="font-size:9.5px; background:rgba(99,102,241,0.1); color:var(--accent-indigo); padding:2px 6px; border-radius:4px; font-family:monospace;">EMPTY_QUEUE</span>
          </h4>
          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin-bottom:12px; font-size:12px; font-family:monospace;">
            <div>Applications: <strong>${totalApps}</strong></div>
            <div>Assignments: <strong>${totalAss}</strong></div>
            <div>Questions/Fields: <strong>${totalFields}</strong></div>
          </div>
          <div style="font-size:11.5px; line-height:1.4; color:var(--text-muted);">
            <strong>Active Queue Criteria:</strong><br>
            - Applications must not be in <code>Draft</code> status.<br>
            - Current filter status: <code>${activeReviewFilterStatus || 'All'}</code>.<br>
            - Current filter edition: <code>${activeReviewFilterEdition || 'All'}</code>.<br>
            - Current filter department: <code>${activeReviewFilterDept || 'All'}</code>.<br>
            - Current filter reviewer: <code>${activeReviewFilterReviewer || 'All'}</code>.<br>
            - Current search query: <code>"${activeReviewSearchQuery || 'None'}"</code>.
          </div>
          <div style="margin-top:10px; border-top:1px dashed var(--border-color); padding-top:8px; font-size:11px; font-family:monospace; max-height:100px; overflow-y:auto; color:var(--text-dark);">
            <strong>Workload Mapping:</strong><br>
            ${(db.applications || []).filter(a => a.status !== 'Draft').map(a => `
              - App ${a.id}: Status: ${a.status} | Reviewer: ${a.assignedReviewer || 'Unassigned'}
            `).join('<br>') || 'No non-draft applications found.'}
          </div>
        </div>
      </div>
    `;
    return;
  }

  // Render Table
  tableContainer.innerHTML = `
    <div style="overflow-x:auto;">
      <table class="admin-dashboard-table" style="min-width: 1000px;">
        <thead>
          <tr>
            <th width="40"><input type="checkbox" id="tr-bulk-select-all" /></th>
            <th>Priority</th>
            <th>App ID</th>
            <th>Applicant / Org</th>
            <th>SRF Version</th>
            <th>Pending/Total Questions</th>
            <th>Status</th>
            <th>Submitted At</th>
            <th>Reviewer</th>
            <th width="120">Action</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(item => {
            const pri = item.priority;
            const dateStr = item.submissionDate ? new Date(item.submissionDate).toLocaleDateString('en-IN') : '—';
            return `
              <tr data-app-id="${item.appId}">
                <td><input type="checkbox" class="tr-bulk-checkbox" data-app-id="${item.appId}" /></td>
                <td>
                  <span style="font-weight: 700; color: ${pri.color}; font-size:11.5px; display:inline-flex; align-items:center; gap:4px;">
                    <span style="width:6px; height:6px; border-radius:50%; background:${pri.color};"></span>
                    ${pri.label}
                  </span>
                </td>
                <td><strong style="color:var(--text-main); font-size:12.5px;">${item.appId}</strong></td>
                <td>
                  <span style="font-size:12.5px; font-weight:600; display:block; color:var(--text-main);">${item.userName}</span>
                  <span style="font-size:11px; color:var(--text-muted);">${item.userOrganization}</span>
                </td>
                <td><span class="status-badge" style="background:rgba(99,102,241,0.06); color:var(--accent-indigo); font-size:11px; padding:2px 6px;">${item.editionName}</span></td>
                <td>
                  <strong style="color:var(--accent-indigo); font-size:13px;">${item.pendingQuestionsCount} / ${item.totalQuestionsCount}</strong>
                </td>
                <td>${getStatusBadge(item.status)}</td>
                <td style="font-size:12px; color:var(--text-muted);">${dateStr}</td>
                <td style="font-size:12px; font-weight:500; color:var(--text-main);">${item.reviewerName}</td>
                <td>
                  <button class="btn btn-action-text btn-start-app-review" data-app-id="${item.appId}" style="display:inline-flex; align-items:center; gap:4px; font-weight:700;">
                    ⚡ Start Review
                  </button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>

    <!-- Bulk Action bar -->
    <div id="tr-bulk-action-bar" class="tr-bulk-bar hidden">
      <span style="font-size:13.5px; font-weight:600; color:var(--text-main);">
        <strong id="tr-bulk-selected-count" style="color:var(--accent-indigo);">0</strong> applications selected
      </span>
      <div style="display:flex; gap:10px;">
        <button class="btn btn-secondary" id="btn-bulk-reject" style="border-color:#ef4444; color:#ef4444;">Bulk Reject</button>
        <button class="btn btn-primary" id="btn-bulk-approve">Bulk Approve</button>
      </div>
    </div>
  `;

  // Bind Bulk Selection Event Listeners
  const selectAll = tableContainer.querySelector('#tr-bulk-select-all');
  const checkboxes = tableContainer.querySelectorAll('.tr-bulk-checkbox');
  const bulkBar = tableContainer.querySelector('#tr-bulk-action-bar');
  const bulkCount = tableContainer.querySelector('#tr-bulk-selected-count');

  const updateBulkBar = () => {
    const selected = tableContainer.querySelectorAll('.tr-bulk-checkbox:checked');
    if (selected.length > 0) {
      bulkBar.classList.remove('hidden');
      bulkCount.textContent = selected.length;
    } else {
      bulkBar.classList.add('hidden');
    }
  };

  selectAll.addEventListener('change', () => {
    checkboxes.forEach(cb => cb.checked = selectAll.checked);
    updateBulkBar();
  });

  checkboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      if (!cb.checked) selectAll.checked = false;
      updateBulkBar();
    });
  });

  // Action listeners inside table
  tableContainer.querySelectorAll('.btn-start-app-review').forEach(btn => {
    btn.addEventListener('click', () => {
      const { appId } = btn.dataset;
      openReviewWorkspace(appId, null);
    });
  });

  // Bind Bulk Buttons
  tableContainer.querySelector('#btn-bulk-approve')?.addEventListener('click', () => {
    const selectedAppIds = Array.from(tableContainer.querySelectorAll('.tr-bulk-checkbox:checked')).map(cb => cb.dataset.appId);
    
    // Find all questions (fields) inside the selected applications that are pending review
    const db = Store.getDb();
    const selected = [];
    selectedAppIds.forEach(appId => {
      const app = db.applications.find(a => a.id === appId);
      if (!app) return;
      
      const fields = (db.formFields || []).filter(f => f.editionId === app.editionId && !f.isLayoutElement);
      fields.forEach(field => {
        const ans = db.applicationAnswers.find(a => a.applicationId === appId && a.fieldId === field.id);
        const qStatus = ans?.questionStatus || 'Pending Review';
        if (qStatus === 'Submitted' || qStatus === 'Under Review' || qStatus === 'Pending Review' || qStatus === 'Resubmitted') {
          selected.push({ appId, fieldId: field.id });
        }
      });
    });
    
    if (selected.length === 0) {
      showToast('No pending questions to approve in selected applications.', 'info');
      return;
    }
    triggerBulkApproval(selected, container);
  });

  tableContainer.querySelector('#btn-bulk-reject')?.addEventListener('click', () => {
    const selectedAppIds = Array.from(tableContainer.querySelectorAll('.tr-bulk-checkbox:checked')).map(cb => cb.dataset.appId);
    
    const db = Store.getDb();
    const selected = [];
    selectedAppIds.forEach(appId => {
      const app = db.applications.find(a => a.id === appId);
      if (!app) return;
      
      const fields = (db.formFields || []).filter(f => f.editionId === app.editionId && !f.isLayoutElement);
      fields.forEach(field => {
        const ans = db.applicationAnswers.find(a => a.applicationId === appId && a.fieldId === field.id);
        const qStatus = ans?.questionStatus || 'Pending Review';
        if (qStatus === 'Submitted' || qStatus === 'Under Review' || qStatus === 'Pending Review' || qStatus === 'Resubmitted') {
          selected.push({ appId, fieldId: field.id });
        }
      });
    });
    
    if (selected.length === 0) {
      showToast('No pending questions to reject in selected applications.', 'info');
      return;
    }
    triggerBulkRejection(selected, container);
  });
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WORKSPACE: SPLIT PANE DETAIL REVIEW WORKSPACE
 * ═══════════════════════════════════════════════════════════════════════════
 */
function openReviewWorkspace(appId, fieldId) {
  activeWorkspaceAppId = appId;
  activeWorkspaceFieldId = fieldId;
  activeWorkspaceSelectedFileId = null;

  const workspaceContainer = document.getElementById('admin-review-tasks-view');
  renderWorkspace(workspaceContainer);
}

function renderWorkspace(container) {
  injectStyles();
  const db = Store.getDb();
  const appId = activeWorkspaceAppId;
  const activeFieldId = activeWorkspaceFieldId;

  const app = Store.getApplicationById(appId);
  const applicant = Store.getUserById(app?.userId);
  const edition = Store.getEditionById(app?.editionId);

  if (!app || !applicant || !edition) {
    container.innerHTML = `<div class="empty-state"><h3>Application details not found</h3></div>`;
    return;
  }

  // LOCKING MECHANISM
  const currentUser = getCurrentUser();
  const now = Date.now();
  const lockTime = app.reviewLockedAt ? new Date(app.reviewLockedAt).getTime() : 0;
  const isLockedByOther = app.reviewLockedBy && app.reviewLockedBy !== currentUser.id && (now - lockTime < 10 * 60000);
  
  let isReadOnly = false;
  let lockBannerHtml = '';
  if (isLockedByOther) {
    isReadOnly = true;
    const lockHolder = Store.getUserById(app.reviewLockedBy);
    const lockHolderName = lockHolder ? (lockHolder.name || lockHolder.username) : app.reviewLockedBy;
    lockBannerHtml = `
      <div class="sla-alert-banner" style="background:#fffbeb; border-color:#fef3c7; border-left:4px solid #f59e0b; color:#d97706; margin-bottom:12px;">
        <span>🔒</span>
        <div>
          <strong>READ ONLY ACCESS:</strong> This application is currently being reviewed by <strong>${lockHolderName}</strong> (Locked at ${new Date(app.reviewLockedAt).toLocaleTimeString('en-IN')}). You cannot make edits.
        </div>
      </div>
    `;
  } else {
    // Acquire/Refresh lock for current user
    Store.lockApplication(appId, currentUser.id);
    lockBannerHtml = `
      <div style="background:#e6fffa; border:1px solid #b2f5ea; border-left:4px solid #319795; border-radius:8px; padding:8px 16px; margin-bottom:12px; color:#234e52; font-size:12.5px; display:flex; align-items:center; gap:8px; box-shadow:var(--shadow-sm);">
        <span>🔓</span>
        <div>
          <strong>EXCLUSIVE LOCK:</strong> You are reviewing this application. Other reviewers will see it as read-only.
        </div>
      </div>
    `;
  }

  // Get all fields/questions under this application's edition
  const allFields = db.formFields || [];
  const fields = allFields.filter(f => f.editionId === app.editionId && !f.isLayoutElement);

  // If role is admin, restrict visible questions list to only their assignments
  let reviewableFields = [...fields];
  if (currentUser.role === 'admin') {
    const adminAssignments = Store.getAllAssignments().filter(a => a.userId === currentUser.id && a.editionId === app.editionId);
    reviewableFields = reviewableFields.filter(f => {
      return adminAssignments.some(a => {
        if (a.type === 'Question' && (a.fieldId === f.id || a.questionId === f.id)) return true;
        if (a.type === 'Action Point' && a.actionPointId === f.actionPointId) return true;
        if ((a.type === 'Reform Area' || a.type === 'Section') && (a.sectionId === f.reformAreaId || a.reformAreaId === f.reformAreaId)) return true;
        return false;
      });
    });
  }

  // Current active question
  const activeField = fields.find(f => f.id === activeFieldId) || reviewableFields[0];
  if (!activeField) {
    container.innerHTML = `<div class="empty-state"><h3>No reviewable questions found in this application</h3></div>`;
    return;
  }
  activeWorkspaceFieldId = activeField.id;

  const activeAns = db.applicationAnswers?.find(a => a.applicationId === appId && a.fieldId === activeField.id);
  const activeStatus = activeAns?.questionStatus || 'Pending Review';

  // Build comments/remarks history
  let commentsHtml = '';
  if (activeAns?.remarksHistory && Array.isArray(activeAns.remarksHistory)) {
    commentsHtml = activeAns.remarksHistory.map(comm => `
      <div class="tr-comment-item">
        <div class="tr-comment-header">
          <span class="tr-comment-author">${comm.username} (${comm.role.toUpperCase()})</span>
          <span class="tr-comment-date">${new Date(comm.timestamp).toLocaleString('en-IN')}</span>
        </div>
        <div class="tr-comment-text">${comm.text}</div>
      </div>
    `).join('');
  } else if (activeAns?.adminRemarks) {
    commentsHtml = `
      <div class="tr-comment-item">
        <div class="tr-comment-header">
          <span class="tr-comment-author">Reviewer</span>
        </div>
        <div class="tr-comment-text">${activeAns.adminRemarks}</div>
      </div>
    `;
  } else {
    commentsHtml = `<div style="text-align:center; padding:12px; font-size:12px; color:var(--text-muted);">No comments history on this question.</div>`;
  }

  // Build Document Review panel
  const filesList = activeAns?.files || [];
  let filesHtml = '';
  if (filesList.length > 0) {
    filesHtml = filesList.map((file, idx) => {
      const fileStatusCls = file.fileStatus === 'Approved' ? 'status-badge-green' : (file.fileStatus === 'Rejected' ? 'status-badge-red' : 'status-badge-orange');
      return `
        <div class="tr-doc-card">
          <div class="tr-doc-header">
            <span class="tr-doc-title">${file.name}</span>
            <span class="status-badge ${fileStatusCls}" style="font-size:10px; font-weight:700;">${file.fileStatus || 'Pending'}</span>
          </div>
          <div class="tr-doc-meta">
            <span>Uploaded: ${file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString('en-IN') : '—'}</span>
            <span>By: ${file.uploadedBy || 'User'}</span>
            <span>Version: v${file.version || 1}</span>
          </div>
          ${file.fileRejectionReason ? `<div style="font-size:11px; color:#ef4444; background:rgba(239,68,68,0.04); padding:6px; border-radius:4px;"><strong>Rejection Note:</strong> ${file.fileRejectionReason}</div>` : ''}
          <div class="tr-doc-actions">
            <button class="btn btn-outline btn-xs btn-tr-view-doc" data-doc-id="${file.docId}" data-doc-name="${file.name}">👁️ View</button>
            <button class="btn btn-outline btn-xs btn-tr-download-doc" data-doc-id="${file.docId}" data-doc-name="${file.name}">📥 Download</button>
            <button class="btn btn-outline btn-xs btn-tr-tab-doc" data-doc-id="${file.docId}" data-doc-name="${file.name}">🌐 Open Tab</button>
            <button class="btn btn-xs btn-success btn-tr-approve-doc" data-doc-id="${file.docId}" style="padding:4px 8px;font-size:10.5px;" ${isReadOnly ? 'disabled style="opacity:0.5; pointer-events:none;"' : ''}>✓ Approve</button>
            <button class="btn btn-xs btn-danger btn-tr-reject-doc" data-doc-id="${file.docId}" style="padding:4px 8px;font-size:10.5px;" ${isReadOnly ? 'disabled style="opacity:0.5; pointer-events:none;"' : ''}>✗ Reject</button>
          </div>
        </div>
      `;
    }).join('');
  } else {
    filesHtml = `<div style="text-align:center; padding:20px; border:1px dashed var(--border-color); border-radius:8px; font-size:12.5px; color:var(--text-muted);">No supporting documents have been uploaded for this question.</div>`;
  }

  // User answer details formatting
  let answerContentHtml = '';
  if (activeAns?.value) {
    if (activeAns.value.startsWith('{')) {
      try {
        const parsed = JSON.parse(activeAns.value);
        let elementsList = activeField.elements || [];
        if (typeof elementsList === 'string') elementsList = JSON.parse(elementsList);
        
        answerContentHtml = `
          <div style="background:var(--bg-deep); border-radius:8px; border:1px solid var(--border-color); overflow:hidden;">
            <table style="width:100%; border-collapse:collapse; font-size:13px;">
              <thead style="background:rgba(0,0,0,0.02); border-bottom:1px solid var(--border-color);">
                <tr>
                  <th style="text-align:left; padding:8px 12px; font-weight:700;">Element</th>
                  <th style="text-align:left; padding:8px 12px; font-weight:700;">Value / Input</th>
                </tr>
              </thead>
              <tbody>
                ${elementsList.map(el => `
                  <tr style="border-bottom:1px solid var(--border-color);">
                    <td style="padding:8px 12px; font-weight:600; color:var(--text-main);">${el.label || el.placeholder || el.id}</td>
                    <td style="padding:8px 12px; color:var(--text-dark);">${parsed[el.id] !== undefined ? parsed[el.id] : '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      } catch (e) {
        answerContentHtml = `<div style="background:var(--bg-deep); border:1px solid var(--border-color); border-radius:8px; padding:12px; font-size:13.5px; line-height:1.4; white-space:pre-wrap; color:var(--text-dark);">${activeAns.value}</div>`;
      }
    } else {
      answerContentHtml = `<div style="background:var(--bg-deep); border:1px solid var(--border-color); border-radius:8px; padding:12px; font-size:13.5px; line-height:1.4; white-space:pre-wrap; color:var(--text-dark);">${activeAns.value}</div>`;
    }
  } else {
    answerContentHtml = `<div style="text-align:center; padding:20px; font-style:italic; color:var(--text-muted); font-size:13px;">No answer text provided.</div>`;
  }

  // Version comparison switcher selector
  const submissions = app.submissions || [];
  let compareSelectHtml = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; background:var(--bg-deep); border:1px solid var(--border-color); border-radius:8px; padding:8px 12px;">
      <span style="font-size:12.5px; font-weight:700; color:var(--text-main);">Submission Version Switcher:</span>
      <select id="tr-version-compare-select" class="form-input form-select" style="width:200px; height:30px; font-size:12px; padding:2px 8px; margin:0;">
        <option value="current" ${activeWorkspaceCompareVersion === 'current' ? 'selected' : ''}>Current Version (Active)</option>
        ${submissions.map(sub => `
          <option value="${sub.submissionIndex}" ${activeWorkspaceCompareVersion == sub.submissionIndex ? 'selected' : ''}>Version v${sub.submissionIndex} (${new Date(sub.submittedAt).toLocaleDateString('en-IN')})</option>
        `).join('')}
      </select>
    </div>
  `;

  let workspaceColumnsHtml = '';
  if (activeWorkspaceCompareVersion === 'current') {
    workspaceColumnsHtml = `
      <div class="tr-workspace-columns">
        <!-- LEFT COMPARISON: QUESTION -->
        <div class="tr-comparison-pane" style="border-right: 1px solid var(--border-color); padding-right: 16px;">
          <div class="tr-q-details-box">
            <div class="tr-q-title-label">Question Text</div>
            <div class="tr-q-text-value">Q${activeField.num}: ${activeField.label || activeField.text}</div>
          </div>
          ${activeField.helpText ? `
            <div style="font-size:12px; color:var(--text-muted); background:rgba(0,0,0,0.01); border:1px solid var(--border-color); border-radius:6px; padding:10px;">
              <strong>Guideline Help Text:</strong><br>${activeField.helpText}
            </div>
          ` : ''}
        </div>

        <!-- RIGHT COMPARISON: USER ANSWER & FILES -->
        <div class="tr-comparison-pane">
          <div class="tr-q-title-label">User Submitted Answer</div>
          ${answerContentHtml}

          <div class="tr-q-title-label" style="margin-top: 10px;">Supporting Documents</div>
          <div style="flex:1; overflow-y:auto;">
            ${filesHtml}
          </div>
        </div>
      </div>
    `;
  } else {
    const selectedSubIdx = parseInt(activeWorkspaceCompareVersion);
    const selectedSub = submissions.find(s => s.submissionIndex === selectedSubIdx);
    const snapAns = selectedSub?.answersSnapshot?.find(sa => sa.fieldId === activeField.id);

    let snapAnswerContentHtml = '';
    if (snapAns?.value) {
      if (snapAns.value.startsWith('{')) {
        try {
          const parsed = JSON.parse(snapAns.value);
          let elementsList = activeField.elements || [];
          if (typeof elementsList === 'string') elementsList = JSON.parse(elementsList);
          snapAnswerContentHtml = `
            <div style="background:var(--bg-deep); border-radius:8px; border:1px solid var(--border-color); overflow:hidden;">
              <table style="width:100%; border-collapse:collapse; font-size:12px;">
                <tbody>
                  ${elementsList.map(el => `
                    <tr style="border-bottom:1px solid var(--border-color);">
                      <td style="padding:6px 10px; font-weight:600; color:var(--text-main);">${el.label || el.placeholder || el.id}</td>
                      <td style="padding:6px 10px; color:var(--text-dark);">${parsed[el.id] !== undefined ? parsed[el.id] : '—'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `;
        } catch(e) {
          snapAnswerContentHtml = `<div style="background:var(--bg-deep); border:1px solid var(--border-color); border-radius:8px; padding:10px; font-size:12.5px; white-space:pre-wrap; color:var(--text-dark);">${snapAns.value}</div>`;
        }
      } else {
        snapAnswerContentHtml = `<div style="background:var(--bg-deep); border:1px solid var(--border-color); border-radius:8px; padding:10px; font-size:12.5px; white-space:pre-wrap; color:var(--text-dark);">${snapAns.value}</div>`;
      }
    } else {
      snapAnswerContentHtml = `<div style="text-align:center; padding:15px; font-style:italic; color:var(--text-muted); font-size:12px;">No answer text provided.</div>`;
    }

    const snapFiles = snapAns?.files || [];
    let snapFilesHtml = '';
    if (snapFiles.length > 0) {
      snapFilesHtml = snapFiles.map(file => {
        const isRemovedInLatest = !filesList.some(f => f.name === file.name);
        return `
          <div class="tr-doc-card" style="opacity: 0.85; padding:8px;">
            <div class="tr-doc-header">
              <span class="tr-doc-title" style="font-size:11.5px;">${file.name}</span>
              ${isRemovedInLatest ? `<span class="status-badge status-badge-red" style="font-size:8px; font-weight:700; padding:1px 3px;">REMOVED IN LATEST</span>` : ''}
            </div>
          </div>
        `;
      }).join('');
    } else {
      snapFilesHtml = `<div style="text-align:center; padding:12px; font-size:11.5px; color:var(--text-muted);">No documents.</div>`;
    }

    const isTextDiff = snapAns?.value !== activeAns?.value;
    const diffBadge = isTextDiff ? `<span class="diff-highlight" style="margin-left:8px; vertical-align:middle; font-size:10px; padding:1px 4px;">CHANGED</span>` : '';

    const currentFilesProcessedHtml = filesList.map((file, idx) => {
      const isNewUpload = !snapFiles.some(f => f.name === file.name);
      const fileStatusCls = file.fileStatus === 'Approved' ? 'status-badge-green' : (file.fileStatus === 'Rejected' ? 'status-badge-red' : 'status-badge-orange');
      return `
        <div class="tr-doc-card" style="padding:8px;">
          <div class="tr-doc-header">
            <span class="tr-doc-title" style="font-size:11.5px;">${file.name}</span>
            <div style="display:flex; gap:4px; align-items:center;">
              ${isNewUpload ? `<span class="status-badge status-badge-green" style="font-size:8px; font-weight:700; background:#e6fffa; color:#047481; border:none; padding:1px 3px;">ADDED</span>` : ''}
              <span class="status-badge ${fileStatusCls}" style="font-size:8px; font-weight:700; padding:1px 3px;">${file.fileStatus || 'Pending'}</span>
            </div>
          </div>
          <div class="tr-doc-actions" style="margin-top:4px;">
            <button class="btn btn-outline btn-xs btn-tr-view-doc" data-doc-id="${file.docId}" data-doc-name="${file.name}" style="font-size:9.5px; padding:2px 4px;">👁️ View</button>
            <button class="btn btn-xs btn-success btn-tr-approve-doc" data-doc-id="${file.docId}" style="padding:2px 4px; font-size:9.5px;" ${isReadOnly ? 'disabled style="opacity:0.5; pointer-events:none;"' : ''}>✓ Approve</button>
            <button class="btn btn-xs btn-danger btn-tr-reject-doc" data-doc-id="${file.docId}" style="padding:2px 4px; font-size:9.5px;" ${isReadOnly ? 'disabled style="opacity:0.5; pointer-events:none;"' : ''}>✗ Reject</button>
          </div>
        </div>
      `;
    }).join('');

    workspaceColumnsHtml = `
      <div class="tr-q-details-box" style="margin-bottom:12px;">
        <div class="tr-q-title-label">Question Details (Q${activeField.num})</div>
        <div class="tr-q-text-value">Q${activeField.num}: ${activeField.label || activeField.text}</div>
        ${activeField.helpText ? `<div style="font-size:12px; color:var(--text-muted); margin-top:8px;"><strong>Help Text:</strong> ${activeField.helpText}</div>` : ''}
      </div>

      <div class="tr-workspace-columns">
        <!-- LEFT: OLD VERSION -->
        <div class="tr-comparison-pane" style="border-right: 1px solid var(--border-color); padding-right: 16px;">
          <div class="tr-q-title-label" style="color:var(--text-muted);">Version v${selectedSubIdx} (Historical)</div>
          ${snapAnswerContentHtml}
          
          <div class="tr-q-title-label" style="margin-top: 10px; color:var(--text-muted);">Historical Documents</div>
          <div style="flex:1; overflow-y:auto;">
            ${snapFilesHtml}
          </div>
        </div>

        <!-- RIGHT: CURRENT VERSION -->
        <div class="tr-comparison-pane">
          <div class="tr-q-title-label">Current Active Version ${diffBadge}</div>
          <div style="${isTextDiff ? 'border:1px solid #fef3c7; background:#fffbeb; border-radius:8px; padding:2px;' : ''}">
            ${answerContentHtml}
          </div>

          <div class="tr-q-title-label" style="margin-top: 10px;">Active Documents</div>
          <div style="flex:1; overflow-y:auto;">
            ${currentFilesProcessedHtml || `<div style="text-align:center; padding:15px; font-size:12px; color:var(--text-muted);">No documents.</div>`}
          </div>
        </div>
      </div>
    `;
  }

  // Render Full-Page Split Workspace
  container.innerHTML = `
    <div style="padding: 10px 0 20px 0; display:flex; flex-direction:column; gap:16px;">
      
      <!-- LOCK STATUS INDICATOR BANNER -->
      ${lockBannerHtml}

      <!-- HEADER PANEL -->
      <div class="tr-card" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div style="display:flex; align-items:center; gap:16px;">
          <button class="btn btn-outline btn-sm" id="btn-workspace-back" style="display:inline-flex; align-items:center; gap:4px; padding:4px 10px; height:32px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg> Back
          </button>
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <h2 style="margin:0; font-size:18px;">Review Detail Workspace</h2>
              <span class="status-badge" style="background:#e0e7ff; color:#4338ca; font-size:10px;">${edition.name}</span>
            </div>
            <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
              Application ID: <strong>${app.id}</strong> | Applicant: <strong>${applicant.name || applicant.username} (${applicant.organization})</strong>
            </div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:12px;">
          <div>
            <span style="font-size:11px; color:var(--text-muted); display:block; text-align:right;">Submission Date</span>
            <strong style="font-size:13px; color:var(--text-main);">${app.submittedAt ? new Date(app.submittedAt).toLocaleDateString('en-IN') : '—'}</strong>
          </div>
          <div>
            <span style="font-size:11px; color:var(--text-muted); display:block; text-align:right;">Application Status</span>
            <span class="status-badge" style="background:rgba(99,102,241,0.06); color:var(--accent-indigo); border:none; font-weight:700;">${app.status}</span>
          </div>
          ${app.status === 'Approved' ? `
            <button class="btn btn-outline btn-sm" id="btn-print-certificate" style="border-color:var(--accent-indigo); color:var(--accent-indigo); font-weight:700; height:36px; margin-right:8px;">Print Certificate</button>
          ` : ''}
          <button class="btn btn-primary btn-sm" id="btn-workspace-finalize" style="background:var(--accent-purple); border:none; font-weight:700; height:36px;" ${isReadOnly ? 'disabled style="opacity:0.5; pointer-events:none;"' : ''}>Finalize Review</button>
        </div>
      </div>

      <!-- THREE COLUMN SPLIT WORKSPACE -->
      <div class="tr-workspace-layout">
        
        <!-- LEFT COLUMN: QUESTION NAV SIDEBAR -->
        <div class="tr-workspace-left">
          <div class="tr-panel-header">
            <span>Questions in Application</span>
            <span class="status-badge" style="font-size:10px; background:rgba(0,0,0,0.04);">${reviewableFields.length} Tasks</span>
          </div>
          <div class="tr-panel-body" style="padding:10px;">
            ${reviewableFields.map(f => {
              const ansObj = db.applicationAnswers?.find(a => a.applicationId === appId && a.fieldId === f.id);
              const stat = ansObj?.questionStatus || 'Pending Review';
              
              let icon = '⚪';
              if (stat === 'Approved') icon = '🟢';
              else if (stat === 'Rejected') icon = '🔴';
              else if (stat === 'Additional Documents Requested' || stat === 'Docs Requested') icon = '🟡';
              else if (stat === 'Resubmitted') icon = '🟣';
              else if (stat === 'Submitted' || stat === 'Under Review') icon = '🔵';

              return `
                <div class="tr-q-nav-item ${f.id === activeFieldId ? 'active' : ''}" data-field-id="${f.id}">
                  <div class="tr-q-nav-info">
                    <span class="tr-q-nav-num">Question ${f.num || ''}</span>
                    <span class="tr-q-nav-label" title="${f.label || f.text}">${f.label || f.text}</span>
                  </div>
                  <span style="font-size:12px;">${icon}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- CENTER COLUMN: QUESTION AND USER ANSWER (COMPARISON) -->
        <div class="tr-workspace-center">
          <div class="tr-panel-header">
            <span>Question &amp; Answer Workspace</span>
            <span>Q${activeField.num}</span>
          </div>
          <div class="tr-panel-body" style="display:flex; flex-direction:column; gap:16px;">
            ${compareSelectHtml}
            ${workspaceColumnsHtml}
            
            <!-- In-Workspace Document Preview Frame -->
            <div id="tr-preview-container" style="border:1px solid var(--border-color); border-radius:8px; height: 260px; display:none; flex-direction:column; overflow:hidden; background:var(--bg-deep);">
              <div style="background:var(--bg-deep); padding:8px 12px; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; font-size:11.5px; font-weight:700;">
                <span id="tr-preview-filename">Preview Document</span>
                <button class="btn btn-outline btn-xs" id="btn-tr-close-preview" style="padding:2px 6px;">Close Preview</button>
              </div>
              <div id="tr-preview-frame-body" style="flex:1; display:flex; align-items:center; justify-content:center; overflow:hidden;"></div>
            </div>
          </div>
        </div>

        <!-- RIGHT COLUMN: DECISION PANEL -->
        <div class="tr-workspace-right">
          <div class="tr-panel-header">
            <span>Reviewer Decision Panel</span>
            ${getStatusBadge(activeStatus)}
          </div>
          <div class="tr-panel-body" style="display:flex; flex-direction:column; gap:16px;">
            
            <!-- Score Indicator (Calculated Automatically) -->
            <div style="background:rgba(99,102,241,0.03); border:1px solid var(--border-color); border-radius:8px; padding:12px; text-align:center;">
              <span style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; display:block; margin-bottom:4px;">Evaluation Marks</span>
              <div style="font-size:24px; font-weight:800; color:var(--accent-indigo);">
                ${['Approved', 'Rejected'].includes(activeStatus) ? (activeAns?.questionScore || 0) : '—'}
                <span style="font-size:13px; color:var(--text-muted); font-weight:500;">/ ${activeField.maxScore || activeField.weight || 1} Marks</span>
              </div>
              <span style="font-size:10px; color:var(--text-muted); display:block; margin-top:4px;">* Marks computed automatically on compliance validation</span>
            </div>

            <!-- Action buttons -->
            <div style="display:grid; grid-template-columns: 1fr; gap:10px;">
              ${!isAnswerValid(activeAns, activeField) ? `
                <div style="color: #ef4444; font-size: 12px; font-weight: 600; padding: 10px; border: 1px solid #fee2e2; background: #fef2f2; border-radius: 8px; line-height: 1.4;">
                  ⚠️ Cannot approve unanswered question. Question contains no valid response.
                </div>
                <button class="btn btn-primary" id="btn-workspace-approve" style="background:#10b981; border:none; font-weight:700; opacity:0.5; pointer-events:none;" disabled>Approve Question</button>
              ` : `
                <button class="btn btn-primary" id="btn-workspace-approve" style="background:#10b981; border:none; font-weight:700;" ${isReadOnly ? 'disabled style="opacity:0.5; pointer-events:none;"' : ''}>Approve Question</button>
              `}
              <button class="btn btn-secondary" id="btn-workspace-reject" style="background:#ef4444; border:none; color:white; font-weight:700;" ${isReadOnly ? 'disabled style="opacity:0.5; pointer-events:none;"' : ''}>Reject Question</button>
              <button class="btn btn-outline" id="btn-workspace-req-docs" style="border-color:#f59e0b; color:#f59e0b; font-weight:700;" ${isReadOnly ? 'disabled style="opacity:0.5; pointer-events:none;"' : ''}>Request Additional Docs</button>
              <button class="btn btn-secondary" id="btn-workspace-escalate" style="background:#f59e0b; border:none; color:white; font-weight:700;" ${isReadOnly ? 'disabled style="opacity:0.5; pointer-events:none;"' : ''}>Escalate Review</button>
            </div>

            <!-- Add Remark -->
            <div>
              <label style="font-size:11.5px; font-weight:700; color:var(--text-muted); display:block; margin-bottom:6px;">Add Reviewer Remark</label>
              <textarea id="tr-remark-textarea" class="form-input" placeholder="Type your comment/remark here..." style="min-height:70px; font-size:12.5px; resize:vertical; padding:8px 10px;" ${isReadOnly ? 'disabled' : ''}></textarea>
              <button class="btn btn-outline btn-sm" id="btn-workspace-add-remark" style="margin-top:8px; width:100%; font-weight:700;" ${isReadOnly ? 'disabled style="opacity:0.5; pointer-events:none;"' : ''}>Post Comment / Remark</button>
            </div>

            <!-- Private Reviewer Notes -->
            <div style="border-top: 1px solid var(--border-color); padding-top: 12px;">
              <label style="font-size:11.5px; font-weight:700; color:#4f46e5; display:block; margin-bottom:6px;">Private Reviewer Notes</label>
              <textarea id="tr-private-notes" class="form-input" placeholder="Type private comments only visible to administrators..." style="min-height:70px; font-size:12px; resize:vertical; padding:6px;" ${isReadOnly ? 'disabled' : ''}>${app.reviewerNotes || ''}</textarea>
              <button class="btn btn-outline btn-xs" id="btn-save-private-notes" style="margin-top:6px; width:100%; font-weight:700; font-size:11px;" ${isReadOnly ? 'disabled style="opacity:0.5; pointer-events:none;"' : ''}>Save Private Notes</button>
            </div>

            <!-- Remarks history timeline -->
            <div>
              <label style="font-size:11.5px; font-weight:700; color:var(--text-muted); display:block; margin-bottom:6px; border-bottom:1px solid var(--border-color); padding-bottom:4px;">Comments History Log</label>
              <div class="tr-comment-timeline" style="max-height:160px; overflow-y:auto; padding-right:4px;">
                ${commentsHtml}
              </div>
            </div>

            <!-- Application Audit Timeline -->
            <div style="border-top: 1px solid var(--border-color); padding-top: 12px;">
              <label style="font-size:11.5px; font-weight:700; color:var(--text-muted); display:block; margin-bottom:6px; border-bottom:1px solid var(--border-color); padding-bottom:4px;">Application Audit Timeline</label>
              <div class="tr-comment-timeline" style="max-height:160px; overflow-y:auto; padding-right:4px;">
                ${(app.timeline || []).slice().reverse().map(item => `
                  <div style="font-size:11px; margin-bottom:8px; padding-bottom:6px; border-bottom:1px dashed var(--border-color);">
                    <div style="display:flex; justify-content:space-between; font-weight:600; color:var(--text-main);">
                      <span>${item.action}</span>
                      <span style="color:var(--text-muted); font-weight:400; font-size:9.5px;">${new Date(item.timestamp).toLocaleString('en-IN')}</span>
                    </div>
                    <div style="color:var(--text-dark); margin-top:2px;">${item.details}</div>
                    <div style="color:var(--text-muted); font-size:9.5px; margin-top:1px;">By: ${item.userId}</div>
                  </div>
                `).join('') || '<div style="text-align:center; padding:12px; font-size:11px; color:var(--text-muted);">No timeline logs.</div>'}
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  `;

  // Bind version switcher select
  container.querySelector('#tr-version-compare-select')?.addEventListener('change', (e) => {
    activeWorkspaceCompareVersion = e.target.value;
    renderWorkspace(container);
  });

  // Bind private notes save button
  container.querySelector('#btn-save-private-notes')?.addEventListener('click', () => {
    if (isReadOnly) return;
    const notesVal = container.querySelector('#tr-private-notes').value;
    Store.savePrivateReviewerNotes(appId, notesVal);
    showToast('Private notes saved.', 'success');
  });

  // Bind print certificate button
  container.querySelector('#btn-print-certificate')?.addEventListener('click', () => {
    printApprovalCertificate(app);
  });

  // Bind escalate button
  container.querySelector('#btn-workspace-escalate')?.addEventListener('click', () => {
    if (isReadOnly) return;
    openEscalateReviewModal(appId, container);
  });

  // Bind sidebar question navigation click
  container.querySelectorAll('.tr-q-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const fid = item.dataset.fieldId;
      openReviewWorkspace(appId, fid);
    });
  });

  // Bind workspace header back button
  container.querySelector('#btn-workspace-back').addEventListener('click', () => {
    // Release Lock if owned by current user
    if (!isReadOnly) {
      Store.unlockApplication(appId);
    }
    activeWorkspaceAppId = null;
    activeWorkspaceFieldId = null;
    activeWorkspaceSelectedFileId = null;
    activeWorkspaceCompareVersion = 'current';
    renderTaskReviewPanel(container);
  });

  // Bind approve, reject, docs request, add comments
  const remarkTextarea = container.querySelector('#tr-remark-textarea');

  container.querySelector('#btn-workspace-approve')?.addEventListener('click', () => {
    if (isReadOnly) return;
    if (!isAnswerValid(activeAns, activeField)) {
      showToast('Cannot approve unanswered question. Question contains no valid response.', 'error');
      return;
    }
    const scoreToAward = activeField.maxScore || activeField.weight || 1;
    approveQuestionAction(appId, activeField.id, scoreToAward, remarkTextarea.value, container);
  });

  container.querySelector('#btn-workspace-reject')?.addEventListener('click', () => {
    if (isReadOnly) return;
    showPrompt({
      title: 'Reject Question',
      message: 'Enter reason/remarks for rejecting this answer (score will be set to 0):',
      placeholder: 'Explain why the answer was rejected...',
      onConfirm: (reason) => {
        rejectQuestionAction(appId, activeField.id, reason, container);
      }
    });
  });

  container.querySelector('#btn-workspace-req-docs')?.addEventListener('click', () => {
    if (isReadOnly) return;
    openRequestDocumentsModal(appId, activeField, container);
  });

  container.querySelector('#btn-workspace-add-remark')?.addEventListener('click', () => {
    if (isReadOnly) return;
    const text = remarkTextarea.value.trim();
    if (!text) {
      showToast('Comment text cannot be empty.', 'warning');
      return;
    }
    addQuestionCommentAction(appId, activeField.id, text, container);
  });

  // Document action buttons
  container.querySelectorAll('.btn-tr-view-doc').forEach(btn => {
    btn.addEventListener('click', () => {
      const docId = btn.dataset.docId;
      const docName = btn.dataset.docName;
      previewDocumentInline(appId, activeField.id, docId, docName, container);
    });
  });

  container.querySelectorAll('.btn-tr-download-doc').forEach(btn => {
    btn.addEventListener('click', () => {
      const docId = btn.dataset.docId;
      const docName = btn.dataset.docName;
      downloadDocument(appId, activeField.id, docId, docName);
    });
  });

  container.querySelectorAll('.btn-tr-tab-doc').forEach(btn => {
    btn.addEventListener('click', () => {
      const docId = btn.dataset.docId;
      openDocumentInNewTab(appId, activeField.id, docId);
    });
  });

  container.querySelectorAll('.btn-tr-approve-doc').forEach(btn => {
    btn.addEventListener('click', () => {
      if (isReadOnly) return;
      const docId = btn.dataset.docId;
      approveDocumentAction(appId, activeField.id, docId, container);
    });
  });

  container.querySelectorAll('.btn-tr-reject-doc').forEach(btn => {
    btn.addEventListener('click', () => {
      if (isReadOnly) return;
      const docId = btn.dataset.docId;
      showPrompt({
        title: 'Reject Document',
        message: 'Enter reason/remarks for rejecting this document:',
        placeholder: 'Specify what is incorrect or missing...',
        onConfirm: (reason) => {
          rejectDocumentAction(appId, activeField.id, docId, reason, container);
        }
      });
    });
  });

  container.querySelector('#btn-workspace-finalize')?.addEventListener('click', () => {
    if (isReadOnly) return;
    finalizeApplicationReviewAction(appId, fields, container);
  });

  container.querySelector('#btn-tr-close-preview')?.addEventListener('click', () => {
    const previewContainer = container.querySelector('#tr-preview-container');
    if (previewContainer) previewContainer.style.display = 'none';
  });
}

/**
 * Render Chart.js visual graphics.
 */
function renderCharts(queueItems) {
  // 1. Status Distribution
  const ctxStatus = document.getElementById('tr-chart-status')?.getContext('2d');
  if (ctxStatus) {
    // Destroy previous instance if any to prevent overlay
    if (window.trChartStatusInstance) window.trChartStatusInstance.destroy();

    const pending = queueItems.filter(q => q.status === 'Submitted' || q.status === 'Under Review' || q.status === 'Pending Review' || q.status === 'Resubmitted').length;
    const approved = queueItems.filter(q => q.status === 'Approved').length;
    const rejected = queueItems.filter(q => q.status === 'Rejected').length;
    const docs = queueItems.filter(q => q.status === 'Additional Documents Requested' || q.status === 'Docs Requested').length;

    window.trChartStatusInstance = new Chart(ctxStatus, {
      type: 'doughnut',
      data: {
        labels: ['Pending', 'Approved', 'Rejected', 'Docs Req.'],
        datasets: [{
          data: [pending, approved, rejected, docs],
          backgroundColor: ['#3b82f6', '#10b981', '#ef4444', '#f59e0b'],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } }
        }
      }
    });
  }

  // 2. Department Wise Submissions
  const ctxDept = document.getElementById('tr-chart-dept')?.getContext('2d');
  if (ctxDept) {
    if (window.trChartDeptInstance) window.trChartDeptInstance.destroy();

    const deptsMap = {};
    queueItems.forEach(q => {
      deptsMap[q.userOrganization] = (deptsMap[q.userOrganization] || 0) + 1;
    });

    const labels = Object.keys(deptsMap).slice(0, 5);
    const data = labels.map(l => deptsMap[l]);

    window.trChartDeptInstance = new Chart(ctxDept, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Questions Assigned',
          data: data,
          backgroundColor: '#8b5cf6',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { drawBorder: false }, ticks: { font: { size: 9 } } },
          x: { ticks: { font: { size: 9 } } }
        }
      }
    });
  }

  // 3. Edition Wise
  const ctxEdition = document.getElementById('tr-chart-edition')?.getContext('2d');
  if (ctxEdition) {
    if (window.trChartEditionInstance) window.trChartEditionInstance.destroy();

    const edMap = {};
    queueItems.forEach(q => {
      edMap[q.editionName] = (edMap[q.editionName] || 0) + 1;
    });

    const labels = Object.keys(edMap);
    const data = labels.map(l => edMap[l]);

    window.trChartEditionInstance = new Chart(ctxEdition, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Tasks Count',
          data: data,
          backgroundColor: '#3b82f6',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { font: { size: 9 } } },
          x: { ticks: { font: { size: 9 } } }
        }
      }
    });
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WORKFLOW BUSINESS LOGIC IMPLEMENTATION
 * ═══════════════════════════════════════════════════════════════════════════
 */

function approveQuestionAction(appId, fieldId, score, remarks, container) {
  const currentUser = getCurrentUser();
  try {
    const success = Store.approveQuestion(appId, fieldId, currentUser.id, score, remarks);
    if (success) {
      const db = Store.getDb();
      const ans = db.applicationAnswers.find(a => a.applicationId === appId && a.fieldId === fieldId);
      if (ans && remarks && remarks.trim()) {
        if (!ans.remarksHistory) ans.remarksHistory = [];
        ans.remarksHistory.push({
          userId: currentUser.id,
          username: currentUser.name || currentUser.username,
          role: currentUser.role,
          text: remarks.trim(),
          timestamp: new Date().toISOString()
        });
      }
      
      reviewsCompletedSession++;
      showToast('Question approved successfully.', 'success');
      renderWorkspace(container);
      syncGlobalStateWithoutReload(appId);
    } else {
      showToast('Failed to approve question.', 'error');
    }
  } catch (err) {
    showToast(err.message || 'Error approving question.', 'error');
  }
}

function rejectQuestionAction(appId, fieldId, reason, container) {
  const currentUser = getCurrentUser();
  const success = Store.rejectQuestion(appId, fieldId, currentUser.id, reason);
  if (success) {
    const db = Store.getDb();
    const ans = db.applicationAnswers.find(a => a.applicationId === appId && a.fieldId === fieldId);
    if (ans && reason && reason.trim()) {
      if (!ans.remarksHistory) ans.remarksHistory = [];
      ans.remarksHistory.push({
        userId: currentUser.id,
        username: currentUser.name || currentUser.username,
        role: currentUser.role,
        text: reason.trim(),
        timestamp: new Date().toISOString()
      });
    }
    
    reviewsCompletedSession++;
    showToast('Question rejected successfully.', 'success');
    renderWorkspace(container);
    syncGlobalStateWithoutReload(appId);
  } else {
    showToast('Failed to reject question.', 'error');
  }
}

/**
 * Add Question Comment action.
 */
function addQuestionCommentAction(appId, fieldId, text, container) {
  const currentUser = getCurrentUser();
  const db = Store.getDb();
  const ans = db.applicationAnswers.find(a => a.applicationId === appId && a.fieldId === fieldId);

  if (!ans) {
    showToast('Failed to find submitted answer to comment on.', 'error');
    return;
  }

  if (!ans.remarksHistory) ans.remarksHistory = [];
  ans.remarksHistory.push({
    userId: currentUser.id,
    username: currentUser.name || currentUser.username,
    role: currentUser.role,
    text: text,
    timestamp: new Date().toISOString()
  });
  ans.adminRemarks = text;
  Store.scheduleSave();

  showToast('Comment added successfully.', 'success');
  renderWorkspace(container);
}

/**
 * Open Modal to request additional documents.
 */
function openRequestDocumentsModal(appId, field, container) {
  const modalBackdrop = document.createElement('div');
  modalBackdrop.className = 'modal-backdrop-custom visible';

  modalBackdrop.innerHTML = `
    <div class="modal-card-custom animate-modal-in" style="max-width:520px; width:90%; padding:20px;">
      <h3 class="modal-title-custom" style="margin-bottom:12px;">Request Additional Documents</h3>
      <p style="font-size:12.5px; color:var(--text-muted); margin-bottom:16px;">
        Request the user to upload new or revised files for Question <strong>Q${field.num}</strong>.
      </p>

      <div class="form-group" style="margin-bottom:12px;">
        <label style="font-size:12px; font-weight:700; color:var(--text-main); display:block; margin-bottom:4px;">Reason / Instruction Note</label>
        <textarea id="modal-req-reason" class="form-input" placeholder="Explain what document is required and why..." style="min-height:80px; font-size:12.5px;" required></textarea>
      </div>

      <div class="form-group" style="margin-bottom:12px;">
        <label style="font-size:12px; font-weight:700; color:var(--text-main); display:block; margin-bottom:4px;">Target / Required Documents</label>
        <div style="max-height:100px; overflow-y:auto; border:1px solid var(--border-color); border-radius:6px; padding:8px; background:var(--bg-deep);">
          ${(field.docs || [{ id: 'doc_any', name: 'Supporting Evidence / Document' }]).map(d => `
            <div style="display:flex; align-items:center; gap:8px; font-size:12px; margin-bottom:4px;">
              <input type="checkbox" class="modal-req-file-cb" value="${d.name}" checked />
              <span>${d.name}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="form-group" style="margin-bottom:16px;">
        <label style="font-size:12px; font-weight:700; color:var(--text-main); display:block; margin-bottom:4px;">Due Date</label>
        <input type="date" id="modal-req-due-date" class="form-input" style="height:36px; font-size:12.5px;" value="${new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0]}" />
      </div>

      <div class="modal-actions-custom" style="display:flex; justify-content:flex-end; gap:8px;">
        <button class="btn btn-secondary" id="btn-modal-req-cancel">Cancel</button>
        <button class="btn btn-primary" id="btn-modal-req-submit" style="background:var(--accent-indigo); border:none;">Send Request</button>
      </div>
    </div>
  `;

  document.body.appendChild(modalBackdrop);

  const dismiss = () => document.body.removeChild(modalBackdrop);

  modalBackdrop.querySelector('#btn-modal-req-cancel').addEventListener('click', dismiss);
  modalBackdrop.querySelector('#btn-modal-req-submit').addEventListener('click', () => {
    const reason = modalBackdrop.querySelector('#modal-req-reason').value.trim();
    const dueDate = modalBackdrop.querySelector('#modal-req-due-date').value;
    const selectedFiles = Array.from(modalBackdrop.querySelectorAll('.modal-req-file-cb:checked')).map(cb => cb.value);

    if (!reason) {
      showToast('Reason/Note is required.', 'warning');
      return;
    }
    if (selectedFiles.length === 0) {
      showToast('At least one target document must be selected.', 'warning');
      return;
    }

    dismiss();
    requestDocumentsAction(appId, field.id, reason, dueDate, selectedFiles, container);
  });
}

/**
 * Request Documents workflow execution.
 */
function requestDocumentsAction(appId, fieldId, reason, dueDate, selectedFiles, container) {
  const currentUser = getCurrentUser();
  const db = Store.getDb();
  const ans = db.applicationAnswers.find(a => a.applicationId === appId && a.fieldId === fieldId);
  const field = Store.getFieldById(fieldId);

  if (!ans) {
    showToast('Failed to find submitted answer to request documents on.', 'error');
    return;
  }

  // Update status
  ans.questionStatus = 'Additional Documents Requested';
  ans.questionScore = 0; // set score to 0 during docs request
  ans.additionalDocsRequest = {
    reason,
    dueDate,
    requestedFiles: selectedFiles,
    timestamp: new Date().toISOString()
  };

  // Chronicle comment
  const commentText = `[Docs Requested] Required: ${selectedFiles.join(', ')}. Due: ${dueDate}. Reason: ${reason}`;
  if (!ans.remarksHistory) ans.remarksHistory = [];
  ans.remarksHistory.push({
    userId: currentUser.id,
    username: currentUser.name || currentUser.username,
    role: currentUser.role,
    text: commentText,
    timestamp: new Date().toISOString()
  });
  ans.adminRemarks = commentText;

  // Update application status to Docs Requested
  const app = Store.getApplicationById(appId);
  app.status = 'Additional Documents Requested';
  app.additionalDocsNote = commentText;
  app.updatedAt = new Date().toISOString();

  // Audit Logging
  Store.addAuditLog(
    currentUser.id,
    `Documents Requested: Q${field?.num || fieldId} in Application ${appId}`,
    'review',
    appId,
    JSON.stringify({ reviewerRole: currentUser.role, reason, dueDate, targetFiles: selectedFiles })
  );

  // Timeline Entry
  app.timeline = app.timeline || [];
  app.timeline.push({
    id: `tl_${Date.now()}`,
    action: 'Additional Documents Requested',
    details: `Reviewer requested files: ${selectedFiles.join(', ')} (Due: ${dueDate}). Reason: ${reason}`,
    userId: currentUser.id,
    timestamp: new Date().toISOString()
  });

  // Notification
  Store.addNotification(
    app.userId,
    'DOCUMENTS_REQUESTED',
    `Reviewer has requested additional documents for Question ${field?.num || ''}. Deadline: ${dueDate}`,
    appId
  );

  Store.scheduleSave();
  showToast('Documents requested successfully.', 'success');

  renderWorkspace(container);
  syncGlobalStateWithoutReload(appId);
}

/**
 * Approve specific document inside question answers.
 */
function approveDocumentAction(appId, fieldId, docId, container) {
  const currentUser = getCurrentUser();
  const db = Store.getDb();
  const ans = db.applicationAnswers.find(a => a.applicationId === appId && a.fieldId === fieldId);
  if (!ans) return;

  const file = (ans.files || []).find(f => f.docId === docId);
  if (!file) return;

  file.fileStatus = 'Approved';
  file.approvedBy = currentUser.id;
  file.approvedAt = new Date().toISOString();
  file.fileRejectionReason = '';

  Store.scheduleSave();
  showToast('Document approved.', 'success');
  renderWorkspace(container);
}

/**
 * Reject specific document inside question answers.
 */
function rejectDocumentAction(appId, fieldId, docId, reason, container) {
  const currentUser = getCurrentUser();
  const db = Store.getDb();
  const ans = db.applicationAnswers.find(a => a.applicationId === appId && a.fieldId === fieldId);
  if (!ans) return;

  const file = (ans.files || []).find(f => f.docId === docId);
  if (!file) return;

  file.fileStatus = 'Rejected';
  file.fileRejectionReason = reason || 'Non-compliant document.';
  file.rejectedBy = currentUser.id;
  file.rejectedAt = new Date().toISOString();

  // Flag question status to Docs Requested automatically on document rejection
  ans.questionStatus = 'Additional Documents Requested';
  ans.questionScore = 0;

  const app = Store.getApplicationById(appId);
  app.status = 'Additional Documents Requested';
  app.additionalDocsNote = `Document "${file.name}" was rejected. Reason: ${file.fileRejectionReason}`;

  Store.scheduleSave();
  showToast('Document rejected.', 'error');
  renderWorkspace(container);
  syncGlobalStateWithoutReload(appId);
}

/**
 * Finalize entire Application Review Completion.
 */
function finalizeApplicationReviewAction(appId, fields, container) {
  const db = Store.getDb();
  const app = Store.getApplicationById(appId);
  if (!app) return;

  // Completion checks
  // 1. Any question pending review?
  // 2. Any docs request pending?
  // 3. Any mandatory files missing?
  const answers = (db.applicationAnswers || []).filter(a => a.applicationId === appId);
  
  let pendingCount = 0;
  let docsReqCount = 0;
  let missingMandatoryDocs = false;

  fields.forEach(field => {
    const ans = answers.find(a => a.fieldId === field.id);
    const status = ans?.questionStatus || 'Pending Review';

    if (status === 'Submitted' || status === 'Under Review' || status === 'Pending Review' || status === 'Resubmitted') {
      pendingCount++;
    }
    if (status === 'Additional Documents Requested' || status === 'Docs Requested') {
      docsReqCount++;
    }

    // Check if mandatory documents exist
    if (field.docs && Array.isArray(field.docs)) {
      field.docs.forEach(doc => {
        if (doc.requirement === 'mandatory') {
          const docUploaded = ans?.files?.some(f => f.docId === doc.id && f.fileStatus === 'Approved');
          // If answer is valid and approved but mandatory doc not approved/uploaded
          if (ans?.questionStatus === 'Approved' && !docUploaded) {
            missingMandatoryDocs = true;
          }
        }
      });
    }
  });

  if (pendingCount > 0 || docsReqCount > 0 || missingMandatoryDocs) {
    showAlert({
      title: 'Review Completion Blocked',
      message: `
        Application cannot be approved until all review items are completed.<br><br>
        <strong>Issues Detected:</strong><br>
        - Pending reviews: <strong>${pendingCount}</strong> question(s)<br>
        - Document requests pending: <strong>${docsReqCount}</strong> question(s)<br>
        - Missing/Unapproved mandatory files: <strong>${missingMandatoryDocs ? 'Yes' : 'No'}</strong>
      `,
      type: 'warning'
    });
    return;
  }

  // All reviews completed successfully. Prompt superadmin/admin to Approve/Reject application.
  showConfirm({
    title: 'Finalize Application Review',
    message: `All questions and uploaded documents have been approved. Do you want to Approve or Reject application <strong>${app.id}</strong>?`,
    confirmText: 'Approve Application',
    cancelText: 'Reject Application',
    type: 'success',
    onConfirm: () => {
      approveApplicationFinal(app, container);
    },
    onCancel: () => {
      showPrompt({
        title: 'Reject Application Final',
        message: 'Enter final rejection reason note:',
        placeholder: 'Reason for overall application rejection...',
        onConfirm: (reason) => {
          rejectApplicationFinal(app, reason, container);
        }
      });
    }
  });
}

function approveApplicationFinal(app, container) {
  const currentUser = getCurrentUser();
  app.status = 'Approved';
  app.updatedAt = new Date().toISOString();

  // Audit log
  Store.addAuditLog(currentUser.id, `Application Approved Final: ${app.id}`, 'application-review', app.id);

  // Timeline
  app.timeline = app.timeline || [];
  app.timeline.push({
    id: `tl_${Date.now()}`,
    action: 'Application Approved',
    details: `Application marked as Approved by Reviewer ${currentUser.name || currentUser.username}`,
    userId: currentUser.id,
    timestamp: new Date().toISOString()
  });

  // Notification
  Store.addNotification(app.userId, 'APPLICATION_APPROVED', `Congratulations! Your SRF application ${app.id} has been Approved.`, app.id);

  Store.scheduleSave();
  showToast('Application approved successfully.', 'success');

  // Go back to queue dashboard
  activeWorkspaceAppId = null;
  activeWorkspaceFieldId = null;
  renderTaskReviewPanel(container);
  syncGlobalStateWithoutReload(app.id);
}

function rejectApplicationFinal(app, reason, container) {
  const currentUser = getCurrentUser();
  app.status = 'Rejected';
  app.rejectionReason = reason;
  app.updatedAt = new Date().toISOString();

  // Audit log
  Store.addAuditLog(currentUser.id, `Application Rejected Final: ${app.id} - Reason: ${reason}`, 'application-review', app.id);

  // Timeline
  app.timeline = app.timeline || [];
  app.timeline.push({
    id: `tl_${Date.now()}`,
    action: 'Application Rejected',
    details: `Application marked as Rejected. Reason: ${reason}`,
    userId: currentUser.id,
    timestamp: new Date().toISOString()
  });

  // Notification
  Store.addNotification(app.userId, 'APPLICATION_REJECTED', `Your SRF application ${app.id} has been Rejected. Reason: ${reason}`, app.id);

  Store.scheduleSave();
  showToast('Application rejected.', 'error');

  // Go back to queue dashboard
  activeWorkspaceAppId = null;
  activeWorkspaceFieldId = null;
  renderTaskReviewPanel(container);
  syncGlobalStateWithoutReload(app.id);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DOCUMENT INLINE VIEWER AND UTILS
 * ═══════════════════════════════════════════════════════════════════════════
 */
async function previewDocumentInline(appId, fieldId, docId, docName, container) {
  const previewContainer = container.querySelector('#tr-preview-container');
  const previewTitle = container.querySelector('#tr-preview-filename');
  const previewBody = container.querySelector('#tr-preview-frame-body');

  if (!previewContainer || !previewBody) return;

  previewContainer.style.display = 'flex';
  previewTitle.textContent = `Document Preview: ${docName || 'File'}`;
  previewBody.innerHTML = `<div style="color:var(--text-muted); font-size:12px;">⏳ Loading document preview...</div>`;

  const ans = Store.getAnswerByField(appId, fieldId);
  let fileObj = (ans?.files || []).find(f => f.docId === docId) || (ans?.files || []).find(f => f.name === docName);

  if (!fileObj?.dataUrl) {
    try {
      const res = await fetch(`/api/files/${appId}/${fieldId}`);
      if (res.ok) {
        const data = await res.json();
        const serverFiles = data.files || [];
        fileObj = serverFiles.find(f => f.docId === docId) || serverFiles.find(f => f.name === docName);
      }
    } catch(e) {
      console.error('[Preview] Failed inline fetch:', e);
    }
  }

  const isImage = (fileObj?.dataUrl && (fileObj.dataUrl.startsWith('data:image/') || fileObj.dataUrl.includes('image/'))) || 
                  (docName && docName.match(/\.(png|jpe?g|gif|webp|svg)$/i));
  const isPdf = (fileObj?.dataUrl && (fileObj.dataUrl.startsWith('data:application/pdf') || fileObj.dataUrl.includes('application/pdf'))) || 
                (docName && docName.toLowerCase().endsWith('.pdf'));

  if (fileObj && fileObj.dataUrl) {
    const objectUrl = dataURLtoObjectURL(fileObj.dataUrl);
    if (isImage) {
      previewBody.innerHTML = `<img src="${objectUrl}" style="max-width:100%; max-height:220px; object-fit:contain; border-radius:4px;" />`;
    } else if (isPdf) {
      previewBody.innerHTML = `<iframe src="${objectUrl}" width="100%" height="100%" style="border:none;"></iframe>`;
    } else {
      previewBody.innerHTML = `
        <div style="text-align:center; padding:20px;">
          <p style="font-size:12px; margin-bottom:8px; font-weight:600;">Inline preview not supported for this file.</p>
          <a href="${objectUrl}" download="${docName}" class="btn btn-outline btn-xs">📥 Download File</a>
        </div>
      `;
    }
  } else if (docId) {
    // Fetch directly from server
    try {
      const res = await fetch(`/api/files/${appId}/${fieldId}/${docId}`);
      if (res.ok) {
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        if (isImage) {
          previewBody.innerHTML = `<img src="${objectUrl}" style="max-width:100%; max-height:220px; object-fit:contain; border-radius:4px;" />`;
        } else if (isPdf) {
          previewBody.innerHTML = `<iframe src="${objectUrl}" width="100%" height="100%" style="border:none;"></iframe>`;
        } else {
          previewBody.innerHTML = `
            <div style="text-align:center; padding:20px;">
              <p style="font-size:12px; margin-bottom:8px; font-weight:600;">Inline preview not supported for this file.</p>
              <a href="${objectUrl}" download="${docName}" class="btn btn-outline btn-xs">📥 Download File</a>
            </div>
          `;
        }
      } else {
        previewBody.innerHTML = `<div style="color:#ef4444; font-size:12.5px;">Document preview failed. Unauthorized access or missing file.</div>`;
      }
    } catch(err) {
      previewBody.innerHTML = `<div style="color:#ef4444; font-size:12.5px;">Preview error: ${err.message}</div>`;
    }
  } else {
    previewBody.innerHTML = `<div style="color:var(--text-muted); font-size:12.5px;">No document data available.</div>`;
  }
}

function downloadDocument(appId, fieldId, docId, docName) {
  if (docId) {
    const url = `/api/files/${appId}/${fieldId}/${docId}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = docName || 'document';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } else {
    showToast('Download failed. Document identifier not found.', 'error');
  }
}

function openDocumentInNewTab(appId, fieldId, docId) {
  if (docId) {
    const url = `/api/files/${appId}/${fieldId}/${docId}`;
    window.open(url, '_blank');
  } else {
    showToast('Failed to open document in new tab.', 'error');
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BULK ACTION EXECUTIONS
 * ═══════════════════════════════════════════════════════════════════════════
 */
function triggerBulkApproval(selectedItems, container) {
  if (selectedItems.length === 0) return;
  const currentUser = getCurrentUser();
  const db = Store.getDb();

  let validCount = 0;
  let invalidCount = 0;
  let totalMaxMarks = 0;
  const affectedApps = new Set();
  
  const validItems = [];
  
  selectedItems.forEach(item => {
    const ans = db.applicationAnswers.find(a => a.applicationId === item.appId && a.fieldId === item.fieldId);
    const field = Store.getFieldById(item.fieldId);
    if (ans && field) {
      if (isAnswerValid(ans, field)) {
        validItems.push(item);
        validCount++;
        totalMaxMarks += (field.maxScore || field.weight || 1);
        affectedApps.add(item.appId);
      } else {
        invalidCount++;
      }
    }
  });

  if (validItems.length === 0) {
    showAlert({
      title: 'Bulk Approval Blocked',
      message: 'None of the selected questions can be approved because they contain no valid response (empty, "No", or "Not Applicable").',
      type: 'error'
    });
    return;
  }

  const appCount = affectedApps.size;

  showConfirm({
    title: 'Bulk Approval Safety Check',
    message: `
      You are about to bulk-approve <strong>${validItems.length}</strong> selected questions across <strong>${appCount}</strong> application(s).<br><br>
      <strong>Expected Impact:</strong><br>
      - Valid answers receiving marks: <strong>${validCount}</strong> (awarding +<strong>${totalMaxMarks}</strong> marks total)<br>
      ${invalidCount > 0 ? `- Skipped (Unanswered/No/NA) answers: <span style="color:#ef4444; font-weight:bold;">${invalidCount}</span> (will NOT be approved)<br>` : ''}<br>
      Are you sure you want to proceed?
    `,
    confirmText: 'Bulk Approve',
    type: 'warning',
    onConfirm: () => {
      let approvedCount = 0;

      validItems.forEach(item => {
        const ans = db.applicationAnswers.find(a => a.applicationId === item.appId && a.fieldId === item.fieldId);
        const field = Store.getFieldById(item.fieldId);

        if (!ans || !field) return;

        try {
          const scoreToAward = field.maxScore || field.weight || 1;
          const success = Store.approveQuestion(item.appId, field.id, currentUser.id, scoreToAward, 'Approved via bulk actions queue.');
          if (success) {
            if (!ans.remarksHistory) ans.remarksHistory = [];
            ans.remarksHistory.push({
              userId: currentUser.id,
              username: currentUser.name || currentUser.username,
              role: currentUser.role,
              text: 'Approved via bulk actions queue.',
              timestamp: new Date().toISOString()
            });
            approvedCount++;
          }
        } catch (err) {
          console.error(err);
        }
      });

      reviewsCompletedSession += approvedCount;
      showToast(`Successfully bulk-approved ${approvedCount} questions.`, 'success');
      renderTaskReviewPanel(container);
    }
  });
}

function triggerBulkRejection(selectedItems, container) {
  if (selectedItems.length === 0) return;
  const currentUser = getCurrentUser();
  const db = Store.getDb();

  let currentMarksToLose = 0;
  const affectedApps = new Set();
  selectedItems.forEach(item => {
    affectedApps.add(item.appId);
    const ans = db.applicationAnswers.find(a => a.applicationId === item.appId && a.fieldId === item.fieldId);
    if (ans && ans.questionScore) {
      currentMarksToLose += ans.questionScore;
    }
  });
  const appCount = affectedApps.size;

  showPrompt({
    title: 'Bulk Rejection Safety Confirmation',
    message: `
      You are about to bulk-reject <strong>${selectedItems.length}</strong> questions across <strong>${appCount}</strong> application(s).<br><br>
      <strong>Score Impact:</strong> Resets all score values to 0 (losing <strong>${currentMarksToLose}</strong> marks previously awarded).<br><br>
      Enter final rejection remarks to confirm bulk rejection:
    `,
    placeholder: 'Explain why these items are rejected...',
    onConfirm: (reason) => {
      let rejectedCount = 0;

      selectedItems.forEach(item => {
        const ans = db.applicationAnswers.find(a => a.applicationId === item.appId && a.fieldId === item.fieldId);
        const field = Store.getFieldById(item.fieldId);
        if (!ans || !field) return;

        ans.questionStatus = 'Rejected';
        ans.questionScore = 0;
        ans.questionRejectedBy = currentUser.id;
        ans.questionRejectedAt = new Date().toISOString();

        if (!ans.remarksHistory) ans.remarksHistory = [];
        ans.remarksHistory.push({
          userId: currentUser.id,
          username: currentUser.name || currentUser.username,
          role: currentUser.role,
          text: reason || 'Rejected via bulk action.',
          timestamp: new Date().toISOString()
        });
        ans.adminRemarks = reason || 'Rejected via bulk action.';

        // Recalculate score
        const app = Store.getApplicationById(item.appId);
        const totalScore = (db.applicationAnswers || [])
          .filter(a => a.applicationId === item.appId)
          .reduce((sum, a) => sum + (a.questionScore || 0), 0);
        app.score = totalScore;
        app.updatedAt = new Date().toISOString();

        // Audit Logging
        Store.addAuditLog(
          currentUser.id,
          `Question Rejected (Bulk): Q${field.num} in Application ${item.appId}`,
          'review',
          item.appId
        );

        // Notifications
        Store.addNotification(
          app.userId,
          'QUESTION_REJECTED',
          `Your answer for Question ${field.num} has been rejected via bulk action.`,
          item.appId
        );

        rejectedCount++;
      });

      Store.scheduleSave();
      reviewsCompletedSession += rejectedCount;
      showToast(`Successfully bulk-rejected ${rejectedCount} questions.`, 'success');
      renderTaskReviewPanel(container);
    }
  });
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OVERSIGHT PANEL MODALS
 * ═══════════════════════════════════════════════════════════════════════════
 */
function openTransferApplicationModal(preselectedReviewerId = '') {
  const db = Store.getDb();
  const allUsers = Store.getUsers();
  const admins = allUsers.filter(u => ['admin', 'reviewer', 'superadmin'].includes(u.role));
  const activeApps = (db.applications || []).filter(a => a.status !== 'Draft');

  const modalBackdrop = document.createElement('div');
  modalBackdrop.className = 'modal-backdrop-custom visible';

  modalBackdrop.innerHTML = `
    <div class="modal-card-custom animate-modal-in" style="max-width:440px; width:90%; padding:20px;">
      <h3 class="modal-title-custom" style="margin-bottom:12px;">Transfer Application Ownership</h3>
      <p style="font-size:12px; color:var(--text-muted); margin-bottom:16px;">
        Transfer an application's review responsibilities from one admin/reviewer to another.
      </p>

      <div class="form-group" style="margin-bottom:12px;">
        <label style="font-size:12px; font-weight:700; color:var(--text-main); display:block; margin-bottom:4px;">Select Application</label>
        <select id="modal-transfer-app" class="form-input form-select" style="height:36px; font-size:12.5px;">
          ${activeApps.map(app => `<option value="${app.id}">${app.id} (${app.state || app.organization})</option>`).join('')}
        </select>
      </div>

      <div class="form-group" style="margin-bottom:16px;">
        <label style="font-size:12px; font-weight:700; color:var(--text-main); display:block; margin-bottom:4px;">Assign New Reviewer</label>
        <select id="modal-transfer-new-reviewer" class="form-input form-select" style="height:36px; font-size:12.5px;">
          ${admins.map(adm => `<option value="${adm.id}" ${preselectedReviewerId === adm.id ? 'selected' : ''}>${adm.name || adm.username} (${adm.role.toUpperCase()})</option>`).join('')}
        </select>
      </div>

      <div class="modal-actions-custom" style="display:flex; justify-content:flex-end; gap:8px;">
        <button class="btn btn-secondary" id="btn-modal-trans-cancel">Cancel</button>
        <button class="btn btn-primary" id="btn-modal-trans-submit" style="background:var(--accent-indigo); border:none;">Transfer</button>
      </div>
    </div>
  `;

  document.body.appendChild(modalBackdrop);

  const dismiss = () => document.body.removeChild(modalBackdrop);

  modalBackdrop.querySelector('#btn-modal-trans-cancel').addEventListener('click', dismiss);
  modalBackdrop.querySelector('#btn-modal-trans-submit').addEventListener('click', () => {
    const appId = modalBackdrop.querySelector('#modal-transfer-app').value;
    const newReviewerId = modalBackdrop.querySelector('#modal-transfer-new-reviewer').value;
    const newReviewer = allUsers.find(u => u.id === newReviewerId);

    const app = Store.getApplicationById(appId);
    if (app) {
      app.assignedReviewer = newReviewerId;
      app.assignedDate = new Date().toISOString();

      // Update assignments to transfer reviewer
      const assignments = db.assignments || [];
      const appAssignments = assignments.filter(a => a.editionId === app.editionId);
      appAssignments.forEach(a => {
        a.userId = newReviewerId;
        a.assignedAt = new Date().toISOString();
        a.assignedBy = getCurrentUser().id;
      });
    }

    // Save
    Store.scheduleSave();
    dismiss();
    showToast(`Successfully transferred all tasks for Application ${appId} to ${newReviewer?.name || newReviewerId}.`, 'success');
    
    // Refresh the dashboard view if it's active
    const activeBtn = document.querySelector('.sidebar-item.active');
    if (activeBtn) {
      activeBtn.click();
    }
  });
}

/**
 * Synchronize UI panels without page refresh.
 */
function syncGlobalStateWithoutReload(appId) {
  // Save DB immediately to sync MongoDB backend
  Store.forceSave();

  // Fire event for live refreshing panels
  window.dispatchEvent(new CustomEvent('db-sync-complete'));
}

/**
 * Generate a printable approval certificate.
 */
function printApprovalCertificate(app) {
  const db = Store.getDb();
  const reviewerObj = Store.getUserById(app.assignedReviewer);
  const reviewerName = reviewerObj ? (reviewerObj.name || reviewerObj.username) : (app.assignedReviewer || 'System');
  const applicantObj = Store.getUserById(app.userId);
  const applicantName = applicantObj ? (applicantObj.name || applicantObj.username) : 'Applicant';
  
  const certContainer = document.createElement('div');
  certContainer.id = 'print-certificate-container';
  certContainer.innerHTML = `
    <div class="cert-frame">
      <div class="cert-title">Certificate of Compliance &amp; Approval</div>
      <div style="font-size:18px; font-weight:600; margin-bottom:20px;">State Reform Action Plan Evaluation</div>
      <div class="cert-divider"></div>
      <p class="cert-text">
        This is to certify that the application submitted by
      </p>
      <h3 style="font-size:22px; font-family:'Georgia', serif; margin:10px 0;">${applicantName}</h3>
      <p style="font-size:16px; margin-bottom:10px;">representing</p>
      <h4 style="font-size:18px; margin:0 0 20px 0; font-weight:700;">${app.organization || app.state || 'N/A'}</h4>
      <p class="cert-text">
        has been fully reviewed, evaluated, and verified. All mandatory criteria and supporting evidence have been approved.
      </p>
      
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; max-width:500px; margin:30px auto; border-top:1px solid #e2e8f0; padding-top:20px; text-align:left;">
        <div class="cert-field">Application ID: <strong>${app.id}</strong></div>
        <div class="cert-field">Evaluation Score: <strong>${app.score || 0} Marks</strong></div>
        <div class="cert-field">Review Date: <strong>${app.updatedAt ? new Date(app.updatedAt).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN')}</strong></div>
        <div class="cert-field">Reviewer Name: <strong>${reviewerName}</strong></div>
      </div>
      
      <div class="cert-seal">
        APPROVED
      </div>
      <div style="font-size:11px; color:#64748b; margin-top:10px;">Generated automatically by SRF Management Platform</div>
    </div>
  `;
  document.body.appendChild(certContainer);
  window.print();
  document.body.removeChild(certContainer);
}

/**
 * Open Escalation Modal for Reviewers.
 */
function openEscalateReviewModal(appId, container) {
  const modalBackdrop = document.createElement('div');
  modalBackdrop.className = 'modal-backdrop-custom visible';
  const allUsers = Store.getUsers();
  const superAdmins = allUsers.filter(u => u.role === 'superadmin');

  modalBackdrop.innerHTML = `
    <div class="modal-card-custom animate-modal-in" style="max-width:440px; width:90%; padding:20px;">
      <h3 class="modal-title-custom" style="margin-bottom:12px; color:#d97706;">Escalate Application Review</h3>
      <p style="font-size:12.5px; color:var(--text-muted); margin-bottom:16px;">
        Escalate this application to a Super Admin for oversight or override.
      </p>

      <div class="form-group" style="margin-bottom:12px;">
        <label style="font-size:12px; font-weight:700; color:var(--text-main); display:block; margin-bottom:4px;">Select Super Admin</label>
        <select id="modal-esc-assignee" class="form-input form-select" style="height:36px; font-size:12.5px;">
          ${superAdmins.map(sa => `<option value="${sa.id}">${sa.name || sa.username} (Super Admin)</option>`).join('')}
        </select>
      </div>

      <div class="form-group" style="margin-bottom:12px;">
        <label style="font-size:12px; font-weight:700; color:var(--text-main); display:block; margin-bottom:4px;">Escalation Priority</label>
        <select id="modal-esc-priority" class="form-input form-select" style="height:36px; font-size:12.5px;">
          <option value="HIGH">HIGH</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="LOW">LOW</option>
        </select>
      </div>

      <div class="form-group" style="margin-bottom:16px;">
        <label style="font-size:12px; font-weight:700; color:var(--text-main); display:block; margin-bottom:4px;">Reason for Escalation</label>
        <textarea id="modal-esc-reason" class="form-input" placeholder="Explain why you are escalating this application..." style="min-height:80px; font-size:12.5px;" required></textarea>
      </div>

      <div class="modal-actions-custom" style="display:flex; justify-content:flex-end; gap:8px;">
        <button class="btn btn-secondary" id="btn-modal-esc-cancel">Cancel</button>
        <button class="btn btn-primary" id="btn-modal-esc-submit" style="background:#f59e0b; border:none; color:white; font-weight:700;">Confirm Escalation</button>
      </div>
    </div>
  `;

  document.body.appendChild(modalBackdrop);

  const dismiss = () => document.body.removeChild(modalBackdrop);

  modalBackdrop.querySelector('#btn-modal-esc-cancel').addEventListener('click', dismiss);
  modalBackdrop.querySelector('#btn-modal-esc-submit').addEventListener('click', () => {
    const superAdminId = modalBackdrop.querySelector('#modal-esc-assignee').value;
    const priority = modalBackdrop.querySelector('#modal-esc-priority').value;
    const reason = modalBackdrop.querySelector('#modal-esc-reason').value.trim();

    if (!reason) {
      showToast('Reason is required.', 'warning');
      return;
    }

    dismiss();
    Store.escalateApplicationReview(appId, {
      reason,
      priority,
      assignedTo: superAdminId,
      escalatedBy: getCurrentUser().id,
      escalatedAt: new Date().toISOString()
    });
    showToast('Application escalated successfully.', 'success');
    
    // Go back to queue
    activeWorkspaceAppId = null;
    activeWorkspaceFieldId = null;
    renderTaskReviewPanel(container);
    syncGlobalStateWithoutReload(appId);
  });
}

/**
 * Open Resolve Escalation Modal for Super Admins.
 */
function openResolveEscalationModal(appId, container) {
  const app = Store.getApplicationById(appId);
  if (!app || !app.escalationDetails) return;
  const esc = app.escalationDetails;

  const modalBackdrop = document.createElement('div');
  modalBackdrop.className = 'modal-backdrop-custom visible';

  modalBackdrop.innerHTML = `
    <div class="modal-card-custom animate-modal-in" style="max-width:460px; width:90%; padding:20px;">
      <h3 class="modal-title-custom" style="margin-bottom:12px; color:#ef4444;">Resolve Escalation: ${appId}</h3>
      <div style="background:var(--bg-deep); border:1px solid var(--border-color); border-radius:8px; padding:12px; font-size:12.5px; margin-bottom:16px;">
        <div>Escalated By: <strong>${esc.escalatedBy}</strong></div>
        <div>Escalated At: <strong>${new Date(esc.escalatedAt).toLocaleString('en-IN')}</strong></div>
        <div>Priority: <strong style="color:#ef4444;">${esc.priority}</strong></div>
        <div style="margin-top:8px; border-top:1px dashed var(--border-color); padding-top:8px;">
          <strong>Reason:</strong><br>"${esc.reason}"
        </div>
      </div>

      <p style="font-size:12.5px; color:var(--text-muted); margin-bottom:16px;">
        Choose an action to resolve this escalation.
      </p>

      <div class="modal-actions-custom" style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn btn-primary" id="btn-modal-esc-workspace" style="width:100%;">Open Application Workspace</button>
        <button class="btn btn-outline" id="btn-modal-esc-clear" style="width:100%; border-color:#10b981; color:#10b981;">Dismiss &amp; Resolve Escalation</button>
        <button class="btn btn-secondary" id="btn-modal-esc-close" style="width:100%;">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(modalBackdrop);

  const dismiss = () => document.body.removeChild(modalBackdrop);

  modalBackdrop.querySelector('#btn-modal-esc-close').addEventListener('click', dismiss);
  
  modalBackdrop.querySelector('#btn-modal-esc-workspace').addEventListener('click', () => {
    dismiss();
    openReviewWorkspace(appId, null);
  });

  modalBackdrop.querySelector('#btn-modal-esc-clear').addEventListener('click', () => {
    dismiss();
    app.isEscalated = false;
    app.escalationDetails = null;
    app.timeline = app.timeline || [];
    app.timeline.push({
      id: `tl_resolve_${Date.now()}`,
      action: 'Escalation Resolved',
      details: `Escalation dismissed and marked as resolved by Super Admin ${getCurrentUser().name || getCurrentUser().username}`,
      userId: getCurrentUser().id,
      timestamp: new Date().toISOString()
    });
    Store.scheduleSave();
    showToast('Escalation resolved.', 'success');
    renderTaskReviewPanel(container);
    syncGlobalStateWithoutReload(appId);
  });
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * REVIEWER PERSONAL WORK QUEUE (ASSIGNED REVIEW TASKS)
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function renderAssignedReviewTasksPanel(container) {
  injectStyles();
  const currentUser = getCurrentUser();
  if (!currentUser || !['admin', 'reviewer', 'superadmin'].includes(currentUser.role)) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 60px 20px;">
        <h3 style="color:var(--danger);">Access Denied</h3>
        <p>You do not have the required permissions to view the Assigned Review Tasks.</p>
      </div>`;
    return;
  }

  const db = Store.getDb();
  const allApplications = db.applications || [];
  const allAnswers = db.applicationAnswers || [];
  const allFields = db.formFields || [];
  const allEditions = db.editions || [];
  const allUsers = Store.getUsers();
  const assignments = Store.getAllAssignments();

  // Find assignments specifically assigned to this user/admin
  const adminId = currentUser.id;
  const myAssignments = assignments.filter(a => a.userId === adminId || currentUser.role === 'superadmin');

  // Let's filter applications that are reviewable (not Draft)
  const assignedApps = [];
  const assignedQuestions = [];

  const reviewableApps = allApplications.filter(app => app.status !== 'Draft');

  reviewableApps.forEach(app => {
    console.log({
      applicationId: app.id,
      status: app.status,
      assignedReviewer: app.assignedReviewer,
      visibleToAdmin: app.visibleToAdmin,
      visibleToSuperAdmin: app.visibleToSuperAdmin
    });

    const edition = allEditions.find(e => e.id === app.editionId);
    const applicant = allUsers.find(u => u.id === app.userId);
    if (!edition || !applicant) return;

    // Filter fields under this edition
    const fields = allFields.filter(f => f.editionId === app.editionId && !f.isLayoutElement);

    // Find assignments matching this app
    const appAssignments = myAssignments.filter(a => a.editionId === app.editionId);
    if (appAssignments.length === 0 && currentUser.role !== 'superadmin') return;

    let appPendingCount = 0;
    let appTotalCount = 0;
    let appDueDate = '';
    let maxPriority = 0;
    let maxPriorityLabel = 'Low';
    let maxPriorityColor = '#64748b';

    const appQuestions = [];

    fields.forEach(field => {
      // Check if this specific field is assigned to this reviewer
      let isFieldAssigned = currentUser.role === 'superadmin';
      if (!isFieldAssigned) {
        isFieldAssigned = appAssignments.some(a => {
          if (a.type === 'Question' && (a.fieldId === field.id || a.questionId === field.id)) return true;
          if (a.type === 'Action Point' && a.actionPointId === field.actionPointId) return true;
          if ((a.type === 'Reform Area' || a.type === 'Section') && (a.sectionId === field.reformAreaId || a.reformAreaId === field.reformAreaId)) return true;
          return false;
        });
      }

      if (!isFieldAssigned) return;

      const ans = allAnswers.find(a => a.applicationId === app.id && a.fieldId === field.id);
      const qStatus = ans?.questionStatus || 'Pending Review';

      appTotalCount++;
      const isPending = qStatus === 'Submitted' || qStatus === 'Under Review' || qStatus === 'Pending Review' || qStatus === 'Resubmitted';
      if (isPending) {
        appPendingCount++;
      }

      const reformArea = (db.reformAreas || []).find(r => r.id === field.reformAreaId);
      const dueDate = reformArea?.dueDate || '';
      if (dueDate && (!appDueDate || new Date(dueDate) < new Date(appDueDate))) {
        appDueDate = dueDate;
      }

      const qItem = {
        appId: app.id,
        editionId: app.editionId,
        editionName: edition.name,
        reformAreaId: field.reformAreaId,
        reformAreaName: reformArea?.name || 'General',
        fieldId: field.id,
        num: field.num || '',
        label: field.label || field.text || '',
        userName: applicant.name || applicant.username,
        userOrganization: applicant.organization,
        status: qStatus,
        dueDate: dueDate
      };

      const pri = getTaskPriority(qItem);
      if (pri.score > maxPriority) {
        maxPriority = pri.score;
        maxPriorityLabel = pri.label;
        maxPriorityColor = pri.color;
      }

      if (isPending) {
        appQuestions.push(qItem);
        assignedQuestions.push(qItem);
      }
    });

    if (appTotalCount > 0) {
      assignedApps.push({
        appId: app.id,
        applicantName: applicant.name || applicant.username,
        organization: applicant.organization,
        editionName: edition.name,
        pendingCount: appPendingCount,
        totalCount: appTotalCount,
        dueDate: appDueDate,
        priorityLabel: maxPriorityLabel,
        priorityColor: maxPriorityColor,
        questions: appQuestions
      });
    }
  });

  // Sort queue by priority
  assignedApps.sort((a, b) => {
    if (a.pendingCount !== b.pendingCount) return b.pendingCount - a.pendingCount;
    return new Date(a.dueDate || 0) - new Date(b.dueDate || 0);
  });

  assignedQuestions.sort((a, b) => {
    const scoreA = getTaskPriority(a).score;
    const scoreB = getTaskPriority(b).score;
    if (scoreA !== scoreB) return scoreB - scoreA;
    return new Date(a.dueDate || 0) - new Date(b.dueDate || 0);
  });

  container.innerHTML = `
    <div class="section-card">
      <div class="section-badge admin-badge">Assigned Review Tasks Queue</div>
      <h2 style="margin: 10px 0 6px 0;">My Work Queue</h2>
      <p style="color:var(--text-muted); font-size:13.5px; margin-bottom:20px;">
        Review your assigned applications and individual questions below. Click "Start Review" to open the comparison review detail workspace.
      </p>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; margin-bottom:24px;">
        <div style="background:var(--bg-deep); border:1px solid var(--border-color); border-radius:10px; padding:14px; text-align:center;">
          <span style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Assigned Applications</span>
          <div style="font-size:32px; font-weight:800; color:var(--accent-indigo); margin-top:6px;">${assignedApps.length}</div>
        </div>
        <div style="background:var(--bg-deep); border:1px solid var(--border-color); border-radius:10px; padding:14px; text-align:center;">
          <span style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Pending Questions Queue</span>
          <div style="font-size:32px; font-weight:800; color:#ef4444; margin-top:6px;">${assignedQuestions.length}</div>
        </div>
      </div>

      <!-- APPLICATIONS QUEUE -->
      <h3 style="margin-bottom:12px;">Assigned Applications Queue</h3>
      ${assignedApps.length === 0 ? `
        <div style="text-align:center; padding:30px; border:1px dashed var(--border-color); border-radius:8px; color:var(--text-muted); margin-bottom:24px;">
          No applications currently assigned to you.
        </div>
      ` : `
        <div style="overflow-x:auto; margin-bottom:24px;">
          <table class="admin-dashboard-table">
            <thead>
              <tr>
                <th>App ID</th>
                <th>Applicant / Organization</th>
                <th>SRF Version</th>
                <th>Pending / Total Tasks</th>
                <th>Priority</th>
                <th>Target Due Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${assignedApps.map(app => `
                <tr>
                  <td><strong style="color:var(--text-main); font-size:13px;">${app.appId}</strong></td>
                  <td>
                    <span style="font-weight:600; font-size:13px; display:block; color:var(--text-main);">${app.applicantName}</span>
                    <span style="font-size:11px; color:var(--text-muted);">${app.organization}</span>
                  </td>
                  <td><span class="status-badge" style="background:rgba(99,102,241,0.06); color:var(--accent-indigo); font-size:11px; padding:2px 6px;">${app.editionName}</span></td>
                  <td>
                    <strong style="color:${app.pendingCount > 0 ? '#ef4444' : '#10b981'}; font-size:13px;">${app.pendingCount}</strong>
                    <span style="color:var(--text-muted);">/ ${app.totalCount} pending</span>
                  </td>
                  <td>
                    <span style="font-weight: 700; color: ${app.priorityColor}; font-size:12px;">
                      ${app.priorityLabel}
                    </span>
                  </td>
                  <td style="font-size:12px; color:var(--text-muted);">${app.dueDate ? new Date(app.dueDate).toLocaleDateString('en-IN') : '—'}</td>
                  <td>
                    <button class="btn btn-primary btn-sm btn-start-app-review" data-app-id="${app.appId}" data-first-field-id="${app.questions[0]?.fieldId || ''}" ${app.pendingCount === 0 ? 'disabled style="opacity:0.6; pointer-events:none;"' : ''}>
                      ⚡ Start Review
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}

      <!-- QUESTIONS QUEUE -->
      <h3 style="margin-bottom:12px;">Assigned Individual Questions</h3>
      ${assignedQuestions.length === 0 ? `
        <div style="text-align:center; padding:30px; border:1px dashed var(--border-color); border-radius:8px; color:var(--text-muted);">
          No individual pending questions in your queue.
        </div>
      ` : `
        <div style="overflow-x:auto;">
          <table class="admin-dashboard-table">
            <thead>
              <tr>
                <th>Priority</th>
                <th>App ID</th>
                <th>Section</th>
                <th>Q. Num</th>
                <th>Question Title</th>
                <th>Target Due Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${assignedQuestions.map(q => {
                const pri = getTaskPriority(q);
                return `
                  <tr>
                    <td>
                      <span style="font-weight: 700; color: ${pri.color}; font-size:12px;">
                        ${pri.label}
                      </span>
                    </td>
                    <td><strong style="color:var(--text-main); font-size:13px;">${q.appId}</strong></td>
                    <td style="font-size:12px; font-weight:600; color:var(--text-main);">${q.reformAreaName}</td>
                    <td><strong style="color:var(--accent-indigo); font-size:13.5px;">Q${q.num}</strong></td>
                    <td style="font-size:12px; color:var(--text-dark); max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${q.label}">${q.label}</td>
                    <td style="font-size:12px; color:var(--text-muted);">${q.dueDate ? new Date(q.dueDate).toLocaleDateString('en-IN') : '—'}</td>
                    <td>
                      <button class="btn btn-action-text btn-start-q-review" data-app-id="${q.appId}" data-field-id="${q.fieldId}">
                        👁️ Review
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}

    </div>
  `;

  // Bind Start Review click listeners
  container.querySelectorAll('.btn-start-app-review').forEach(btn => {
    btn.addEventListener('click', () => {
      const appId = btn.dataset.appId;
      const firstFieldId = btn.dataset.firstFieldId;
      openReviewWorkspace(appId, firstFieldId);
    });
  });

  container.querySelectorAll('.btn-start-q-review').forEach(btn => {
    btn.addEventListener('click', () => {
      const appId = btn.dataset.appId;
      const fieldId = btn.dataset.fieldId;
      openReviewWorkspace(appId, fieldId);
    });
  });
}
