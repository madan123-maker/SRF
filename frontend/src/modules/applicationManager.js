/* ==========================================================================
   applicationManager.js — Application Tracker, Details, Approval Workflow
   Dynamic SRF Management Platform v2.0
   ========================================================================== */

import * as Store from '../db/store.js';
import { showConfirm, showAlert, showPrompt, showFileViewer } from '../ui/confirmDialog.js';
import { showToast } from '../ui/toastManager.js';
import { getCurrentUser, isSuperAdmin } from '../auth/auth.js';
import { NOTIFICATION_EVENTS } from '../db/schema.js';
import { dataURLtoObjectURL } from '../ui/fileUtil.js';

let _currentEditionId = null;
let _currentFilters = {};
let _currentPage = 1;
const PAGE_SIZE = 20;

// ─── APPLICATION TRACKER (ADMIN) ───────────────────────────────────────────
export async function renderApplicationTracker(container, editionId, onBack) {
  _currentEditionId = editionId;
  _currentPage = 1;
  _currentFilters = {};

  // Show a quick loading state while refreshing from server
  container.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 20px; color:var(--text-muted);">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-indigo)" stroke-width="2" style="animation:spin 1s linear infinite; margin-bottom:12px;">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
      <p style="font-size:14px; font-weight:500;">Loading latest data…</p>
    </div>
  `;

  // Refresh _db from server so admin always sees the latest submissions
  try {
    await Store.initStore();
  } catch (e) {
    console.warn('[ApplicationTracker] Could not refresh DB from server:', e);
  }

  const edition = Store.getEditionById(editionId);
  const stats = Store.getEditionStats(editionId);

  const lastRefreshed = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  container.innerHTML = `
    <div class="section-card" style="margin-bottom:24px;">
      <div style="float:right; display:flex; gap:8px; margin-top:4px; align-items:center;">
        <span style="font-size:11px; color:var(--text-muted);">Updated: ${lastRefreshed}</span>
        <button class="btn btn-secondary btn-sm" id="btn-refresh-workspace" style="display:flex;align-items:center;gap:5px;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          Refresh
        </button>
        <button class="btn btn-secondary btn-sm" id="btn-back-editions" style="display:flex;align-items:center;gap:5px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          All Editions
        </button>
      </div>
      <div class="section-badge admin-badge">Application Workspace</div>
      <h1>${edition ? edition.name : 'Edition'} Workspace</h1>
      <p style="color:var(--text-muted);font-size:14px;">${edition ? edition.description : ''}</p>
    </div>

    <!-- Workspace Tabs -->
    <div class="workspace-tabs" style="display:flex; gap:16px; margin-bottom:24px; border-bottom:1px solid var(--border-color); padding-bottom:8px;">
      <button class="tab-btn active" id="tab-applications" style="background:none; border:none; padding:8px 16px; font-weight:600; color:var(--text-main); border-bottom:2px solid var(--primary); cursor:pointer; font-size:14px; transition:all 0.2s;">
        Applications
      </button>
      ${isSuperAdmin() ? `
      <button class="tab-btn" id="tab-schema-editor" style="background:none; border:none; padding:8px 16px; font-weight:500; color:var(--text-muted); cursor:pointer; font-size:14px; transition:all 0.2s;">
        Schema Editor
      </button>
      ` : ''}
    </div>

    <div id="workspace-applications-content">
      <div class="stats-grid" style="margin-bottom:24px;">
        ${_kpiCard('Total Applications', stats.total, '#4f46e5', 'total')}
        ${_kpiCard('Pending Review', stats.submitted + stats.underReview, '#d97706', 'pending')}
        ${_kpiCard('Approved', stats.approved, '#10b981', 'approved')}
        ${_kpiCard('Rejected', stats.rejected, '#ef4444', 'rejected')}
        ${_kpiCard('Additional Docs', stats.additionalDocs, '#0284c7', 'addocs')}
      </div>

      <div class="card glass-card">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
          <h2>Applications</h2>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
            <input type="text" id="tracker-search" placeholder="Search applicant / ID..." class="search-input-sm">
            <select id="tracker-filter-status" class="form-select-sm">
              <option value="">All Statuses</option>
              <option value="Submitted">Submitted</option>
              <option value="Under Review">Under Review</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="Additional Documents Requested">Additional Docs Requested</option>
            </select>
            <select id="tracker-filter-category" class="form-select-sm">
              <option value="">All Categories</option>
              ${(edition?.categories || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="card-body p-0">
          <div id="applications-table-container"></div>
        </div>
      </div>
    </div>

    <div id="workspace-schema-content" class="hidden"></div>
  `;



  container.querySelector('#btn-back-editions').addEventListener('click', () => { if (onBack) onBack(); });

  // Refresh button — re-initialise store from server and re-render this workspace
  container.querySelector('#btn-refresh-workspace')?.addEventListener('click', async () => {
    renderApplicationTracker(container, editionId, onBack);
  });

  // Tab switching
  const tabApps = container.querySelector('#tab-applications');
  const tabSchema = container.querySelector('#tab-schema-editor');
  const appsContent = container.querySelector('#workspace-applications-content');
  const schemaContent = container.querySelector('#workspace-schema-content');

  tabApps.addEventListener('click', () => {
    tabApps.classList.add('active');
    tabApps.style.borderBottom = '2px solid var(--primary)';
    tabApps.style.color = 'var(--text-main)';
    if (tabSchema) {
      tabSchema.classList.remove('active');
      tabSchema.style.borderBottom = 'none';
      tabSchema.style.color = 'var(--text-muted)';
    }
    appsContent.classList.remove('hidden');
    schemaContent.classList.add('hidden');
  });

  if (tabSchema) {
    tabSchema.addEventListener('click', () => {
      tabSchema.classList.add('active');
      tabSchema.style.borderBottom = '2px solid var(--primary)';
      tabSchema.style.color = 'var(--text-main)';
      tabApps.classList.remove('active');
      tabApps.style.borderBottom = 'none';
      tabApps.style.color = 'var(--text-muted)';
      appsContent.classList.add('hidden');
      schemaContent.classList.remove('hidden');

      if (window.renderSchemaEditorAdmin) {
        if (typeof window.setActiveEditionId === 'function') {
          window.setActiveEditionId(editionId);
        }
        window.renderSchemaEditorAdmin(schemaContent);
      } else {
        schemaContent.innerHTML = `<div class="empty-state"><p>Schema Editor not available.</p></div>`;
      }
    });
  }

  // Filter listeners
  let searchTimer;
  container.querySelector('#tracker-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      _currentFilters.search = e.target.value;
      _currentPage = 1;
      _refreshTable(container);
    }, 300);
  });

  container.querySelector('#tracker-filter-status').addEventListener('change', (e) => {
    _currentFilters.status = e.target.value;
    _currentPage = 1;
    _refreshTable(container);
  });

  container.querySelector('#tracker-filter-category').addEventListener('change', (e) => {
    _currentFilters.category = e.target.value;
    _currentPage = 1;
    _refreshTable(container);
  });

  _refreshTable(container);
}

function _refreshTable(container) {
  const tableContainer = container.querySelector('#applications-table-container');
  const result = Store.getApplications({
    editionId: _currentEditionId,
    ..._currentFilters,
    page: _currentPage,
    pageSize: PAGE_SIZE,
    sortBy: 'updatedAt',
    sortDir: 'desc'
  });

  if (result.items.length === 0) {
    tableContainer.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--border-color)" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <h3>No applications found</h3>
        <p>No applications match the current filters.</p>
      </div>
    `;
    return;
  }

  const rows = result.items.map(app => {
    const user = Store.getUserById(app.userId);
    const score = Store.calculateApplicationScore(app.id);
    const maxScore = Store.calculateApplicationMaxScore(app.id) || 1;
    const pct = ((score / maxScore) * 100).toFixed(1);
    const statusCls = _statusClass(app.status);
    const date = app.submittedAt ? new Date(app.submittedAt).toLocaleDateString('en-IN') : new Date(app.updatedAt).toLocaleDateString('en-IN');
    const edition = Store.getEditionById(app.editionId);
    const catName = (edition?.categories || []).find(c => c.id === app.category)?.name || app.category;
    const hasBeenReviewed = ['Approved', 'Rejected', 'Additional Documents Requested'].includes(app.status) || score > 0;
    const scoreDisplay = hasBeenReviewed ? score : '—';
    const maxScoreDisplay = hasBeenReviewed ? `/ ${maxScore}` : '';
    const pctDisplay = hasBeenReviewed ? `${pct}%` : '—';

    return `
      <tr>
        <td><code class="app-id-code">${app.id}</code></td>
        <td>
          <div class="applicant-cell">
            <strong>${user?.name || 'Unknown'}</strong>
            <small>${user?.organization || ''}</small>
          </div>
        </td>
        <td>${edition?.name || 'Unknown'}</td>
        <td>${catName || '—'}</td>
        <td>${app.duration || '—'}</td>
        <td>
          <strong style="color:var(--accent-indigo)">${scoreDisplay}</strong> ${maxScoreDisplay}
          <small style="display:block; color:var(--text-muted); font-size:10px; font-weight:600;">${pctDisplay}</small>
        </td>
        <td><span class="status-badge ${statusCls}">${app.status}</span></td>
        <td>${date}</td>
        <td>
          <div class="action-btns">
            <button class="btn btn-xs btn-outline btn-view-app" data-id="${app.id}" title="View">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            ${(!isSuperAdmin() && ['Submitted', 'Under Review', 'Resubmitted'].includes(app.status)) ? `<button class="btn btn-xs btn-success btn-approve-app" data-id="${app.id}" title="Approve">✓</button>` : ''}
            ${(!isSuperAdmin() && ['Submitted', 'Under Review', 'Resubmitted'].includes(app.status)) ? `<button class="btn btn-xs btn-danger btn-reject-app" data-id="${app.id}" title="Reject">✕</button>` : ''}
            <button class="btn btn-xs btn-secondary btn-download-app" data-id="${app.id}" title="Download">↓</button>
            <button class="btn btn-xs btn-danger btn-delete-app" data-id="${app.id}" title="Delete">🗑</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tableContainer.innerHTML = `
    <div style="overflow-x:auto;">
      <table class="admin-dashboard-table">
        <thead>
          <tr>
            <th>App ID</th>
            <th>Applicant</th>
            <th>Edition</th>
            <th>Category</th>
            <th>Duration</th>
            <th>Score</th>
            <th>Status</th>
            <th>Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${_paginationHtml(result)}
  `;

  _attachTableListeners(tableContainer, container);
}

function _attachTableListeners(tableContainer, container) {
  // View application
  tableContainer.querySelectorAll('.btn-view-app').forEach(btn => {
    btn.addEventListener('click', () => {
      renderApplicationDetail(container, btn.dataset.id, () => renderApplicationTracker(container, _currentEditionId, null));
    });
  });

  // Approve
  tableContainer.querySelectorAll('.btn-approve-app').forEach(btn => {
    btn.addEventListener('click', () => {
      const app = Store.getApplicationById(btn.dataset.id);
      showPrompt({
        title: 'Approve Application',
        message: `Enter comments / remarks to approve application <strong>${app.id}</strong> (optional):`,
        placeholder: 'Approved by admin',
        confirmText: 'Approve',
        onConfirm: (remarks) => {
          const comments = remarks || 'Approved by admin';
          Store.approveApplication(app.id, getCurrentUser().id, comments);
          Store.addNotification(app.userId, NOTIFICATION_EVENTS.APPLICATION_APPROVED,
            `Your application ${app.id} has been approved!`, app.id);
          showToast('Application Approved Successfully!', 'success');
          _refreshTable(container);
        }
      });
    });
  });

  // Reject
  tableContainer.querySelectorAll('.btn-reject-app').forEach(btn => {
    btn.addEventListener('click', () => {
      const app = Store.getApplicationById(btn.dataset.id);
      showPrompt({
        title: 'Reject Application',
        message: `Enter the rejection reason for <strong>${app.id}</strong>:`,
        placeholder: 'e.g. Insufficient documentation provided...',
        confirmText: 'Reject Application',
        onConfirm: (reason) => {
          Store.rejectApplication(app.id, getCurrentUser().id, reason || 'No reason provided');
          Store.addNotification(app.userId, NOTIFICATION_EVENTS.APPLICATION_REJECTED,
            `Your application ${app.id} was rejected. Reason: ${reason || 'No reason provided'}`, app.id);
          Store.addAuditLog(getCurrentUser().id, `Rejected application: ${reason}`, 'application', app.id);
          showAlert({ title: 'Application Rejected', message: `Application ${app.id} has been rejected.`, type: 'info' });
          _refreshTable(container);
        }
      });
    });
  });

  // Delete
  tableContainer.querySelectorAll('.btn-delete-app').forEach(btn => {
    btn.addEventListener('click', () => {
      const app = Store.getApplicationById(btn.dataset.id);
      showConfirm({
        title: 'Move Application to Recycle Bin',
        message: `Are you sure you want to delete the application <strong>${app.id}</strong>?<br><br>It will be stored in the <strong>Recycle Bin for 30 days</strong> before being permanently removed. You can restore it from the Recycle Bin during this period.`,
        confirmText: 'Move to Recycle Bin',
        type: 'danger',
        onConfirm: () => {
          Store.deleteApplication(app.id);
          Store.addAuditLog(getCurrentUser().id, 'Moved application to recycle bin', 'application', app.id);
          showToast('Application moved to Recycle Bin. You can restore it within 30 days.', 'success');
          _refreshTable(container);
        }
      });
    });
  });


  // Download (CSV export)
  tableContainer.querySelectorAll('.btn-download-app').forEach(btn => {
    btn.addEventListener('click', () => {
      _downloadApplication(btn.dataset.id);
    });
  });

  // Pagination
  tableContainer.querySelectorAll('.pagination-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _currentPage = parseInt(btn.dataset.page);
      _refreshTable(container);
    });
  });
}

function _renderAnswerPreview(field, value) {
  if (field && ['heading', 'subheading', 'description', 'instruction', 'divider', 'hyperlink'].includes(field.fieldType)) {
    switch (field.fieldType) {
      case 'heading':
        let headingHtml = `<h3>${field.text || field.label}</h3>`;
        if (field.options && field.options.length > 0) {
          headingHtml += `<div style="font-size:12.5px; font-weight:600; color:var(--accent-indigo); margin-top:2px;">Selected: ${value || '<em style="color:var(--text-muted)">Not answered</em>'}</div>`;
        }
        return headingHtml;
      case 'subheading': return `<h4>${field.text || field.label}</h4>`;
      case 'description': return `<p>${field.text || field.label}</p>`;
      case 'instruction': return `<div style="background:rgba(99,102,241,0.03); border-left:3px solid var(--accent-indigo); padding:6px 10px; border-radius:4px; font-size:12px; color:var(--text-muted);">${field.text || field.label}</div>`;
      case 'divider': return `<hr style="border:none; border-top:1px solid var(--border-color); margin:8px 0;">`;
      case 'hyperlink':
        const linkUrl = (field.url && field.url !== '#') ? field.url : (field.label && field.label.startsWith('http') ? field.label : '#');
        return `<a href="${linkUrl}" target="_blank" style="color:var(--accent-indigo); text-decoration:underline;">${field.text || field.label}</a>`;
      default: break;
    }
  }

  if (!value) return '<em style="color:var(--text-muted)">Not answered</em>';
  
  const elementsList = field.elements || [];
  const hasCustomElements = elementsList.length > 0 && !(elementsList.length === 1 && (elementsList[0].id.startsWith('el_srf6_') || elementsList[0].id.startsWith('main_el_')));
  
  if (hasCustomElements) {
    let valuesMap = {};
    try {
      valuesMap = JSON.parse(value);
    } catch (e) {
      return `<div>${value}</div>`;
    }
    
    const rows = elementsList.map(el => {
      const elVal = valuesMap[el.id] !== undefined ? valuesMap[el.id] : '';
      switch (el.type) {
        case 'heading':
          let subHeadingHtml = `<h3 style="font-family:var(--font-title); font-size:14px; font-weight:700; color:var(--text-main); margin-top:8px; margin-bottom:4px;">${el.label || ''}</h3>`;
          if (el.options && el.options.length > 0) {
            subHeadingHtml += `<div style="font-size:11.5px; font-weight:600; color:var(--accent-indigo); margin-bottom:4px;">Selected: ${elVal || '<em style="color:var(--text-muted)">Not answered</em>'}</div>`;
          }
          return subHeadingHtml;
        case 'subheading':
          return `<h4 style="font-family:var(--font-title); font-size:13px; font-weight:600; color:var(--text-main); margin-top:6px; margin-bottom:2px;">${el.label || ''}</h4>`;
        case 'description':
          return `<p style="font-size:12px; color:var(--text-muted); margin:2px 0;">${el.label || ''}</p>`;
        case 'instruction':
          return `<div style="background:rgba(99,102,241,0.03); border-left:3px solid var(--accent-indigo); padding:6px 10px; border-radius:4px; font-size:12px; color:var(--text-muted); margin:4px 0;">${el.label || ''}</div>`;
        case 'divider':
          return `<hr style="border:none; border-top:1px solid var(--border-color); margin:8px 0;">`;
        case 'card':
          return `<div style="border:1px solid var(--border-color); border-radius:6px; padding:8px; background:rgba(255,255,255,0.01); font-size:12px; margin:4px 0;">${el.label || ''}</div>`;
        case 'banner':
          return `<div style="background:rgba(217,119,6,0.04); border:1px solid rgba(217,119,6,0.1); padding:8px; border-radius:4px; font-size:12px; color:var(--warning); font-weight:500; margin:4px 0;">⚠️ ${el.label || ''}</div>`;
        case 'hyperlink':
          const targetUrl = (el.url && el.url !== '#') ? el.url : (el.label && el.label.startsWith('http') ? el.label : '#');
          return `
            <div style="margin:4px 0;">
              <a href="${targetUrl}" target="_blank" style="color:var(--accent-indigo); font-weight:600; text-decoration:underline; font-size:12.5px;">
                ${el.label || 'View Link'}
              </a>
            </div>
          `;
        case 'table':
          const tRows = el.options || ['Dimension 1', 'Dimension 2'];
          const rowVals = elVal ? elVal.split('|') : [];
          const tableRowsHtml = tRows.map((rowOpt, rIdx) => {
            const cellVal = rowVals[rIdx] || '';
            return `
              <tr>
                <td style="padding:6px 10px; border:1px solid var(--border-color); font-weight:500; background:rgba(255,255,255,0.01); width:40%;">${rowOpt}</td>
                <td style="padding:6px 10px; border:1px solid var(--border-color); color:var(--text-main);">${cellVal || '<em style="color:var(--text-muted)">—</em>'}</td>
              </tr>
            `;
          }).join('');
          return `
            <div style="margin:8px 0;">
              <label style="display:block; font-size:12px; font-weight:600; color:var(--text-muted); margin-bottom:4px;">${el.label || 'Table Grid'}</label>
              <table style="width:100%; border-collapse:collapse; border:1px solid var(--border-color); font-size:12px;">
                <tbody>
                  ${tableRowsHtml}
                </tbody>
              </table>
            </div>
          `;
        case 'file':
        case 'pdf':
        case 'imageupload':
          return `
            <div style="margin-bottom:8px;">
              <span style="font-size:12px; font-weight:600; color:var(--text-muted);">${el.label || 'File'}: </span>
              <span style="font-size:12px;">
                ${elVal ? `<a href="${elVal}" target="_blank" style="color:var(--accent-indigo); text-decoration:underline; font-weight:500;">${elVal}</a>` : '<em style="color:var(--text-muted)">No file uploaded</em>'}
              </span>
            </div>
          `;
        default:
          return `
            <div style="margin-bottom:8px; display:flex; flex-direction:column; gap:2px;">
              <span style="font-size:12px; font-weight:600; color:var(--text-muted);">${el.label || 'Field'}:</span>
              <span style="font-size:12.5px; color:var(--text-main); font-weight:500;">${elVal || '<em style="color:var(--text-muted)">—</em>'}</span>
            </div>
          `;
      }
    }).join('');
    
    return `<div class="sub-elements-preview" style="display:flex; flex-direction:column; gap:6px;">${rows}</div>`;
  }
  
  if (['heading', 'subheading', 'description', 'instruction', 'divider', 'hyperlink'].includes(field.fieldType)) {
    switch (field.fieldType) {
      case 'heading': return `<h3>${field.text || field.label}</h3>`;
      case 'subheading': return `<h4>${field.text || field.label}</h4>`;
      case 'description': return `<p>${field.text || field.label}</p>`;
      case 'instruction': return `<div style="background:rgba(99,102,241,0.03); border-left:3px solid var(--accent-indigo); padding:6px 10px; border-radius:4px; font-size:12px; color:var(--text-muted);">${field.text || field.label}</div>`;
      case 'divider': return `<hr style="border:none; border-top:1px solid var(--border-color); margin:8px 0;">`;
      case 'hyperlink':
        const linkUrl = (field.url && field.url !== '#') ? field.url : (field.label && field.label.startsWith('http') ? field.label : '#');
        return `<a href="${linkUrl}" target="_blank" style="color:var(--accent-indigo); text-decoration:underline;">${field.text || field.label}</a>`;
      default: return `<div>${value}</div>`;
    }
  }

  return `<div style="font-size:13px; font-weight:500; color:var(--text-main);">${value}</div>`;
}

// ─── APPLICATION DETAIL VIEW ───────────────────────────────────────────────
export async function renderApplicationDetail(container, appId, onBack) {
  window.workspaceLock = true;
  let app = Store.getApplicationById(appId);
  if (!app) return;
  const currentUser = getCurrentUser();

  // Clear existing heartbeat
  if (window.detailLockHeartbeat) {
    clearInterval(window.detailLockHeartbeat);
    window.detailLockHeartbeat = null;
  }

  // Check Lock Status
  const lockStatus = await Store.getLockStatus(appId);
  if (lockStatus.locked && lockStatus.userId !== currentUser.id) {
    const lockUser = lockStatus.username || lockStatus.lockedBy;
    const expiryMin = lockStatus.durationRemaining !== undefined ? Math.ceil(lockStatus.durationRemaining / 60) : '?';
    container.innerHTML = `
      <div style="margin-bottom:24px;">
        <button id="btn-lock-back-tracker" class="btn btn-secondary btn-sm">← Back</button>
      </div>
      <div class="section-card" style="margin-bottom: 24px; text-align: center; padding: 40px 20px;">
        <div style="font-size: 48px; margin-bottom: 16px;">🔒</div>
        <h2 style="color: var(--danger);">Application is Locked for Review</h2>
        <p style="font-size: 15px; color: var(--text-muted); max-width: 500px; margin: 8px auto 24px auto;">
          This application is currently locked by reviewer <strong>${lockUser}</strong> (Reason: ${lockStatus.reason || 'None'}).
          The lock will automatically expire in approximately <strong>${expiryMin} minutes</strong>.
        </p>
        <div style="display:flex; justify-content:center; gap:12px;">
          <button class="btn btn-secondary" id="btn-lock-back-tracker-btn">Go Back</button>
          ${currentUser.role === 'superadmin' ? `<button class="btn btn-danger" id="btn-lock-force-unlock-btn">Force Unlock (Super Admin)</button>` : ''}
        </div>
      </div>
    `;

    const goBack = () => {
      window.workspaceLock = false;
      if (onBack) onBack();
    };
    container.querySelector('#btn-lock-back-tracker').addEventListener('click', goBack);
    container.querySelector('#btn-lock-back-tracker-btn').addEventListener('click', goBack);

    if (currentUser.role === 'superadmin') {
      container.querySelector('#btn-lock-force-unlock-btn').addEventListener('click', async () => {
        const confirmResult = await showConfirm({
          title: 'Force Unlock Application',
          message: 'Are you sure you want to release the edit lock? Unsaved remarks by the active reviewer will not be persisted.',
          confirmText: 'Release Lock',
          cancelText: 'Cancel'
        });
        if (confirmResult) {
          const unlockRes = await Store.releaseLock(appId, true, 'Super Admin Force Override');
          if (unlockRes.success) {
            showToast('Lock overridden!', 'success');
            renderApplicationDetail(container, appId, onBack);
          } else {
            showAlert({ title: 'Override Failed', message: 'Failed to release lock.', type: 'error' });
          }
        }
      });
    }
    return;
  }

  // Not locked: Acquire Lock
  const acquireRes = await Store.acquireLock(appId, 'Reviewing Application');
  if (!acquireRes.success) {
    showAlert({ title: 'Lock Acquisition Failed', message: acquireRes.error || 'Could not lock application.', type: 'error' });
    if (onBack) onBack();
    return;
  }

  // Start heartbeat renewal
  window.detailLockHeartbeat = setInterval(async () => {
    await Store.acquireLock(appId, 'Heartbeat renewal');
  }, 30000);

  if (currentUser && currentUser.role === 'user' && app.userId !== currentUser.id) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>Access Denied</h3>
        <p>You are not authorized to view this application.</p>
        <button class="btn btn-secondary" id="btn-error-back">Back</button>
      </div>
    `;
    container.querySelector('#btn-error-back')?.addEventListener('click', () => {
      window.workspaceLock = false;
      if (onBack) onBack();
    });
    return;
  }
  const isAdminOrSuper = currentUser && (currentUser.role === 'admin' || currentUser.role === 'superadmin');

  if (isAdminOrSuper && (app.status === 'Submitted' || app.status === 'Resubmitted')) {
    Store.updateApplication(appId, { status: 'Under Review' });
    Store.addTimelineEntry(appId, 'Application marked Under Review', currentUser.id);
    Store.addAuditLog(currentUser.id, 'Application marked Under Review', 'application', appId);
    app = Store.getApplicationById(appId);
  }

  const user = Store.getUserById(app.userId);
  const edition = Store.getEditionById(app.editionId);
  const answers = Store.getAnswersByApplication(appId);
  const answersMap = {};
  answers.forEach(a => { answersMap[a.fieldId] = a; });
  const score = Store.calculateApplicationScore(appId);
  const maxScore = Store.calculateApplicationMaxScore(appId) || 1;
  const pct = ((score / maxScore) * 100).toFixed(1);
  const applicant = Store.getUserById(app.userId);
  const userAssignments = Store.getAssignments ? Store.getAssignments(app.userId) : [];
  const hasEdAssignments = userAssignments.some(a => a.editionId === app.editionId);

  const allSections = Store.getSectionsByEdition(app.editionId);
  const sections = allSections.filter(sec => {
    if (isAdminOrSuper) return true;
    return Store.isSectionAssignedToUser(sec, applicant);
  });

  const fields = Store.getFieldsByEdition(app.editionId).filter(f => {
    const sec = allSections.find(s => s.id === f.reformAreaId);
    if (!sec || !sections.includes(sec)) return false;
    if (isAdminOrSuper) return true;
    return Store.isFieldAssignedToUser(f, applicant);
  });

  const catName = (edition?.categories || []).find(c => c.id === app.category)?.name || app.category;
  const statusCls = _statusClass(app.status);

  const timeline = (app.timeline || []).reverse().map(t => `
    <div class="timeline-item">
      <div class="timeline-dot"></div>
      <div class="timeline-content">
        <p class="timeline-action">${t.action}</p>
        <span class="timeline-time">${new Date(t.timestamp).toLocaleString('en-IN')} — ${t.by}</span>
      </div>
    </div>
  `).join('');

  const sectionReviews = sections.map(sec => {
    const secFields = fields.filter(f => f.reformAreaId === sec.id);
    const rows = secFields.map(field => {
      const ans = answersMap[field.id];
      const filesList = ans?.files || [];
      const docsHtml = filesList.map(f => {
        const fileStatusCls = _statusClass(f.fileStatus || 'Pending');
        return `
          <div class="admin-doc-card" style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:rgba(255,255,255,0.02); border:1px solid var(--border-color); border-radius:6px; margin-top:8px; gap:12px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-muted);"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <div style="display:flex; flex-direction:column;">
                <span style="font-weight:600; font-size:12.5px; color:var(--text-main);">${f.name}</span>
                ${f.fileRejectionReason ? `<span style="color:var(--danger); font-size:11px; margin-top:2px;">Reason: ${f.fileRejectionReason}</span>` : ''}
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="status-badge ${fileStatusCls}" style="font-size:10px; padding:2px 8px;">${f.fileStatus || 'Pending'}</span>
              <button class="btn btn-xs btn-outline btn-view-doc-file" data-app-id="${appId}" data-field-id="${field.id}" data-doc-id="${f.docId}" data-doc-name="${f.name}" title="View inline">
                👁️ View
              </button>
              <button class="btn btn-xs btn-secondary btn-download-doc-file" data-app-id="${appId}" data-field-id="${field.id}" data-doc-id="${f.docId}" data-doc-name="${f.name}" title="Download">
                📥 Download
              </button>
              ${(!isSuperAdmin() && f.fileStatus !== 'Approved') ? `
                <button class="btn btn-xs btn-success-solid btn-approve-doc-file" data-app-id="${appId}" data-field-id="${field.id}" data-doc-id="${f.docId}" title="Approve">
                  ✓ Approve
                </button>
              ` : ''}
              ${(!isSuperAdmin() && f.fileStatus !== 'Rejected' && f.fileStatus !== 'Approved') ? `
                <button class="btn btn-xs btn-danger btn-reject-doc-file" data-app-id="${appId}" data-field-id="${field.id}" data-doc-id="${f.docId}" title="Reject">
                  ✕ Reject
                </button>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');

      const qStatus = ans?.questionStatus || 'Draft';
      const qScore = ans?.questionScore || 0;
      const maxScore = field.maxScore || field.weight || 1;

      return `
        <div class="review-row-container" style="padding:16px; border-bottom:1px solid var(--border-color); background:rgba(255,255,255,0.01);">
          <div class="review-row" style="display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: start; border:none; padding:0; margin-bottom: 8px;">
            <div class="review-q" style="display:flex; gap:8px;">
              <span class="q-num" style="font-weight:700; color:var(--text-dark);">${field.num || ''}</span>
              <span style="font-weight:600; color:var(--text-main); line-height:1.45;">${field.text || field.label}</span>
            </div>
            <div class="review-answer" style="display:flex; align-items:center; gap:8px;">
              <span class="ans-val">${_renderAnswerPreview(field, ans?.value)}</span>
              ${ans?.questionStatus ? `<span class="status-badge ${_statusClass(ans.questionStatus)} badge-xs">${ans.questionStatus}</span>` : ''}
            </div>
          </div>
          ${!field.isLayoutElement ? `
            <div class="question-review-actions" style="margin-top:10px; padding-left:38px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
              <div style="display:flex; align-items:center; gap:8px;">
                ${(!isSuperAdmin() && ['Submitted', 'Under Review', 'Resubmitted'].includes(app.status) && !['Draft', 'Approved'].includes(qStatus)) ? `
                  <button class="btn btn-xs btn-success-solid btn-approve-q" data-app-id="${appId}" data-field-id="${field.id}" data-max-score="${maxScore}">
                    ✓ Approve Question
                  </button>
                ` : ''}
                ${(!isSuperAdmin() && ['Submitted', 'Under Review', 'Resubmitted'].includes(app.status) && !['Draft', 'Approved', 'Rejected'].includes(qStatus)) ? `
                  <button class="btn btn-xs btn-warning btn-reject-q" data-app-id="${appId}" data-field-id="${field.id}">
                    ↺ Resubmit Question
                  </button>
                ` : ''}
              </div>
              <div style="font-size:12.5px; font-weight:600;">
                Score: <span style="color:var(--accent-indigo); font-size:14px; font-weight:700;">${['Approved', 'Rejected'].includes(qStatus) ? qScore : '—'}</span> / ${maxScore}
              </div>
            </div>
          ` : ''}
          ${ans?.adminRemarks ? `
            <div style="margin-top:8px; margin-left:38px; font-size:12px; color:var(--danger); background:rgba(220,38,38,0.03); border-left:2px solid var(--danger); padding:4px 8px; border-radius:4px;">
              <strong>Remarks:</strong> ${ans.adminRemarks}
            </div>
          ` : ''}
          ${docsHtml ? `<div class="review-docs" style="margin-top:12px; padding-left:38px;">${docsHtml}</div>` : ''}
        </div>
      `;
    }).join('');
    const secName = sec.name || sec.title || `Reform Area ${sec.orderIndex + 1}`;
    return rows ? `<div class="review-section-block"><h4 style="font-size:14px; font-weight:700; color:var(--accent-indigo); padding:12px 16px; background:rgba(79,70,229,0.06); border-left:3px solid var(--accent-indigo); border-radius:4px; margin-bottom:0;">${secName}</h4>${rows}</div>` : '';
  }).join('');

  const hasBeenReviewed = ['Approved', 'Rejected', 'Additional Documents Requested'].includes(app.status);

  container.innerHTML = `
    <div style="margin-bottom:24px;display:flex;align-items:center;gap:12px;">
      <button id="btn-back-tracker" class="btn btn-secondary btn-sm">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Tracker
      </button>
      <div class="breadcrumbs-container" style="font-size:12px;color:var(--text-muted);">
        <span style="color:var(--primary);font-weight:500;">Admin</span> / <span style="color:var(--primary);font-weight:500;">Applications</span> / <span style="color:var(--text-main);font-weight:600;">${appId}</span>
      </div>
    </div>

    <div class="section-card" style="margin-bottom:24px;position:relative;">
      <div class="section-badge admin-badge">Application Details</div>
      <h1>${app.id}</h1>
      <p style="color:var(--text-muted);">${edition?.name || ''} — ${catName}</p>
      <div style="position:absolute;top:32px;right:32px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;max-width:60%;justify-content:flex-end;">
        <span class="status-badge ${statusCls}" style="white-space:nowrap; font-size:10px; max-width:160px; overflow:hidden; text-overflow:ellipsis;" title="${app.status}">${_statusShort(app.status)}</span>
        ${(!isSuperAdmin() && ['Submitted', 'Under Review', 'Resubmitted'].includes(app.status)) ? `<button class="btn btn-sm btn-success-solid" id="btn-detail-approve">✓ Approve</button>` : ''}
        ${(!isSuperAdmin() && ['Submitted', 'Under Review', 'Resubmitted'].includes(app.status)) ? `<button class="btn btn-sm btn-danger" id="btn-detail-reject">✕ Reject</button>` : ''}
        ${(!isSuperAdmin() && ['Submitted', 'Under Review', 'Resubmitted'].includes(app.status)) ? `<button class="btn btn-sm btn-outline" id="btn-detail-req-docs">Request Docs</button>` : ''}
        <button class="btn btn-sm btn-secondary" id="btn-detail-comment">Add Comment</button>
      </div>
    </div>

    ${app.status === 'Rejected' && app.rejectionReason ? `
      <div class="alert-box alert-danger" style="margin-bottom:24px;">
        <strong>Rejection Reason:</strong> ${app.rejectionReason}
      </div>
    ` : ''}
    ${app.status === 'Additional Documents Requested' && app.additionalDocsNote ? `
      <div class="alert-box alert-warning" style="margin-bottom:24px;">
        <strong>Additional Documents Requested:</strong> ${app.additionalDocsNote}
      </div>
    ` : ''}

    <div style="display:grid;grid-template-columns:1fr 340px;gap:24px;">
      <div>
        <div class="stats-grid" style="margin-bottom:24px;">
          <div class="stat-card">
            <div class="stat-info"><h3>Score</h3><p style="font-size:20px;font-weight:700;color:var(--accent-indigo)">${score > 0 || hasBeenReviewed ? `${score} / ${maxScore}` : '—'}</p></div>
          </div>
          <div class="stat-card">
            <div class="stat-info"><h3>Percentage</h3><p style="font-size:20px;font-weight:700;color:var(--success)">${score > 0 || hasBeenReviewed ? `${pct}%` : '—'}</p></div>
          </div>
          <div class="stat-card">
            <div class="stat-info"><h3>Status</h3><p><span class="status-badge ${statusCls}" title="${app.status}">${_statusShort(app.status)}</span></p></div>
          </div>
          <div class="stat-card">
            <div class="stat-info"><h3>Submitted</h3><p style="font-size:14px;font-weight:600;color:var(--text-main);">${app.submittedAt ? new Date(app.submittedAt).toLocaleDateString('en-IN') : 'Not yet'}</p></div>
          </div>
        </div>

        <div class="card glass-card" style="margin-bottom:24px;">
          <div class="card-header"><h2>Submitted Answers</h2></div>
          <div class="card-body">${sectionReviews || '<p style="color:var(--text-muted);">No answers submitted yet.</p>'}</div>
        </div>

        ${(app.comments || []).length > 0 ? `
          <div class="card glass-card">
            <div class="card-header"><h2>Comments</h2></div>
            <div class="card-body">
              ${(app.comments || []).map(c => `
                <div class="comment-item">
                  <strong>${c.by}</strong> <span style="color:var(--text-muted);font-size:12px;">${new Date(c.timestamp).toLocaleString('en-IN')}</span>
                  <p>${c.text}</p>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>

      <div>
        <div class="card glass-card" style="margin-bottom:24px;">
          <div class="card-header"><h2>Applicant Profile</h2></div>
          <div class="card-body">
            <table class="profile-table">
              <tr><td>Name</td><td><strong>${user?.name || 'Unknown'}</strong></td></tr>
              <tr><td>Organization</td><td>${user?.organization || '—'}</td></tr>
              <tr><td>Email</td><td><code style="font-size:11px;">${user?.email || '—'}</code></td></tr>
              <tr><td>State</td><td>${user?.state || '—'}</td></tr>
              <tr><td>District</td><td>${user?.district || '—'}</td></tr>
              <tr><td>Sector</td><td>${user?.sector || '—'}</td></tr>
              <tr><td>Category</td><td>${catName || '—'}</td></tr>
            </table>
          </div>
        </div>

        <div class="card glass-card">
          <div class="card-header"><h2>Timeline</h2></div>
          <div class="card-body">
            <div class="timeline-list">${timeline || '<p style="color:var(--text-muted);">No history yet.</p>'}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#btn-back-tracker').addEventListener('click', async () => {
    window.workspaceLock = false;
    if (window.detailLockHeartbeat) {
      clearInterval(window.detailLockHeartbeat);
      window.detailLockHeartbeat = null;
    }
    await Store.releaseLock(appId);
    if (onBack) onBack();
  });

  // Detail approve
  const approveBtn = container.querySelector('#btn-detail-approve');
  if (approveBtn) {
    approveBtn.addEventListener('click', () => {
      // Approval validation: block if mandatory questions are unreviewed
      const fields = Store.getFieldsByEdition(app.editionId);
      const reviewableFields = fields.filter(f => !f.isLayoutElement && f.mandatory);
      const answers = Store.getAnswersByApplication(app.id);
      const unreviewedMandatory = reviewableFields.filter(f => {
        const a = answers.find(x => x.fieldId === f.id);
        if (!a || !a.value) return true;
        return a.questionStatus !== 'Approved' && a.questionStatus !== 'Rejected';
      });

      if (unreviewedMandatory.length > 0) {
        const qList = unreviewedMandatory.slice(0, 5).map(f => `Q${f.num}`).join(', ') + (unreviewedMandatory.length > 5 ? '...' : '');
        showAlert({
          title: 'Cannot Approve Yet',
          message: `${unreviewedMandatory.length} mandatory question(s) still need a review decision before you can approve this application.<br><br><strong>Pending: ${qList}</strong><br><br>Please open the <em>Questions &amp; Scores</em> tab to review all questions first.`,
          type: 'warning'
        });
        return;
      }

      showPrompt({
        title: 'Approve Application',
        message: `Enter comments / remarks to approve <strong>${app.id}</strong> (optional):`,
        placeholder: 'Approved by admin',
        confirmText: 'Approve',
        onConfirm: (remarks) => {
          const comments = remarks || 'Approved by admin';
          Store.approveApplication(app.id, getCurrentUser().id, comments);
          Store.addAuditLog(getCurrentUser().id, `Application ${app.id} approved. Remarks: ${comments}`, 'application-review', app.id);
          Store.addNotification(app.userId, NOTIFICATION_EVENTS.APPLICATION_APPROVED, `Your application ${app.id} has been approved!`, app.id);
          showAlert({
            title: 'Application Approved Successfully!',
            message: `Application ${app.id} is now approved.`,
            type: 'success',
            onClose: () => {
              renderApplicationDetail(container, appId, onBack);
            }
          });
        }
      });
    });
  }

  // Detail reject
  const rejectBtn = container.querySelector('#btn-detail-reject');
  if (rejectBtn) {
    rejectBtn.addEventListener('click', () => {
      showPrompt({ title: 'Reject Application', message: 'Enter the rejection reason:', placeholder: 'e.g. Incomplete documentation...', confirmText: 'Reject',
        onConfirm: (reason) => {
          Store.rejectApplication(app.id, getCurrentUser().id, reason || 'No reason provided');
          Store.addNotification(app.userId, NOTIFICATION_EVENTS.APPLICATION_REJECTED,
            `Your application ${app.id} was rejected. Reason: ${reason}`, app.id);
          Store.addAuditLog(getCurrentUser().id, `Rejected application: ${reason}`, 'application', app.id);
          showAlert({
            title: 'Application Rejected',
            message: 'Rejection saved and user notified.',
            type: 'info',
            onClose: () => {
              renderApplicationDetail(container, appId, onBack);
            }
          });
        }
      });
    });
  }

  // Request docs
  container.querySelector('#btn-detail-req-docs')?.addEventListener('click', () => {
    showPrompt({ title: 'Request Additional Documents', message: 'Specify what documents are needed:', placeholder: 'e.g. Please upload the original G.O. document...',
      confirmText: 'Send Request',
      onConfirm: (note) => {
        Store.requestAdditionalDocs(app.id, getCurrentUser().id, note);
        Store.addNotification(app.userId, NOTIFICATION_EVENTS.ADDITIONAL_DOCS_REQUESTED,
          `Additional documents requested for application ${app.id}: ${note}`, app.id);
        Store.addAuditLog(getCurrentUser().id, `Requested additional docs: ${note}`, 'application', app.id);
        showToast('Additional documents requested — user notified.', 'info');
        renderApplicationDetail(container, appId, onBack);
      }
    });
  });

  // Add comment
  container.querySelector('#btn-detail-comment')?.addEventListener('click', () => {
    showPrompt({ title: 'Add Comment', message: 'Enter your comment or note:', placeholder: 'Admin observation or note...',
      confirmText: 'Add Comment',
      onConfirm: (text) => {
        if (!text) return;
        Store.addComment(app.id, getCurrentUser().id, text);
        Store.addAuditLog(getCurrentUser().id, 'Added comment to application', 'application', app.id);
        showToast('Comment added.', 'success');
        renderApplicationDetail(container, appId, onBack);
      }
    });
  });

  // Approve document
  container.querySelectorAll('.btn-approve-doc-file').forEach(btn => {
    btn.addEventListener('click', () => {
      const { appId: aId, fieldId, docId } = btn.dataset;
      showConfirm({
        title: 'Approve Document',
        message: 'Are you sure you want to approve this document?',
        confirmText: 'Approve',
        type: 'success',
        onConfirm: () => {
          Store.approveDocument(aId, fieldId, docId, getCurrentUser().id);
          Store.addAuditLog(getCurrentUser().id, `Approved document ${docId} for field ${fieldId}`, 'application', aId);
          showToast('Document Approved Successfully!', 'success');
          renderApplicationDetail(container, appId, onBack);
        }
      });
    });
  });

  // Reject document
  container.querySelectorAll('.btn-reject-doc-file').forEach(btn => {
    btn.addEventListener('click', () => {
      const { appId: aId, fieldId, docId } = btn.dataset;
      showPrompt({
        title: 'Reject Document',
        message: 'Enter rejection reason for this document:',
        placeholder: 'e.g., Document is illegible or incorrect...',
        confirmText: 'Reject Document',
        onConfirm: (reason) => {
          if (!reason) {
            showToast('Rejection reason is required', 'warning');
            return;
          }
          Store.rejectDocument(aId, fieldId, docId, getCurrentUser().id, reason);
          // Set the overall application status to 'Additional Documents Requested'
          Store.updateApplication(aId, { status: 'Additional Documents Requested', additionalDocsNote: `Document rejected: ${reason}` });
          Store.addTimelineEntry(aId, `Document rejected: ${reason}`, getCurrentUser().id);
          Store.addNotification(app.userId, NOTIFICATION_EVENTS.APPLICATION_REJECTED,
            `Additional documents requested: document rejected — ${reason}`, aId);
          Store.addAuditLog(getCurrentUser().id, `Rejected document ${docId} for field ${fieldId}: ${reason}`, 'application', aId);
          showToast('Document Rejected and User Notified', 'info');
          renderApplicationDetail(container, appId, onBack);
        }
      });
    });
  });

  // Download document
  container.querySelectorAll('.btn-download-doc-file').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { appId: aId, fieldId, docId, docName } = btn.dataset;
      const ans = Store.getAnswerByField(aId, fieldId);
      let fileObj = (ans?.files || []).find(f => f.docId === docId) || (ans?.files || []).find(f => f.name === docName);
      
      // If no dataUrl in memory, fetch fresh from server
      if (!fileObj?.dataUrl) {
        try {
          btn.textContent = '⏳ Loading...';
          btn.disabled = true;
          const res = await fetch(`/api/files/${aId}/${fieldId}`);
          if (res.ok) {
            const data = await res.json();
            const serverFiles = data.files || [];
            fileObj = serverFiles.find(f => f.docId === docId) || serverFiles.find(f => f.name === docName);
          }
        } catch(e) {
          console.error('[Download] Failed to fetch file from server:', e);
        } finally {
          btn.textContent = '📥 Download';
          btn.disabled = false;
        }
      }
      
      if (fileObj && fileObj.dataUrl) {
        const objectUrl = dataURLtoObjectURL(fileObj.dataUrl);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = fileObj.name || docName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else if (docId) {
        const url = `/api/files/${aId}/${fieldId}/${docId}`;
        const a = document.createElement('a');
        a.href = url;
        a.download = docName || 'document';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        showAlert({
          title: 'Download Unavailable',
          message: `The file "${docName}" could not be downloaded. The document may not have been uploaded yet or the data was not saved. Please ask the user to re-upload.`,
          type: 'warning'
        });
      }
    });
  });

  // View document inline
  container.querySelectorAll('.btn-view-doc-file').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { appId: aId, fieldId, docId, docName } = btn.dataset;
      const ans = Store.getAnswerByField(aId, fieldId);
      let fileObj = (ans?.files || []).find(f => f.docId === docId) || (ans?.files || []).find(f => f.name === docName);

      // If no dataUrl in memory, fetch fresh from server
      if (!fileObj?.dataUrl) {
        try {
          btn.textContent = '⏳ Loading...';
          btn.disabled = true;
          const res = await fetch(`/api/files/${aId}/${fieldId}`);
          if (res.ok) {
            const data = await res.json();
            const serverFiles = data.files || [];
            fileObj = serverFiles.find(f => f.docId === docId) || serverFiles.find(f => f.name === docName);
          }
        } catch(e) {
          console.error('[View] Failed to fetch file from server:', e);
        } finally {
          btn.textContent = '👁️ View';
          btn.disabled = false;
        }
      }

      if (fileObj && fileObj.dataUrl) {
        Store.addAuditLog(getCurrentUser().id, `Viewed document "${fileObj.name}" for field ${fieldId}`, 'application', aId);
        const objectUrl = dataURLtoObjectURL(fileObj.dataUrl);
        showFileViewer({
          title: `Document: ${fileObj.name}`,
          dataUrl: objectUrl,
          fileName: fileObj.name
        });
      } else if (docId) {
        Store.addAuditLog(getCurrentUser().id, `Viewed document "${docName || 'document'}" for field ${fieldId}`, 'application', aId);
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
              title: `Document Preview: ${docName || 'File'}`,
              dataUrl: objectUrl,
              fileName: docName || `document_${docId}`
            });
          })
          .catch(err => {
            showAlert({ title: 'Preview Failed', message: err.message, type: 'error' });
          });
      } else if (fileObj) {
        showAlert({
          title: 'Preview Unavailable',
          message: `"${fileObj.name}" has no preview data. The file may not have been fully uploaded. Please ask the user to re-upload.`,
          type: 'warning'
        });
      } else {
        showAlert({
          title: 'Document Not Found',
          message: 'No uploaded document was found for this entry. The user may not have uploaded a file yet.',
          type: 'warning'
        });
      }
    });
  });

  // Approve Question
  container.querySelectorAll('.btn-approve-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const { appId: aId, fieldId, maxScore } = btn.dataset;
      const field = Store.getFieldById(fieldId);
      showPrompt({
        title: 'Approve Question',
        message: `Enter score to award (max ${maxScore}):`,
        placeholder: maxScore,
        confirmText: 'Approve',
        onConfirm: (scoreStr) => {
          const score = parseFloat(scoreStr);
          const finalScore = isNaN(score) ? parseFloat(maxScore) : score;
          
          Store.approveQuestion(aId, fieldId, getCurrentUser().id, finalScore);
          
          // Send notification
          Store.addNotification(app.userId, NOTIFICATION_EVENTS.QUESTION_APPROVED,
            `Your response for "${field?.text || fieldId}" was approved with a score of ${finalScore}.`, aId);
          Store.addAuditLog(getCurrentUser().id, `Approved question ${fieldId} with score ${finalScore}`, 'application', aId);
          showToast('Question approved successfully!', 'success');
          
          // Refresh details view
          renderApplicationDetail(container, appId, onBack);
        }
      });
    });
  });

  // Reject Question
  container.querySelectorAll('.btn-reject-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const { appId: aId, fieldId } = btn.dataset;
      const field = Store.getFieldById(fieldId);
      showPrompt({
        title: 'Request Resubmission',
        message: `Enter remarks / reason for resubmission for "${field?.text || fieldId}":`,
        placeholder: 'e.g. Insufficient details or wrong documents provided...',
        confirmText: 'Request Resubmission',
        onConfirm: (reason) => {
          if (!reason) {
            showToast('Remarks/reason is required to request resubmission', 'warning');
            return;
          }
          Store.rejectQuestion(aId, fieldId, getCurrentUser().id, reason);
          
          // Send notification
          Store.addNotification(app.userId, NOTIFICATION_EVENTS.QUESTION_REJECTED,
            `Resubmission requested for your response to "${field?.text || fieldId}". Reason: ${reason}`, aId);
          Store.addAuditLog(getCurrentUser().id, `Requested resubmission for question ${fieldId}: ${reason}`, 'application', aId);
          showToast('Resubmission requested.', 'info');
          
          // Refresh details view
          renderApplicationDetail(container, appId, onBack);
        }
      });
    });
  });
}

// ─── HELPERS ──────────────────────────────────────────────────────────────
function _kpiCard(label, value, color, key) {
  let statusVal = '';
  if (key === 'draft') statusVal = 'Draft';
  if (key === 'pending') statusVal = 'Submitted';
  if (key === 'approved') statusVal = 'Approved';
  if (key === 'rejected') statusVal = 'Rejected';
  if (key === 'addocs') statusVal = 'Additional Documents Requested';

  return `
    <div class="stat-card" style="cursor:pointer;" onclick="const select = document.querySelector('#tracker-filter-status'); if(select) { select.value='${statusVal}'; select.dispatchEvent(new Event('change')); }">
      <div class="stat-info">
        <h3 style="color:${color}">${value}</h3>
        <p style="font-size:13px;color:var(--text-muted)">${label}</p>
      </div>
    </div>
  `;
}

function _statusClass(status) {
  const map = {
    'Draft': 'status-draft',
    'Submitted': 'status-submitted',
    'Resubmitted': 'status-submitted',
    'Under Review': 'status-review',
    'Admin Approved': 'status-submitted',
    'Super Admin Review': 'status-review',
    'Final Approved': 'status-approved',
    'Approved': 'status-approved',
    'Rejected': 'status-rejected',
    'Additional Documents Requested': 'status-add-docs',
    'Not Started': 'status-draft',
    'Pending': 'status-draft',
  };
  return map[status] || 'status-draft';
}

function _statusShort(status) {
  const map = {
    'Draft': 'Draft',
    'Submitted': 'Submitted',
    'Resubmitted': 'Resubmitted',
    'Under Review': 'Under Review',
    'Admin Approved': 'Admin Approved',
    'Super Admin Review': 'SA Review',
    'Final Approved': 'Final Approved',
    'Approved': 'Approved',
    'Rejected': 'Rejected',
    'Additional Documents Requested': 'Add. Docs Req.',
    'Not Started': 'Not Started',
    'Pending': 'Pending',
  };
  return map[status] || status;
}

function _paginationHtml({ page, totalPages, total }) {
  if (totalPages <= 1) return '';
  let pages = '';
  for (let i = 1; i <= totalPages; i++) {
    pages += `<button class="pagination-btn ${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }
  return `<div class="pagination-bar">
    <span class="pagination-info">Showing page ${page} of ${totalPages} (${total} total)</span>
    <div class="pagination-pages">${pages}</div>
  </div>`;
}

function _downloadApplication(appId) {
  const app = Store.getApplicationById(appId);
  const user = Store.getUserById(app?.userId);
  const answers = Store.getAnswersByApplication(appId);
  const fields = Store.getFieldsByEdition(app?.editionId || '');
  const fieldsMap = {};
  fields.forEach(f => { fieldsMap[f.id] = f; });

  const rows = [['Application ID', 'Applicant', 'Question', 'Answer', 'Status']];
  answers.forEach(ans => {
    const field = fieldsMap[ans.fieldId];
    rows.push([app?.id || '', user?.name || '', field?.text || ans.fieldId || '', ans.value || '', ans.questionStatus || '']);
  });

  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `application_${appId}.csv`;
  a.click();
}
