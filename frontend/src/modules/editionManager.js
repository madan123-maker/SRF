/* ==========================================================================
   editionManager.js — Edition Cards + Workspace (6 Tabs) v2.1
   Dynamic SRF Management Platform
   Tabs: Applications | Reform Areas | Schema Builder | Question Queue | Scores | Reports
   ========================================================================== */

import * as Store from '../db/store.js';
import { showConfirm, showAlert, showPrompt, showFileViewer } from '../ui/confirmDialog.js';
import { showToast } from '../ui/toastManager.js';
import { getCurrentUser, isSuperAdmin } from '../auth/auth.js';
import { NOTIFICATION_EVENTS, QUESTION_STATUS, DOC_STATUS, TOOLBOX_ELEMENTS } from '../db/schema.js';
import { dataURLtoObjectURL } from '../ui/fileUtil.js';

let _activeEditionId = null;
let _activeWorkspaceTab = 'applications';
let _activeReformAreaId = null;
let _activeActionPointId = null;
let _activeQuestionId = null;
let _expandedApGroups = new Set();
let _onBackToEditions = null;
let _workspaceContainer = null;

// ═══════════════════════════════════════════════════════════════
// EDITION CARDS DASHBOARD
// ═══════════════════════════════════════════════════════════════
export function renderEditionsDashboard(container, onSelectEdition) {
  const editions = Store.getEditions();
  _onBackToEditions = () => renderEditionsDashboard(container, onSelectEdition);

  const cards = editions.map(ed => {
    const stats = Store.getEditionStats(ed.id);
    const isPublished = ed.status === 'published';
    return `
      <div class="edition-card" data-eid="${ed.id}">
        <div class="edition-card-top">
          <div class="edition-card-icon" style="background:${isPublished ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#94a3b8,#64748b)'};">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          </div>
          <div class="edition-card-meta">
            <h3>${ed.name}</h3>
            <p>${ed.description || 'No description'}</p>
          </div>
          <span class="edition-status-pill ${isPublished ? 'pill-published' : 'pill-draft'}">${isPublished ? '● Live' : '○ Draft'}</span>
        </div>

        <div class="edition-stats-row">
          <div class="edition-stat"><div class="estat-value">${stats.total}</div><div class="estat-label">Total</div></div>
          <div class="edition-stat"><div class="estat-value" style="color:#d97706">${stats.submitted + stats.underReview}</div><div class="estat-label">Pending</div></div>
          <div class="edition-stat"><div class="estat-value" style="color:#10b981">${stats.approved}</div><div class="estat-label">Approved</div></div>
          <div class="edition-stat"><div class="estat-value" style="color:#ef4444">${stats.rejected}</div><div class="estat-label">Rejected</div></div>
          <div class="edition-stat"><div class="estat-value" style="color:#4f46e5">${stats.avgScore}</div><div class="estat-label">Avg Score</div></div>
        </div>

        <div class="edition-card-footer" onclick="event.stopPropagation()">
          <button class="btn btn-sm btn-outline btn-edit-ed" data-id="${ed.id}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit
          </button>
          ${isSuperAdmin() ? `
          <button class="btn btn-sm ${isPublished ? 'btn-secondary' : 'btn-success-solid'} btn-publish-ed" data-id="${ed.id}" data-status="${ed.status}">
            ${isPublished ? 'Unpublish' : 'Publish'}
          </button>
          <button class="btn btn-sm btn-danger btn-delete-ed" data-id="${ed.id}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            Delete
          </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  const showCreateBtn = isSuperAdmin();
  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-eyebrow">Admin Dashboard</div>
        <h1 class="page-title">SRF Editions</h1>
        <p class="page-subtitle">Create and manage ranking framework editions. Click any edition to open its workspace.</p>
      </div>
      ${showCreateBtn ? `
      <div style="display:flex; gap:10px;">
        <button id="btn-create-edition" class="btn btn-primary btn-lg">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Edition
        </button>
      </div>
      ` : ''}
    </div>

    <div class="editions-grid">
      ${cards}
      ${showCreateBtn ? `
      <div class="edition-card edition-add-card" id="btn-create-edition-card">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--border-color)" stroke-width="1.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <p>Create New Edition</p>
      </div>
      ` : ''}
    </div>
  `;

  // Card click → open workspace
  container.querySelectorAll('.edition-card:not(.edition-add-card)').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      if (onSelectEdition) onSelectEdition(card.dataset.eid);
    });
  });

  container.querySelector('#btn-create-edition')?.addEventListener('click', () => _openCreateEditionModal(container, onSelectEdition));
  container.querySelector('#btn-create-edition-card')?.addEventListener('click', () => _openCreateEditionModal(container, onSelectEdition));

  container.querySelectorAll('.btn-edit-ed').forEach(btn => {
    btn.addEventListener('click', () => _openEditEditionModal(btn.dataset.id, container, onSelectEdition));
  });

  container.querySelectorAll('.btn-publish-ed').forEach(btn => {
    btn.addEventListener('click', () => {
      const ed = Store.getEditionById(btn.dataset.id);
      const isPublished = btn.dataset.status === 'published';
      showConfirm({
        title: isPublished ? 'Unpublish Edition' : 'Publish Edition',
        message: isPublished
          ? `Unpublish <strong>${ed.name}</strong>? Users will no longer submit applications.`
          : `Publish <strong>${ed.name}</strong>? Users will be able to submit applications.`,
        type: isPublished ? 'warning' : 'success',
        confirmText: isPublished ? 'Unpublish' : 'Publish',
        onConfirm: () => {
          Store.updateEdition(ed.id, { status: isPublished ? 'draft' : 'published' });
          Store.addAuditLog(getCurrentUser().id, `${isPublished ? 'Unpublished' : 'Published'} edition: ${ed.name}`, 'edition', ed.id);
          showToast(`${ed.name} ${isPublished ? 'unpublished' : 'published'}!`, 'success');
          renderEditionsDashboard(container, onSelectEdition);
        }
      });
    });
  });

  container.querySelectorAll('.btn-delete-ed').forEach(btn => {
    btn.addEventListener('click', () => {
      const ed = Store.getEditionById(btn.dataset.id);
      showConfirm({
        title: 'Move Edition to Recycle Bin',
        message: `Are you sure you want to move edition "${ed.name}" to the Recycle Bin? It can be restored later.`,
        type: 'danger', confirmText: 'Move to Recycle Bin',
        onConfirm: () => {
          Store.deleteEdition(ed.id);
          Store.addAuditLog(getCurrentUser().id, `Moved edition to Recycle Bin: ${ed.name}`, 'edition', ed.id);
          showToast(`Edition moved to Recycle Bin.`, 'success');
          renderEditionsDashboard(container, onSelectEdition);
        }
      });
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// EDITION WORKSPACE
// ═══════════════════════════════════════════════════════════════
export function renderEditionWorkspace(container, editionId, onBack) {
  _activeEditionId = editionId;
  _workspaceContainer = container;
  const edition = Store.getEditionById(editionId);
  if (!edition) return;

  const isPublished = edition.status === 'published';
  const tabs = [
    { key: 'applications', label: 'Applications', icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>' },
  ];
  if (isSuperAdmin()) {
    tabs.push({ key: 'schema',       label: 'Schema Editor', icon: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>' });
  }

  container.innerHTML = `
    <div class="ws-workspace workspace-panel">

      <!-- Page Header -->
      <div class="section-card" style="margin-bottom:24px;">
        <div style="float:right; display:flex; gap:8px; margin-top:4px; align-items:center;">
          <span class="edition-status-pill ${isPublished ? 'pill-published' : 'pill-draft'}" style="margin-right:12px;">
            ${isPublished ? '● Published' : '○ Draft'}
          </span>
          <button class="btn btn-secondary btn-sm ws-back-btn" id="ws-back-btn" style="display:flex;align-items:center;gap:5px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            All Editions
          </button>
        </div>
        <div class="section-badge admin-badge" style="text-transform:uppercase;">EDITION WORKSPACE</div>
        <h1 style="margin-bottom:4px;">${edition.name} Workspace</h1>
        <p style="color:var(--text-muted);font-size:14px; margin-top:0;">${edition.description || 'Manage edition applications, schemas, and configurations'}</p>
      </div>

      <!-- Tab Navigation -->
      <div class="workspace-tabs" id="ws-tabs" style="display:flex; gap:20px; margin-bottom:24px; border-bottom:1px solid var(--border-color); padding-bottom:0px; overflow-x:auto;">
        ${tabs.map((t, i) => `
          <button class="tab-btn ws-tab-btn ${i === 0 ? 'active' : ''}" data-tab="${t.key}" style="display:flex; align-items:center; gap:8px; background:transparent; border:none; border-bottom:2px solid transparent; cursor:pointer; outline:none; white-space:nowrap; padding:10px 16px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${t.icon}</svg>
            ${t.label}
          </button>
        `).join('')}
      </div>

      <!-- Tab Content -->
      <div id="ws-content" class="ws-tab-content"></div>
    </div>
  `;

  document.getElementById('ws-back-btn').addEventListener('click', () => { if (onBack) onBack(); });

  container.querySelectorAll('.ws-tab-btn').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.ws-tab-btn').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _activeWorkspaceTab = tab.dataset.tab;
      _renderWorkspaceTab(editionId);
    });
  });

  _renderWorkspaceTab(editionId);
}

function _renderWorkspaceTab(editionId) {
  const content = document.getElementById('ws-content');
  if (!content) return;
  content.innerHTML = '<div class="ws-loading"><div class="spinner"></div></div>';
  setTimeout(() => {
    content.innerHTML = '';
    if (_activeWorkspaceTab === 'applications') {
      content.innerHTML = `
        <div id="sub-app-list" style="margin-bottom: 24px;"></div>
        <div id="sub-app-queue" style="margin-bottom: 24px;"></div>
        <div id="sub-app-scores" style="margin-bottom: 24px;"></div>
        <div id="sub-app-reports"></div>
      `;
      renderApplicationsTab(content.querySelector('#sub-app-list'), editionId);
      renderQuestionQueueTab(content.querySelector('#sub-app-queue'), editionId);
      renderScoresTab(content.querySelector('#sub-app-scores'), editionId);
      renderReportsTab(content.querySelector('#sub-app-reports'), editionId);
    } else if (_activeWorkspaceTab === 'schema' && isSuperAdmin()) {
      content.innerHTML = `
        <div id="sub-schema-builder" style="margin-bottom: 24px;"></div>
        <div id="sub-schema-mappings"></div>
      `;
      renderSchemaBuilderTab(content.querySelector('#sub-schema-builder'), editionId);
      renderMappingsTab(content.querySelector('#sub-schema-mappings'), editionId);
    }
  }, 50);
}

// ═══════════════════════════════════════════════════════════════
// TAB 1: APPLICATIONS
// ═══════════════════════════════════════════════════════════════
export function renderApplicationsTab(container, editionId) {
  const edition = Store.getEditionById(editionId);
  let currentPage = 1, currentFilters = {};

  const render = () => {
    const result = Store.getApplications({ editionId, ...currentFilters, page: currentPage, pageSize: 25 });
    const rows = result.items.map(app => {
      const user = Store.getUserById(app.userId);
      const score = Store.calculateApplicationScore(app.id);
      const answers = Store.getAnswersByApplication(app.id);
      const submittedQs = answers.filter(a => a.questionStatus === 'Submitted').length;
      const ra = (Store.getReformAreas(editionId) || []).find(r => app.reformAreaStatuses?.[r.id] === 'Submitted')?.name || '—';
      const catName = (edition?.categories || []).find(c => c.id === app.category)?.shortName || app.category || '—';
      const date = app.submittedAt ? new Date(app.submittedAt).toLocaleDateString('en-IN') : new Date(app.updatedAt).toLocaleDateString('en-IN');
      return `
        <tr class="table-row-clickable" data-app-id="${app.id}">
          <td><span class="app-id-chip">${app.id.substring(0, 16)}…</span></td>
          <td>
            <div class="cell-user">
              <div class="cell-avatar">${(user?.name || '?')[0]}</div>
              <div><strong>${user?.name || 'Unknown'}</strong><br><small>${user?.organization || ''}</small></div>
            </div>
          </td>
          <td><span class="cell-muted">${ra}</span></td>
          <td>${catName}</td>
          <td><span class="score-chip">${score}</span></td>
          <td><span class="status-badge status-${app.status.toLowerCase().replace(/\s+/g, '-')}">${app.status}</span></td>
          <td><small>${date}</small></td>
          <td>
            <div class="row-actions">
              <button class="btn btn-xs btn-outline btn-view-app" data-id="${app.id}" title="View Application">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
              ${app.status !== 'Approved' ? `<button class="btn btn-xs btn-success-solid btn-approve-app" data-id="${app.id}" data-uid="${app.userId}" title="Approve">✓</button>` : ''}
              ${app.status !== 'Rejected' ? `<button class="btn btn-xs btn-danger btn-reject-app" data-id="${app.id}" data-uid="${app.userId}" title="Reject">✕</button>` : ''}
              <button class="btn btn-xs btn-outline btn-delete-app" data-id="${app.id}" title="Delete">🗑</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    const stats = Store.getEditionStats(editionId);
    const kpi = (label, val, color, valKey) => `
      <div class="stat-card" style="cursor:pointer;" onclick="const select = document.querySelector('#app-filter-status'); if(select) { select.value='${valKey}'; select.dispatchEvent(new Event('change')); }">
        <div class="stat-info">
          <h3 style="color:${color}">${val}</h3>
          <p style="font-size:13px;color:var(--text-muted)">${label}</p>
        </div>
      </div>
    `;

    container.innerHTML = `
      <div class="stats-grid" style="margin-bottom:24px;">
        ${kpi('Total Applications', stats.total, '#4f46e5', '')}
        ${kpi('Pending Review', stats.submitted + stats.underReview, '#d97706', 'Submitted')}
        ${kpi('Approved', stats.approved, '#10b981', 'Approved')}
        ${kpi('Rejected', stats.rejected, '#ef4444', 'Rejected')}
        ${kpi('Additional Docs', stats.additionalDocs, '#0284c7', 'Additional Documents Requested')}
      </div>

      <div class="card glass-card">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
          <h2 style="display:flex;align-items:center;gap:8px;">Applications <span class="count-chip" style="background:var(--primary-glow);color:var(--primary);border-radius:12px;padding:2px 8px;font-size:12px;font-weight:700;">${result.total}</span></h2>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
            <input type="text" id="app-search" placeholder="Search applicant / ID..." class="search-input-sm" style="min-width:200px;">
            <select id="app-filter-status" class="form-select-sm">
              <option value="">All Statuses</option>
              <option value="Submitted">Submitted</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="Additional Documents Requested">Docs Requested</option>
            </select>
            <select id="app-filter-cat" class="form-select-sm">
              <option value="">All Categories</option>
              ${(edition?.categories || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
            </select>
          </div>
        </div>
        ${result.items.length === 0 ? `
          <div class="empty-state" style="padding:60px 20px; text-align:center;">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border-color)" stroke-width="1.5" style="margin:0 auto 16px;">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
            <h3 style="font-size:16px; margin-bottom:4px;">No applications found</h3>
            <p style="font-size:14px; color:var(--text-muted); margin:0;">No applications match the current filters.</p>
          </div>
        ` : `
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Application ID</th><th>Applicant</th><th>Reform Area</th>
                  <th>Category</th><th>Score</th><th>Status</th><th>Date</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          ${_paginationHtml(result)}
        `}
      </div>
    `;

    let searchTimer;
    container.querySelector('#app-search')?.addEventListener('input', e => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { currentFilters.search = e.target.value; currentPage = 1; render(); }, 300);
    });
    container.querySelector('#app-filter-status')?.addEventListener('change', e => { currentFilters.status = e.target.value; currentPage = 1; render(); });
    container.querySelector('#app-filter-cat')?.addEventListener('change', e => { currentFilters.category = e.target.value; currentPage = 1; render(); });

    container.querySelectorAll('.btn-view-app').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); renderApplicationDetailView(container, btn.dataset.id, editionId); });
    });
    container.querySelectorAll('.table-row-clickable').forEach(row => {
      row.addEventListener('click', () => renderApplicationDetailView(container, row.dataset.appId, editionId));
    });
    container.querySelectorAll('.btn-approve-app').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const app = Store.getApplicationById(btn.dataset.id);
        showPrompt({
          title: 'Approve Application',
          message: `Enter comments / remarks to approve application <strong>${app.id}</strong> (optional):`,
          placeholder: 'Approved by admin',
          confirmText: 'Approve',
          onConfirm: (remarks) => {
            const comments = remarks || 'Approved by admin';
            Store.approveApplication(app.id, getCurrentUser().id, comments);
            Store.addNotification(btn.dataset.uid, NOTIFICATION_EVENTS.APPLICATION_APPROVED, `Your application ${app.id} has been approved!`, app.id);
            showToast('Application Approved!', 'success'); render();
          }
        });
      });
    });
    container.querySelectorAll('.btn-reject-app').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const app = Store.getApplicationById(btn.dataset.id);
        showPrompt({
          title: 'Reject Application', message: 'Enter rejection reason:', placeholder: 'e.g. Incomplete documentation…', confirmText: 'Reject',
          onConfirm: reason => {
            Store.rejectApplication(app.id, getCurrentUser().id, reason || 'No reason provided');
            Store.addNotification(btn.dataset.uid, NOTIFICATION_EVENTS.APPLICATION_REJECTED, `Your application ${app.id} was rejected. Reason: ${reason}`, app.id);
            Store.addAuditLog(getCurrentUser().id, `Rejected application: ${reason}`, 'application', app.id);
            showToast('Application Rejected.', 'info'); render();
          }
        });
      });
    });
    container.querySelectorAll('.btn-delete-app').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        showConfirm({
          title: 'Delete Application', message: 'Permanently delete this application?', type: 'danger', confirmText: 'Delete',
          onConfirm: () => { Store.deleteApplication(btn.dataset.id); showToast('Deleted.', 'success'); render(); }
        });
      });
    });
    container.querySelectorAll('.pagination-btn').forEach(btn => {
      btn.addEventListener('click', () => { currentPage = parseInt(btn.dataset.page); render(); });
    });
  };

  render();
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

// ─── Application Detail View ──────────────────────────────────
function renderApplicationDetailView(container, appId, editionId) {
  window.workspaceLock = true;
  let app = Store.getApplicationById(appId);
  if (!app) return;
  const currentUser = getCurrentUser();
  if (currentUser && currentUser.role === 'user' && app.userId !== currentUser.id) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>Access Denied</h3>
        <p>You are not authorized to view this application.</p>
      </div>
    `;
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
  const edition = Store.getEditionById(editionId);
  const reformAreas = Store.getReformAreas(editionId);
  const answers = Store.getAnswersByApplication(appId);
  const answersMap = {};
  answers.forEach(a => { answersMap[a.fieldId] = a; });
  const score = Store.calculateApplicationScore(appId);

  const userAssignments = Store.getAssignments ? Store.getAssignments(app.userId) : [];
  const hasEdAssignments = userAssignments.some(a => a.editionId === editionId);

  const reformAreaSections = reformAreas.map(ra => {
    let fields = Store.getFieldsByReformArea(ra.id);
    const validFields = fields.filter(f => !f.isLayoutElement && answersMap[f.id] && !['Draft', 'Not Started'].includes(answersMap[f.id].questionStatus));
    if (validFields.length === 0) return ''; // Hide reform area entirely if no submitted questions

    const questionRows = validFields.map(field => {
      const ans = answersMap[field.id];
      const qStatus = ans?.questionStatus || 'Not Submitted';
      const qScore = ans?.questionScore || 0;
      const docsHtml = (ans?.files || []).map(file => `
        <div class="doc-review-row">
          <div class="doc-info-cell">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span>${file.name}</span>
            <span class="doc-status-tag doc-${file.fileStatus?.toLowerCase() || 'pending'}">${file.fileStatus || 'Pending'}</span>
          </div>
          <div class="doc-actions">
            <button class="btn btn-xs btn-outline btn-view-doc-file" 
              data-app="${appId}" data-field="${field.id}" data-doc="${file.docId || file.name}">View</button>
            <button class="btn btn-xs btn-outline btn-download-doc-file" 
              data-app="${appId}" data-field="${field.id}" data-doc="${file.docId || file.name}">Download</button>
            ${file.fileStatus !== 'Approved' && file.fileStatus !== 'Rejected' ? `
              <button class="btn btn-xs btn-success-solid btn-approve-doc" 
                data-app="${appId}" data-field="${field.id}" data-doc="${file.docId || file.name}" data-uid="${app.userId}">✓ Approve</button>
              <button class="btn btn-xs btn-danger btn-reject-doc"
                data-app="${appId}" data-field="${field.id}" data-doc="${file.docId || file.name}" data-uid="${app.userId}">✕ Reject</button>
            ` : ''}
          </div>
        </div>
        ${file.fileStatus === DOC_STATUS.REJECTED ? `<div class="doc-rejection-reason">⚠ Reason: ${file.fileRejectionReason}</div>` : ''}
      `).join('');

      return `
        <div class="question-review-card">
          <div class="qr-header">
            <span class="qr-label">${field.label || field.text}</span>
            <span class="qr-status status-${qStatus.toLowerCase()}">${qStatus}</span>
            <span class="qr-score">Score: ${qScore} / ${field.maxScore || field.weight || 1}</span>
          </div>
          <div class="qr-answer">${_renderAnswerPreview(field, ans?.value)}</div>
          ${docsHtml ? `<div class="qr-docs">${docsHtml}</div>` : ''}
          ${ans?.adminRemarks ? `<div class="qr-remarks"><strong>Admin Note:</strong> ${ans.adminRemarks}</div>` : ''}
          ${['Submitted', 'Resubmitted'].includes(ans?.questionStatus) ? `
            <div class="qr-admin-actions">
              <button class="btn btn-sm btn-success-solid btn-approve-q" data-app="${appId}" data-field="${field.id}" data-uid="${app.userId}">✓ Approve Question</button>
              <button class="btn btn-sm btn-danger btn-reject-q" data-app="${appId}" data-field="${field.id}" data-uid="${app.userId}">✕ Reject Question</button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
    return `
      <div class="ra-review-section">
        <div class="ra-review-header" style="border-left: 4px solid ${ra.color || '#4f46e5'};">
          <h3>${ra.name}</h3>
          <span>${fields.filter(f => !f.isLayoutElement).length} questions</span>
        </div>
        ${questionRows || '<p style="color:var(--text-muted);padding:12px;">No questions in this reform area.</p>'}
      </div>
    `;
  }).join('');

  const timeline = (app.timeline || []).slice().reverse().slice(0, 10).map(t => `
    <div class="timeline-entry">
      <div class="tl-dot"></div>
      <div class="tl-body">
        <p>${t.action}</p>
        <small>${new Date(t.timestamp).toLocaleString('en-IN')}</small>
      </div>
    </div>
  `).join('');

  container.innerHTML = `
    <div style="margin-bottom:20px;">
      <button class="btn btn-secondary btn-sm" id="back-to-apps">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Applications
      </button>
    </div>

    <div class="app-detail-hero">
      <div>
        <div class="page-eyebrow">Application Review</div>
        <h1>${app.id}</h1>
        <p style="color:var(--text-muted)">${edition?.name} · ${(edition?.categories || []).find(c => c.id === app.category)?.name || app.category}</p>
      </div>
      <div class="app-detail-actions">
        <span class="status-badge-lg status-${app.status.toLowerCase().replace(/\s+/g, '-')}">${app.status}</span>
        ${app.status !== 'Approved' ? `<button class="btn btn-success-solid" id="btn-detail-approve">✓ Approve</button>` : ''}
        ${app.status !== 'Rejected' ? `<button class="btn btn-danger" id="btn-detail-reject">✕ Reject</button>` : ''}
      </div>
    </div>

    ${app.rejectionReason ? `<div class="alert-box alert-danger" style="margin-bottom:20px;"><strong>Rejection Reason:</strong> ${app.rejectionReason}</div>` : ''}

    <div class="detail-grid">
      <div class="detail-main">
        <div class="kpi-row" style="margin-bottom:24px;">
          <div class="kpi-card"><div class="kpi-value" style="color:#4f46e5">${score}</div><div class="kpi-label">Total Score</div></div>
          <div class="kpi-card"><div class="kpi-value" style="color:#10b981">${answers.filter(a => a.questionStatus === QUESTION_STATUS.APPROVED).length}</div><div class="kpi-label">Approved Qs</div></div>
          <div class="kpi-card"><div class="kpi-value" style="color:#d97706">${answers.filter(a => a.questionStatus === QUESTION_STATUS.SUBMITTED).length}</div><div class="kpi-label">Pending Review</div></div>
          <div class="kpi-card"><div class="kpi-value" style="color:#ef4444">${answers.filter(a => a.questionStatus === QUESTION_STATUS.REJECTED).length}</div><div class="kpi-label">Rejected Qs</div></div>
        </div>

        <div class="card-section">
          <div class="card-section-header"><h2>Answers & Documents</h2></div>
          <div class="card-section-body">${reformAreaSections || '<div class="empty-state"><p>No answers submitted yet.</p></div>'}</div>
        </div>
      </div>

      <div class="detail-sidebar">
        <div class="card-section" style="margin-bottom:20px;">
          <div class="card-section-header"><h2>Applicant</h2></div>
          <div class="card-section-body">
            <table class="profile-table">
              <tr><td>Name</td><td><strong>${user?.name || '—'}</strong></td></tr>
              <tr><td>Organization</td><td>${user?.organization || '—'}</td></tr>
              <tr><td>Email</td><td><code style="font-size:11px">${user?.email || '—'}</code></td></tr>
              <tr><td>State</td><td>${user?.state || '—'}</td></tr>
              <tr><td>Sector</td><td>${user?.sector || '—'}</td></tr>
            </table>
          </div>
        </div>
        <div class="card-section">
          <div class="card-section-header"><h2>Timeline</h2></div>
          <div class="card-section-body"><div class="timeline-list">${timeline || '<p style="color:var(--text-muted)">No history yet.</p>'}</div></div>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#back-to-apps')?.addEventListener('click', () => {
    window.workspaceLock = false;
    renderApplicationsTab(container, editionId);
  });

  container.querySelector('#btn-detail-approve')?.addEventListener('click', () => {
    showPrompt({
      title: 'Approve Application',
      message: `Enter comments / remarks to approve <strong>${app.id}</strong> (optional):`,
      placeholder: 'Approved by admin',
      confirmText: 'Approve',
      onConfirm: (remarks) => {
        const comments = remarks || 'Approved by admin';
        Store.approveApplication(app.id, getCurrentUser().id, comments);
        Store.addNotification(app.userId, NOTIFICATION_EVENTS.APPLICATION_APPROVED, `Your application ${app.id} has been approved!`, app.id);
        showAlert({
          title: '✓ Application Approved!', message: `Application ${app.id} is now approved.`, type: 'success',
          onClose: () => renderApplicationDetailView(container, appId, editionId)
        });
      }
    });
  });

  container.querySelector('#btn-detail-reject')?.addEventListener('click', () => {
    showPrompt({
      title: 'Reject Application', message: 'Enter rejection reason:', placeholder: 'e.g. Incomplete documentation…', confirmText: 'Reject',
      onConfirm: reason => {
        Store.rejectApplication(app.id, getCurrentUser().id, reason || 'No reason');
        Store.addNotification(app.userId, NOTIFICATION_EVENTS.APPLICATION_REJECTED, `Your application ${app.id} was rejected. Reason: ${reason}`, app.id);
        Store.addAuditLog(getCurrentUser().id, `Rejected: ${reason}`, 'application', app.id);
        showToast('Application rejected.', 'info');
        renderApplicationDetailView(container, appId, editionId);
      }
    });
  });

  container.querySelectorAll('.btn-approve-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const field = Store.getFieldById(btn.dataset.field);
      showPrompt({
        title: 'Approve Question', message: `Enter score for this question (max: ${field?.maxScore || 1}):`, placeholder: `0 – ${field?.maxScore || 1}`, confirmText: 'Approve',
        onConfirm: scoreStr => {
          const sc = parseFloat(scoreStr) || (field?.maxScore || field?.weight || 1);
          Store.approveQuestion(btn.dataset.app, btn.dataset.field, getCurrentUser().id, sc);
          Store.addNotification(btn.dataset.uid, NOTIFICATION_EVENTS.QUESTION_APPROVED, `A question in your application was approved. Score: ${sc}`, btn.dataset.app);
          Store.addAuditLog(getCurrentUser().id, `Approved question: ${field?.label}`, 'question', btn.dataset.app);
          showToast('Question approved!', 'success');
          renderApplicationDetailView(container, appId, editionId);
        }
      });
    });
  });

  container.querySelectorAll('.btn-reject-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const field = Store.getFieldById(btn.dataset.field);
      showPrompt({
        title: 'Reject Question', message: 'Enter rejection reason:', placeholder: 'e.g. Answer is incomplete…', confirmText: 'Reject',
        onConfirm: reason => {
          Store.rejectQuestion(btn.dataset.app, btn.dataset.field, getCurrentUser().id, reason || 'No reason');
          Store.addNotification(btn.dataset.uid, NOTIFICATION_EVENTS.QUESTION_REJECTED, `A question was rejected: ${reason}`, btn.dataset.app);
          Store.addAuditLog(getCurrentUser().id, `Rejected question: ${field?.label} — ${reason}`, 'question', btn.dataset.app);
          showToast('Question rejected.', 'info');
          renderApplicationDetailView(container, appId, editionId);
        }
      });
    });
  });

  container.querySelectorAll('.btn-approve-doc').forEach(btn => {
    btn.addEventListener('click', () => {
      Store.approveDocument(btn.dataset.app, btn.dataset.field, btn.dataset.doc, getCurrentUser().id);
      Store.addNotification(btn.dataset.uid, NOTIFICATION_EVENTS.DOCUMENT_APPROVED, 'A document in your application was approved.', btn.dataset.app);
      showToast('Document approved!', 'success');
      renderApplicationDetailView(container, appId, editionId);
    });
  });

  container.querySelectorAll('.btn-reject-doc').forEach(btn => {
    btn.addEventListener('click', () => {
      showPrompt({
        title: 'Reject Document', message: 'Enter rejection reason:', placeholder: 'e.g. Document is blurred, wrong document…', confirmText: 'Reject Document',
        onConfirm: reason => {
          const r = reason || 'Invalid document';
          Store.rejectDocument(btn.dataset.app, btn.dataset.field, btn.dataset.doc, getCurrentUser().id, r);
          Store.requestAdditionalDocs(btn.dataset.app, getCurrentUser().id, r);
          Store.addNotification(btn.dataset.uid, NOTIFICATION_EVENTS.DOCUMENT_REJECTED, `Document rejected: ${r}`, btn.dataset.app);
          showToast('Document rejected — application status updated and user notified.', 'info');
          renderApplicationDetailView(container, appId, editionId);
        }
      });
    });
  });
  container.querySelectorAll('.btn-view-doc-file').forEach(btn => {
    btn.addEventListener('click', async () => {
      const aId = btn.dataset.app;
      const fId = btn.dataset.field;
      const dId = btn.dataset.doc;
      const ans = Store.getAnswerByField(aId, fId);
      let file = ans?.files?.find(f => (f.docId || f.name) === dId);

      if (file && !file.dataUrl && !file.fileUrl) {
        try {
          btn.textContent = '⏳ Loading...';
          btn.disabled = true;
          const res = await fetch(`/api/files/${aId}/${fId}`);
          if (res.ok) {
            const data = await res.json();
            const serverFiles = data.files || [];
            file = serverFiles.find(f => (f.docId || f.name) === dId);
          }
        } catch (e) {
          console.error('[View] Failed to fetch file from server:', e);
        } finally {
          btn.textContent = 'View';
          btn.disabled = false;
        }
      }

      const url = file?.dataUrl || file?.fileUrl;
      if (file && url) {
        const objectUrl = dataURLtoObjectURL(url);
        showFileViewer({ title: file.name, dataUrl: objectUrl, fileName: file.name });
      } else {
        showToast('Document not found or has no content.', 'error');
      }
    });
  });

  container.querySelectorAll('.btn-download-doc-file').forEach(btn => {
    btn.addEventListener('click', async () => {
      const aId = btn.dataset.app;
      const fId = btn.dataset.field;
      const dId = btn.dataset.doc;
      const ans = Store.getAnswerByField(aId, fId);
      let file = ans?.files?.find(f => (f.docId || f.name) === dId);

      if (file && !file.dataUrl && !file.fileUrl) {
        try {
          btn.textContent = '⏳ Loading...';
          btn.disabled = true;
          const res = await fetch(`/api/files/${aId}/${fId}`);
          if (res.ok) {
            const data = await res.json();
            const serverFiles = data.files || [];
            file = serverFiles.find(f => (f.docId || f.name) === dId);
          }
        } catch (e) {
          console.error('[Download] Failed to fetch file from server:', e);
        } finally {
          btn.textContent = 'Download';
          btn.disabled = false;
        }
      }

      const url = file?.dataUrl || file?.fileUrl;
      if (file && url) {
        const objectUrl = dataURLtoObjectURL(url);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        showToast('Document not found or has no content.', 'error');
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// TAB 2: REFORM AREAS
// ═══════════════════════════════════════════════════════════════
function renderReformAreasTab(container, editionId) {
  const reformAreas = Store.getReformAreas(editionId);
  const rows = reformAreas.map((ra, idx) => {
    const fields = Store.getFieldsByReformArea(ra.id).filter(f => !f.isLayoutElement);
    return `
      <div class="ra-card" style="border-left: 4px solid ${ra.color};">
        <div class="ra-card-header">
          <div class="ra-color-dot" style="background:${ra.color}"></div>
          <div class="ra-info">
            <h3>${ra.name}</h3>
            <p>${ra.description || 'No description'}</p>
          </div>
          <div class="ra-meta">
            <span class="count-chip">${fields.length} Questions</span>
            <span class="count-chip">${ra.marks || 10} Marks</span>
          </div>
          <div class="ra-actions">
            <button class="btn btn-xs btn-outline btn-edit-ra" data-id="${ra.id}">Edit</button>
            <button class="btn btn-xs btn-danger btn-delete-ra" data-id="${ra.id}" data-name="${ra.name}">Delete</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="tab-section">
      <div class="tab-section-header">
        <h2>Reform Areas <span class="count-chip">${reformAreas.length}</span></h2>
        <button class="btn btn-primary" id="btn-add-ra">+ Add Reform Area</button>
      </div>
      ${reformAreas.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">📂</div>
          <h3>No Reform Areas Yet</h3>
          <p>Add reform areas to organize questions in this edition.</p>
          <button class="btn btn-primary" id="btn-add-ra-empty">+ Add First Reform Area</button>
        </div>
      ` : `<div class="ra-list">${rows}</div>`}
    </div>
  `;

  const openAddRA = () => _openReformAreaModal(editionId, null, container);
  container.querySelector('#btn-add-ra')?.addEventListener('click', openAddRA);
  container.querySelector('#btn-add-ra-empty')?.addEventListener('click', openAddRA);

  container.querySelectorAll('.btn-edit-ra').forEach(btn => {
    btn.addEventListener('click', () => _openReformAreaModal(editionId, btn.dataset.id, container));
  });

  container.querySelectorAll('.btn-delete-ra').forEach(btn => {
    btn.addEventListener('click', () => {
      showConfirm({
        title: 'Delete Reform Area', message: `Delete <strong>${btn.dataset.name}</strong> and all its questions?`, type: 'danger', confirmText: 'Delete',
        onConfirm: () => {
          Store.deleteReformArea(btn.dataset.id);
          Store.addAuditLog(getCurrentUser().id, `Deleted reform area: ${btn.dataset.name}`, 'reformArea', btn.dataset.id);
          showToast('Reform Area deleted.', 'success');
          renderReformAreasTab(container, editionId);
        }
      });
    });
  });
}

function _openReformAreaModal(editionId, editId, parentContainer) {
  const existing = editId ? Store.getReformAreaById(editId) : null;
  const colors = ['#4f46e5', '#0284c7', '#7e22ce', '#10b981', '#d97706', '#ef4444', '#0891b2', '#db2777'];
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop-custom visible';
  backdrop.innerHTML = `
    <div class="modal-card-custom animate-modal-in" style="max-width:520px;text-align:left;">
      <h3 class="modal-title-custom" style="text-align:left;margin-bottom:20px;">${existing ? 'Edit' : 'Add'} Reform Area</h3>
      <div class="form-group" style="margin-bottom:12px;">
        <label>Reform Area Name *</label>
        <input type="text" id="ra-name" class="form-input" value="${existing?.name || ''}" placeholder="e.g. Reform Area A">
      </div>
      <div class="form-group" style="margin-bottom:12px;">
        <label>Description</label>
        <textarea id="ra-desc" class="form-input" rows="2" style="resize:vertical">${existing?.description || ''}</textarea>
      </div>
      <div class="form-group-row" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
        <div class="form-group">
          <label>Marks</label>
          <input type="number" id="ra-marks" class="form-input" value="${existing?.marks || 10}" min="1">
        </div>
        <div class="form-group">
          <label>Color</label>
          <select id="ra-color" class="form-input form-select">
            ${colors.map(c => `<option value="${c}" ${existing?.color === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button id="cancel-ra" class="btn btn-secondary">Cancel</button>
        <button id="submit-ra" class="btn btn-primary">${existing ? 'Save Changes' : 'Add Reform Area'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector('#cancel-ra').addEventListener('click', () => backdrop.remove());
  backdrop.querySelector('#submit-ra').addEventListener('click', () => {
    const name = backdrop.querySelector('#ra-name').value.trim();
    if (!name) { showToast('Name is required.', 'error'); return; }
    const data = { name, description: backdrop.querySelector('#ra-desc').value.trim(), marks: parseInt(backdrop.querySelector('#ra-marks').value) || 10, color: backdrop.querySelector('#ra-color').value };
    if (existing) {
      Store.updateReformArea(editId, data);
      Store.addAuditLog(getCurrentUser().id, `Updated reform area: ${name}`, 'reformArea', editId);
    } else {
      const ra = Store.createReformArea(editionId, data);
      Store.addAuditLog(getCurrentUser().id, `Created reform area: ${name}`, 'reformArea', ra.id);
    }
    Store.saveSchemaVersion(editionId, getCurrentUser().id, `${existing ? 'Updated' : 'Added'} reform area: ${name}`);
    showToast(`Reform Area ${existing ? 'updated' : 'created'}!`, 'success');
    backdrop.remove();
    renderSchemaBuilderTab(container, editionId); // Using the new function
  });
}

// ═══════════════════════════════════════════════════════════════
// TAB 3: SCHEMA BUILDER
// ═══════════════════════════════════════════════════════════════
function renderSchemaBuilderTab(container, editionId) {
  const reformAreas = Store.getReformAreas(editionId);
  if (!_activeReformAreaId || !reformAreas.find(r => r.id === _activeReformAreaId)) {
    _activeReformAreaId = reformAreas[0]?.id || null;
  }

  // --- LEFT COLUMN: Reform Areas ---
  const leftNav = reformAreas.map((ra, idx) => `
    <div class="ra-card schema-nav-item ${ra.id === _activeReformAreaId ? 'active' : ''}" draggable="true" data-raid="${ra.id}" style="background:var(--bg-card); cursor:pointer; margin-bottom:12px; border-radius:8px; border:1px solid ${ra.id === _activeReformAreaId ? 'var(--primary)' : 'var(--border-color)'}; padding:12px; display:flex; justify-content:space-between; align-items:center; transition:all 0.2s;">
      <div style="display:flex; flex-direction:column; overflow:hidden;">
        <span style="font-size:11px; color:var(--primary); font-weight:600; margin-bottom:2px;">Reform Area ${idx + 1}</span>
        <strong style="font-size:13px; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${ra.name}</strong>
      </div>
      <div style="display:flex; gap:6px; margin-left:8px;">
        <button class="btn btn-xs btn-outline btn-edit-ra" data-id="${ra.id}" style="padding:4px; border-radius:4px; border-color:var(--border-color); color:var(--text-muted);"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></button>
        <button class="btn btn-xs btn-outline btn-delete-ra" data-id="${ra.id}" data-name="${ra.name}" style="padding:4px; border-radius:4px; border-color:var(--border-color); color:#ef4444;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>
    </div>
  `).join('');

  // --- MIDDLE COLUMN: Action Point Groups & Questions ---
  const allFields = _activeReformAreaId ? Store.getFieldsByReformArea(_activeReformAreaId) : [];
  
  // Build Virtual Hierarchy without saving to store (unless edited)
  const apGroupsMap = {}; // { apId: { id, title, questions: { qId: { id, title, maxScore, ... } } } }
  
  allFields.forEach(f => {
    // Determine Virtual Action Point Group
    const apId = f.actionPointId || 'ap_legacy_' + f.id;
    const apTitle = f.actionPointTitle || 'Default Action Point Group';
    
    // Determine Virtual Question
    const qId = f.questionId || 'q_legacy_' + f.id; // Map legacy field to a virtual Question
    
    if (!apGroupsMap[apId]) {
      apGroupsMap[apId] = {
        id: apId,
        title: apTitle,
        questions: {},
        isLegacy: !f.actionPointId
      };
    }
    
    if (!apGroupsMap[apId].questions[qId]) {
      apGroupsMap[apId].questions[qId] = {
        id: qId,
        title: f.label || 'Question', // Fallback title
        description: f.description || f.content || '',
        helpText: f.helpText || '',
        maxScore: f.maxScore || 1,
        weight: f.weight || 1,
        guidelinePage: f.guidelinePage || '',
        scoringCriteria: f.scoringCriteria || '',
        validationRules: f.validationRules || '',
        mandatory: f.mandatory || false,
        required: f.required || false,
        apId: apId // Keep reference to parent
      };
    }
  });

  const apGroups = Object.values(apGroupsMap);

  // Auto-select first question if none active
  if (apGroups.length > 0 && !_activeQuestionId) {
    const firstGroup = apGroups[0];
    const qs = Object.values(firstGroup.questions);
    if (qs.length > 0) {
      _activeQuestionId = qs[0].id;
      _expandedApGroups.add(firstGroup.id);
    }
  }

  let activeQuestion = null;

  const centerNav = apGroups.map(ap => {
    const isExpanded = _expandedApGroups.has(ap.id);
    const questions = Object.values(ap.questions);
    
    // Find if activeQuestion is in this group
    questions.forEach(q => {
      if (q.id === _activeQuestionId) activeQuestion = q;
    });

    return `
      <div class="ap-group" style="margin-bottom:16px; background:var(--bg-card); border:1px solid var(--border-color); border-radius:8px; overflow:hidden;">
        <div class="ap-group-header" data-apid="${ap.id}" style="padding:12px 16px; background:var(--bg-card); cursor:pointer; display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:13px; font-weight:700; color:var(--text-main);">${ap.title}</span>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-xs btn-outline" style="padding:4px; border-radius:4px; border-color:var(--border-color); color:var(--text-muted); transition:transform 0.2s; transform:${isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></button>
            <button class="btn btn-xs btn-outline btn-delete-ap-group" data-apid="${ap.id}" style="padding:4px; border-radius:4px; border-color:var(--border-color); color:#ef4444;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
          </div>
        </div>
        
        ${isExpanded ? `
          <div class="ap-group-body" style="padding:0 16px 16px;">
            ${questions.length === 0 ? '<div style="font-size:11px; color:var(--text-muted); text-align:center; padding:8px;">No questions.</div>' : ''}
            ${questions.map(q => {
              const isActive = q.id === _activeQuestionId;
              return `
                <div class="q-item ${isActive ? 'active' : ''}" data-qid="${q.id}" data-apid="${ap.id}" style="padding:10px 12px; margin-bottom:8px; border-radius:6px; cursor:pointer; background:${isActive ? 'var(--primary-glow)' : '#f8fafc'}; border:1px solid ${isActive ? 'var(--primary)' : 'var(--border-color)'}; display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-size:12px; font-weight:500; color:${isActive ? 'var(--primary)' : 'var(--text-main)'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding-right:12px;">${q.title}</span>
                  <span style="font-size:11px; color:var(--primary); font-weight:700;">[${q.maxScore || 1}M]</span>
                </div>
              `;
            }).join('')}
            <div style="text-align:right; margin-top:8px;">
              <button class="btn btn-xs btn-add-q" data-apid="${ap.id}" style="background:transparent; border:none; color:var(--primary); font-size:11px; font-weight:600; padding:4px 8px; cursor:pointer;">+ Add Question</button>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  // --- RIGHT COLUMN: Toolbox & Editor ---
  // Create a single grid for all toolbox elements
  const toolboxHtml = `
    <div class="toolbox-buttons" style="display:grid; grid-template-columns:1fr 1fr; gap:4px;">
      ${TOOLBOX_ELEMENTS.map(el => `
        <div class="toolbox-item" draggable="true" data-type="${el.id}" title="Drag to canvas or click to add" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:4px; padding:6px 10px; font-size:11px; font-weight:500; text-align:left; color:#1e293b; cursor:grab; transition:all 0.2s; box-shadow:0 1px 2px rgba(0,0,0,0.01);">
          ${el.label}
        </div>
      `).join('')}
    </div>
  `;

  container.innerHTML = `
    <!-- Top Header Card -->
    <div style="margin-bottom:24px; padding:0 24px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h2 style="margin:0; font-size:20px; font-weight:700; color:var(--text-main);">SRF Platform</h2>
        <div style="display:flex; gap:12px; align-items:center;">
          <button class="btn btn-secondary" id="btn-schema-reset" style="background:var(--bg-card); border-radius:20px; font-size:12px; padding:6px 16px;">Reset to Default</button>
          <button class="btn btn-primary" id="btn-save-schema-version" style="border-radius:20px; font-size:12px; padding:6px 16px;">Save Framework Schema</button>
        </div>
      </div>
    </div>

    <!-- 3-Column Workspace -->
    <div class="schema-builder-layout" style="display:grid; grid-template-columns: 260px 320px 1fr; gap:24px; height:auto; min-height:600px; background:var(--bg-workspace); padding:24px; border-radius:12px;">
      
      <!-- COLUMN 1: Reform Areas -->
      <div class="schema-left-panel" style="display:flex; flex-direction:column;">
        <div class="schema-panel-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h3 style="margin:0; font-size:14px; font-weight:700;">Reform Areas</h3>
          <button class="btn btn-xs btn-primary" id="btn-schema-add-ra" style="border-radius:16px; padding:4px 12px; font-size:11px; font-weight:600;">+ Add Area</button>
        </div>
        <div class="schema-nav-list" id="schema-nav-list" style="overflow-y:auto; flex:1; padding-right:4px;">
          ${leftNav || '<p class="schema-empty-nav" style="text-align:center; padding:20px; color:var(--text-muted);">No reform areas yet.<br>Click + to add.</p>'}
        </div>
      </div>

      <!-- COLUMN 2: Action Point Groups & Questions -->
      <div class="schema-center-panel" style="display:flex; flex-direction:column;">
        <div class="schema-panel-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h3 style="margin:0; font-size:14px; font-weight:700;">Area Rules & Settings</h3>
          <button class="btn btn-xs btn-outline" style="border-radius:16px; padding:4px 12px; font-size:11px; font-weight:600;">Rules/Assignments</button>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h4 style="margin:0; font-size:13px; font-weight:700;">Action Points</h4>
          <button class="btn btn-xs btn-primary" id="btn-add-ap-group" style="background:var(--accent-indigo); border:none; border-radius:16px; padding:4px 12px; font-size:11px; font-weight:600;">+ Add Action Point</button>
        </div>
        <div class="ap-list" style="overflow-y:auto; flex:1; padding-right:4px;">
          ${centerNav || '<p style="text-align:center; padding:20px; color:var(--text-muted); font-size:13px;">No action points yet.<br>Click + to add.</p>'}
        </div>
      </div>

      <!-- COLUMN 3: Question Editor -->
      <div class="schema-right-panel" style="display:flex; flex-direction:column;">
        
        <div style="overflow-y:auto; flex:1; padding-right:4px;">
          ${!activeQuestion ? '<div style="text-align:center; padding:40px; color:var(--text-muted); background:var(--bg-card); border-radius:8px;">Select or add a Question to edit details.</div>' : `
            
            <div style="display:flex; gap:20px; margin-bottom:16px;">
              <div style="flex:1;">
                <label class="form-label" style="font-size:11px; font-weight:600; color:var(--text-main); margin-bottom:4px;">Mandatory Guidelines Page Reference</label>
                <input type="text" class="form-input cfc-q-prop-input" data-qid="${activeQuestion.id}" data-prop="guidelinePage" value="${(activeQuestion.guidelinePage || '').replace(/"/g, '&quot;')}" placeholder="e.g. 1" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:6px; font-size:13px; padding:8px 12px;">
              </div>
              <div style="flex:2;">
                <label class="form-label" style="font-size:11px; font-weight:600; color:var(--text-main); margin-bottom:4px;">Scoring Criteria / Rules Description</label>
                <input type="text" class="form-input cfc-q-prop-input" data-qid="${activeQuestion.id}" data-prop="scoringCriteria" value="${(activeQuestion.scoringCriteria || '').replace(/"/g, '&quot;')}" placeholder="e.g. Absolute Score: 1 for Yes, 0 for No" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:6px; font-size:13px; padding:8px 12px;">
              </div>
            </div>

            <!-- Hidden but functionally preserved fields to ensure no logic breaks -->
            <div style="display:none;">
               <input type="text" class="cfc-q-prop-input" data-qid="${activeQuestion.id}" data-prop="label" value="${(activeQuestion.title || '').replace(/"/g, '&quot;')}">
               <input type="number" class="cfc-q-prop-input" data-qid="${activeQuestion.id}" data-prop="maxScore" value="${activeQuestion.maxScore || 1}">
               <input type="text" class="cfc-q-prop-input" data-qid="${activeQuestion.id}" data-prop="description" value="${(activeQuestion.description || '').replace(/"/g, '&quot;')}">
               <input type="text" class="cfc-q-prop-input" data-qid="${activeQuestion.id}" data-prop="helpText" value="${(activeQuestion.helpText || '').replace(/"/g, '&quot;')}">
               <input type="text" class="cfc-q-prop-input" data-qid="${activeQuestion.id}" data-prop="validationRules" value="${(activeQuestion.validationRules || '').replace(/"/g, '&quot;')}">
            </div>

            <div style="margin-bottom:24px;">
              <h4 style="font-size:13px; color:var(--primary); margin:0 0 4px; display:flex; align-items:center; gap:6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                Dynamic Form Fields Builder
              </h4>
              <p style="font-size:11px; color:var(--text-muted); margin:0 0 12px;">Drag elements from the Toolbox below and drop them here to build a multi-input question dynamically.</p>
              
              <div class="schema-canvas" id="schema-canvas" style="background:var(--bg-card); border:1px solid var(--border-color); padding:16px; border-radius:8px; min-height:120px; box-shadow:0 1px 3px rgba(0,0,0,0.02);">
                ${_renderFormCanvas(editionId, _activeReformAreaId, activeQuestion.id)}
              </div>
              
              <div style="display:flex; gap:12px; margin-top:16px;">
                <button class="btn btn-outline btn-full" style="flex:1; border-radius:8px; border-color:var(--border-color); color:var(--text-main); font-size:12px; font-weight:600;">Duplicate</button>
                <button class="btn btn-full btn-delete-q" data-qid="${activeQuestion.id}" style="flex:1; border-radius:8px; border:1px solid #fca5a5; color:#ef4444; background:transparent; font-size:12px; font-weight:600;">Delete Question</button>
              </div>
            </div>

            <div class="schema-toolbox" id="schema-toolbox" style="background:#f1f5f9; padding:12px; border-radius:8px; margin-top:16px;">
              <h4 style="font-size:12px; font-weight:700; margin:0 0 12px; display:flex; align-items:center; gap:6px; color:#1e293b;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                Form Element Toolbox
              </h4>
              <div class="toolbox-scroll" style="background:transparent; padding:0; border:none;">
                ${toolboxHtml}
              </div>
            </div>
          `}
        </div>
      </div>
    </div>
  `;

  // --- EVENT LISTENERS ---

  // 1. Reform Area Navigation & Editing
  let draggedRaId = null;
  container.querySelectorAll('.schema-nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-edit-ra') || e.target.closest('.btn-delete-ra')) return;
      _activeReformAreaId = item.dataset.raid;
      _activeQuestionId = null;
      renderSchemaBuilderTab(container, editionId);
    });

    item.addEventListener('dragstart', (e) => {
      draggedRaId = item.dataset.raid;
      e.dataTransfer.effectAllowed = 'move';
      item.style.opacity = '0.5';
    });
    item.addEventListener('dragend', () => item.style.opacity = '1');
    item.addEventListener('dragover', (e) => e.preventDefault());
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      const targetRaId = item.dataset.raid;
      if (draggedRaId && draggedRaId !== targetRaId) {
        const orderedIds = [...reformAreas.map(r => r.id)];
        const draggedIdx = orderedIds.indexOf(draggedRaId);
        const targetIdx = orderedIds.indexOf(targetRaId);
        orderedIds.splice(draggedIdx, 1);
        orderedIds.splice(targetIdx, 0, draggedRaId);
        Store.reorderReformAreas(editionId, orderedIds);
        renderSchemaBuilderTab(container, editionId);
        showToast('Reform Areas reordered!', 'success');
      }
    });
  });

  // Add RA
  const openAddRA = () => {
    _openReformAreaModal(editionId, null, container);
    const observer = new MutationObserver(() => {
      if (!document.querySelector('.modal-backdrop-custom')) {
        observer.disconnect();
        renderSchemaBuilderTab(container, editionId);
      }
    });
    observer.observe(document.body, { childList: true });
  };
  container.querySelector('#btn-schema-add-ra')?.addEventListener('click', openAddRA);

  // Edit / Delete RA
  container.querySelectorAll('.btn-edit-ra').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      _openReformAreaModal(editionId, btn.dataset.id, container);
      const observer = new MutationObserver(() => {
        if (!document.querySelector('.modal-backdrop-custom')) {
          observer.disconnect();
          renderSchemaBuilderTab(container, editionId);
        }
      });
      observer.observe(document.body, { childList: true });
    });
  });
  container.querySelectorAll('.btn-delete-ra').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showConfirm({
        title: 'Delete Reform Area', message: `Delete <strong>${btn.dataset.name}</strong>?`, type: 'danger', confirmText: 'Delete',
        onConfirm: () => {
          Store.deleteReformArea(btn.dataset.id);
          renderSchemaBuilderTab(container, editionId);
          showToast('Reform Area deleted.', 'success');
        }
      });
    });
  });

  // 2. Action Point Groups & Questions (Middle Panel)
  
  // Expand/Collapse AP Group
  container.querySelectorAll('.ap-group-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.btn-add-q')) return; // Ignore if clicking Add Question
      const apId = header.dataset.apid;
      if (_expandedApGroups.has(apId)) {
        _expandedApGroups.delete(apId);
      } else {
        _expandedApGroups.add(apId);
      }
      renderSchemaBuilderTab(container, editionId);
    });
  });

  // Select Question
  container.querySelectorAll('.q-item').forEach(item => {
    item.addEventListener('click', () => {
      _activeQuestionId = item.dataset.qid;
      renderSchemaBuilderTab(container, editionId);
    });
  });

  // Add AP Group
  container.querySelector('#btn-add-ap-group')?.addEventListener('click', () => {
    if (!_activeReformAreaId) { showToast('Select a Reform Area first.', 'error'); return; }
    const newApId = 'ap_' + Date.now();
    const title = prompt("Enter Action Point Group name:", "New Action Point");
    if (!title) return;
    
    // We create an initial anchor question for the new group
    const newQId = 'q_' + Date.now();
    Store.createField(editionId, _activeReformAreaId, {
      fieldType: 'text', label: 'New Question', actionPointTitle: title, actionPointId: newApId, questionId: newQId
    });
    _expandedApGroups.add(newApId);
    _activeQuestionId = newQId;
    renderSchemaBuilderTab(container, editionId);
    showToast('Action Point Group added!', 'success');
  });

  // Add Question to Group
  container.querySelectorAll('.btn-add-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const apId = btn.dataset.apid;
      const groupObj = apGroupsMap[apId];
      const newQId = 'q_' + Date.now();
      Store.createField(editionId, _activeReformAreaId, {
        fieldType: 'text', label: 'New Question', actionPointTitle: groupObj.title, actionPointId: apId, questionId: newQId
      });
      _expandedApGroups.add(apId);
      _activeQuestionId = newQId;
      renderSchemaBuilderTab(container, editionId);
      showToast('Question added!', 'success');
    });
  });

  // Delete Question
  container.querySelectorAll('.btn-delete-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const qId = btn.dataset.qid;
      showConfirm({
        title: 'Delete Question', message: 'Delete this question and all its dynamic form fields?', type: 'danger', confirmText: 'Delete',
        onConfirm: () => {
          // Both new fields and legacy virtual fields match:
          const fieldsToDelete = Store.getFieldsByReformArea(_activeReformAreaId).filter(f => f.questionId === qId || (!f.questionId && 'q_legacy_' + f.id === qId));
          fieldsToDelete.forEach(f => Store.deleteField(f.id));
          _activeQuestionId = null;
          renderSchemaBuilderTab(container, editionId);
          showToast('Question deleted!', 'success');
        }
      });
    });
  });

  // Question Master Property Editor Sync
  container.querySelectorAll('.cfc-q-prop-input').forEach(input => {
    input.addEventListener('change', () => {
      const qId = input.dataset.qid;
      const propName = input.dataset.prop;
      let val = input.type === 'checkbox' ? input.checked : input.value;
      if (propName === 'maxScore') val = parseFloat(val) || 1;
      
      const matchingFields = Store.getFieldsByReformArea(_activeReformAreaId).filter(f => f.questionId === qId || (!f.questionId && 'q_legacy_' + f.id === qId));
      matchingFields.forEach(f => {
        // If it was a legacy field, explicitly persist the questionId now that it is modified
        const updateData = { [propName]: val, ...(propName === 'maxScore' ? { weight: val } : {}) };
        if (!f.questionId) updateData.questionId = qId;
        Store.updateField(f.id, updateData);
      });
      renderSchemaBuilderTab(container, editionId);
    });
  });

  // 3. Toolbox & Canvas Event Listeners
  container.querySelectorAll('.toolbox-item').forEach(item => {
    item.addEventListener('click', () => {
      if (!_activeReformAreaId || !_activeQuestionId) { showToast('Select a Question first.', 'error'); return; }
      _addFieldFromToolbox(container, editionId, item.dataset.type, null, _activeQuestionId);
    });

    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'toolbox', type: item.dataset.type }));
      item.classList.add('dragging');
      const canvas = container.querySelector('#canvas-fields-list');
      if (canvas) canvas.classList.add('drag-active');
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      const canvas = container.querySelector('#canvas-fields-list');
      if (canvas) canvas.classList.remove('drag-active');
    });
  });

  container.querySelector('#btn-save-schema-version')?.addEventListener('click', () => {
    // Ensure any legacy virtual IDs are officially persisted during manual save
    const all = Store.getFieldsByEdition(editionId);
    all.forEach(f => {
      let updates = {};
      if (!f.questionId) updates.questionId = 'q_legacy_' + f.id;
      if (!f.actionPointId) {
        updates.actionPointId = 'ap_legacy_' + f.id;
        updates.actionPointTitle = f.actionPointTitle || 'Default Action Point Group';
      }
      if (Object.keys(updates).length > 0) {
        Store.updateField(f.id, updates);
      }
    });
    
    const sv = Store.saveSchemaVersion(editionId, getCurrentUser().id, 'Manual save');
    showToast(`Schema saved!`, 'success');
  });

  container.querySelector('#btn-view-versions')?.addEventListener('click', () => _openVersionHistoryModal(editionId, container));

  container.querySelector('#btn-export-schema')?.addEventListener('click', () => {
    const data = Store.exportSchema(editionId);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `schema_${Store.getEditionById(editionId)?.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    showToast('Schema exported!', 'success');
  });

  _attachCanvasListeners(container, editionId);
}

function _addFieldFromToolbox(container, editionId, fieldType, insertBeforeId = null, questionId = null) {
  const el = TOOLBOX_ELEMENTS.find(e => e.id === fieldType);
  
  // Inherit properties from existing fields in the question so they stay in sync
  const existingFields = Store.getFieldsByReformArea(_activeReformAreaId).filter(f => f.questionId === questionId || (!f.questionId && 'q_legacy_' + f.id === questionId));
  const template = existingFields[0] || {};
  
  // Also, ensure the parent Action Point ID is inherited
  const apId = template.actionPointId || 'ap_legacy_' + (template.id || Date.now());
  
  Store.createField(editionId, _activeReformAreaId, {
    fieldType,
    label: el?.label || fieldType,
    text: el?.label || fieldType,
    required: template.required || false,
    mandatory: template.mandatory || false,
    weight: template.weight || 1, 
    maxScore: template.maxScore || 1,
    actionPointId: apId,
    actionPointTitle: template.actionPointTitle || 'Default Action Point Group',
    questionId: questionId,
    description: template.description || '',
    helpText: template.helpText || '',
    guidelinePage: template.guidelinePage || '',
    scoringCriteria: template.scoringCriteria || '',
    validationRules: template.validationRules || ''
  }, insertBeforeId);
  
  Store.addAuditLog(getCurrentUser().id, `Added ${el?.label} to schema`, 'schema', editionId);
  Store.saveSchemaVersion(editionId, getCurrentUser().id, `Added ${el?.label}`);
  const canvas = container.querySelector('#schema-canvas');
  if (canvas) canvas.innerHTML = _renderFormCanvas(editionId, _activeReformAreaId, _activeQuestionId);
  _attachCanvasListeners(container, editionId);
  showToast(`${el?.label} added!`, 'success');
}

function _renderFormCanvas(editionId, reformAreaId, filterQuestionId = null) {
  const ra = Store.getReformAreaById(reformAreaId);
  if (!ra) return '<div class="canvas-empty"><p>Reform area not found.</p></div>';
  let fields = Store.getFieldsByReformArea(reformAreaId);
  
  if (filterQuestionId) {
    fields = fields.filter(f => f.questionId === filterQuestionId || (!f.questionId && 'q_legacy_' + f.id === filterQuestionId));
  }

  const fieldsHtml = fields.map((field, idx) => {
    const toolEl = TOOLBOX_ELEMENTS.find(e => e.id === field.fieldType);
    const typeColor = toolEl?.color || '#64748b';
    const typeIcon = toolEl?.icon || '?';
    return `
    <div class="canvas-field-card" data-fid="${field.id}" style="background:var(--bg-card); border:1px dashed var(--border-color); border-radius:8px; margin-bottom:12px;">
      <div class="cfc-body" style="padding:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="color:var(--text-muted);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity:0.5"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg></div>
            <span style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">${field.fieldType} SELECTION</span>
          </div>
          <button class="btn btn-delete-field" data-id="${field.id}" style="background:transparent; border:none; padding:4px; color:#ef4444; cursor:pointer;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
        
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; background:#f8fafc; border:1px solid var(--border-color); border-radius:6px; padding:8px 12px;">
          <input type="text" class="cfc-label-input" value="${(field.label || field.text || '').replace(/"/g, '&quot;')}" placeholder="Question text..." data-fid="${field.id}" data-prop="label" style="background:transparent; border:none; outline:none; flex:1; font-size:13px; color:var(--text-main);">
          <label style="font-size:11px; font-weight:600; color:var(--text-main); display:flex; align-items:center; gap:4px; cursor:pointer; margin-left:12px;"><input type="checkbox" class="cfc-q-prop-input-field" data-fid="${field.id}" data-prop="required" ${field.required ? 'checked' : ''}> Required</label>
        </div>
        
        <div class="cfc-preview" style="margin-bottom:12px;">${_renderFieldPreview(field)}</div>
        ${field.isUploadElement ? `
          <div style="display:flex; gap:12px; align-items:center;">
            <label style="font-size:11px; font-weight:600; color:var(--text-muted);">Upload:</label>
            <select class="form-select-sm cfc-upload-req" data-fid="${field.id}" style="border:1px solid var(--border-color); border-radius:4px; font-size:12px; padding:4px 8px;">
              <option value="mandatory" ${field.uploadRequirement === 'mandatory' ? 'selected' : ''}>Mandatory</option>
              <option value="optional" ${field.uploadRequirement === 'optional' ? 'selected' : ''}>Optional</option>
              <option value="none" ${field.uploadRequirement === 'none' ? 'selected' : ''}>Not Required</option>
            </select>
          </div>
        ` : ''}
        ${field.fieldType === 'hyperlink' ? `
          <input class="cfc-url-input form-input" type="url" style="width:100%; font-size:12px; border:1px solid var(--border-color); border-radius:4px; padding:6px 10px;" value="${field.url || ''}" placeholder="https://..." data-fid="${field.id}" data-prop="url">
        ` : ''}
        ${['radio','dropdown','multiselect','checkbox'].includes(field.fieldType) ? `
          <div style="display:flex; flex-direction:column; gap:6px;">
            <label style="font-size:10px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Options (one per line):</label>
            <textarea class="cfc-options-input form-input" rows="3" data-fid="${field.id}" data-prop="options" placeholder="Option 1&#10;Option 2&#10;Option 3" style="border:1px solid var(--border-color); border-radius:6px; font-size:13px; padding:8px 12px; resize:vertical;">${(field.options || []).join('\n')}</textarea>
          </div>
        ` : ''}
      </div>
    </div>
    `;
  }).join('');

  return `
    <div style="padding-left:0px;">
      <div class="canvas-fields" id="canvas-fields-list" style="background:transparent;border:none;padding:0;gap:20px;">
      ${fields.length === 0 ? `
        <div class="canvas-drop-zone">
          <div class="canvas-drop-zone-inner">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <p>Drag elements from the <strong>Toolbox</strong><br>or click them to add here</p>
          </div>
        </div>
      ` : fieldsHtml}
      </div>
    </div>
  `;

}

function _renderFieldPreview(field) {
  switch (field.fieldType) {
    case 'heading': return `<h2 class="preview-heading">${field.label}</h2>`;
    case 'subheading': return `<h3 class="preview-subheading">${field.label}</h3>`;
    case 'description': return `<p class="preview-desc">${field.content || field.label}</p>`;
    case 'instruction': return `<div class="preview-instruction"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>${field.label}</div>`;
    case 'divider': return `<hr class="preview-divider">`;
    case 'warning': return `<div class="preview-warning">⚠ ${field.label}</div>`;
    case 'notes': return `<div class="preview-notes">📝 ${field.label}</div>`;
    case 'banner': return `<div class="preview-banner">${field.label}</div>`;
    case 'hyperlink': return `<a class="preview-hyperlink" href="${field.url || '#'}" target="_blank">🔗 ${field.label}</a>`;
    case 'radio': return `<div class="preview-radio"><label><input type="radio" disabled> Yes</label> <label><input type="radio" disabled> No</label></div>`;
    case 'checkbox': return `<label class="preview-checkbox"><input type="checkbox" disabled> ${field.label}</label>`;
    case 'dropdown': return `<select class="preview-input" disabled><option>Select option…</option></select>`;
    case 'date': return `<input type="date" class="preview-input" disabled>`;
    case 'number': return `<input type="number" class="preview-input" disabled placeholder="0">`;
    case 'email': return `<input type="email" class="preview-input" disabled placeholder="email@example.com">`;
    case 'mobile': return `<input type="tel" class="preview-input" disabled placeholder="+91 00000 00000">`;
    case 'textarea': return `<textarea class="preview-input" rows="2" disabled style="resize:none" placeholder="Enter text…"></textarea>`;
    case 'url': return `<input type="url" class="preview-input" disabled placeholder="https://…">`;
    case 'file': return `<div class="preview-upload">📎 File Upload</div>`;
    case 'pdf': return `<div class="preview-upload">📄 PDF Upload</div>`;
    case 'imageupload': return `<div class="preview-upload">📷 Image Upload</div>`;
    case 'richtext': return `<div class="preview-richtext">✏ Rich Text Editor</div>`;
    case 'table': return `<div class="preview-table">⊞ Table Input</div>`;
    default: return `<input type="text" class="preview-input" disabled placeholder="${field.label || 'Enter text…'}">`;
  }
}

function _attachCanvasListeners(container, editionId) {
  // Label changes
  container.querySelectorAll('.cfc-label-input').forEach(input => {
    input.addEventListener('change', () => {
      Store.updateField(input.dataset.fid, { label: input.value, text: input.value });
      Store.saveSchemaVersion(editionId, getCurrentUser().id, `Updated field label: ${input.value}`);
    });
  });
  // URL changes
  container.querySelectorAll('.cfc-url-input').forEach(input => {
    input.addEventListener('change', () => Store.updateField(input.dataset.fid, { url: input.value }));
  });
  // Options changes
  container.querySelectorAll('.cfc-options-input').forEach(input => {
    input.addEventListener('change', () => {
      const opts = input.value.split('\n').map(s => s.trim()).filter(Boolean);
      Store.updateField(input.dataset.fid, { options: opts });
    });
  });
  // Action Point changes
  container.querySelectorAll('.cfc-ap-title-input').forEach(input => {
    input.addEventListener('change', () => {
      const title = input.value.trim();
      const apId = title ? 'ap_' + title.toLowerCase().replace(/[^a-z0-9]+/g, '_') : '';
      Store.updateField(input.dataset.fid, { actionPointTitle: title, actionPointId: apId });
      Store.saveSchemaVersion(editionId, getCurrentUser().id, `Updated Action Point: ${title}`);
    });
  });
  // Required checkbox
  container.querySelectorAll('.cfc-required-chk').forEach(chk => {
    chk.addEventListener('change', () => Store.updateField(chk.dataset.fid, { required: chk.checked }));
  });
  // Mandatory upload
  container.querySelectorAll('.cfc-mandatory-chk').forEach(chk => {
    chk.addEventListener('change', () => Store.updateField(chk.dataset.fid, { mandatory: chk.checked, uploadRequirement: chk.checked ? 'mandatory' : 'optional' }));
  });
  // Score
  container.querySelectorAll('.cfc-score-input').forEach(input => {
    input.addEventListener('change', () => Store.updateField(input.dataset.fid, { maxScore: parseFloat(input.value) || 1, weight: parseFloat(input.value) || 1 }));
  });
  // Upload requirement
  container.querySelectorAll('.cfc-upload-req').forEach(sel => {
    sel.addEventListener('change', () => Store.updateField(sel.dataset.fid, { uploadRequirement: sel.value }));
  });
  // Delete field
  container.querySelectorAll('.btn-delete-field').forEach(btn => {
    btn.addEventListener('click', () => {
      showConfirm({
        title: 'Delete Field', message: 'Delete this form element?', type: 'danger', confirmText: 'Delete',
        onConfirm: () => {
          Store.deleteField(btn.dataset.id);
          Store.saveSchemaVersion(editionId, getCurrentUser().id, 'Deleted field');
          const canvas = container.querySelector('#schema-canvas');
          if (canvas && _activeReformAreaId) canvas.innerHTML = _renderFormCanvas(editionId, _activeReformAreaId, _activeActionPointId);
          _attachCanvasListeners(container, editionId);
        }
      });
    });
  });
  // ── Drag-and-drop: toolbox-to-canvas drops ──
  const fieldsList = container.querySelector('#canvas-fields-list');

  // Canvas as a whole: accept drops from toolbox
  if (fieldsList) {
    fieldsList.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      fieldsList.classList.add('drag-over');
    });
    fieldsList.addEventListener('dragleave', (e) => {
      if (!fieldsList.contains(e.relatedTarget)) {
        fieldsList.classList.remove('drag-over');
      }
    });
    fieldsList.addEventListener('drop', (e) => {
      e.preventDefault();
      fieldsList.classList.remove('drag-over', 'drag-active');
      try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        if (data.source === 'toolbox' && data.type) {
          if (!_activeReformAreaId) { showToast('Select a Reform Area first.', 'error'); return; }
          
          // Determine the target field ID if dropped exactly on a card
          let insertBeforeId = null;
          const targetCard = e.target.closest('.canvas-field-card');
          if (targetCard) {
              insertBeforeId = targetCard.dataset.fid;
          }

          _addFieldFromToolbox(container, editionId, data.type, insertBeforeId, _activeActionPointId);
        }
      } catch (_) {}
    });
  }
}

function _openVersionHistoryModal(editionId, container) {
  const versions = Store.getSchemaVersions(editionId);
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop-custom visible';
  backdrop.innerHTML = `
    <div class="modal-card-custom animate-modal-in" style="max-width:560px;text-align:left;max-height:80vh;overflow-y:auto;">
      <h3 class="modal-title-custom" style="text-align:left;margin-bottom:16px;">Schema Version History</h3>
      ${versions.length === 0 ? '<p style="color:var(--text-muted)">No versions saved yet. Click "Save Version" in the Schema Builder.</p>' :
      versions.map(v => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border:1px solid var(--border-color);border-radius:8px;margin-bottom:8px;">
            <div>
              <strong>${v.versionLabel}</strong>
              <p style="font-size:12px;color:var(--text-muted);margin-top:2px;">${v.note} · ${new Date(v.createdAt).toLocaleString('en-IN')}</p>
            </div>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-xs btn-outline btn-restore-version" data-id="${v.id}">Restore</button>
            </div>
          </div>
        `).join('')}
      <div style="margin-top:16px;text-align:right;"><button id="close-versions" class="btn btn-secondary">Close</button></div>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector('#close-versions').addEventListener('click', () => backdrop.remove());
  backdrop.querySelectorAll('.btn-restore-version').forEach(btn => {
    btn.addEventListener('click', () => {
      showConfirm({
        title: 'Restore Schema Version', message: 'Restore this version? Current schema will be overwritten.', type: 'warning', confirmText: 'Restore',
        onConfirm: () => {
          Store.restoreSchemaVersion(btn.dataset.id, getCurrentUser().id);
          backdrop.remove();
          renderSchemaBuilderTab(container, editionId);
          showToast('Schema restored!', 'success');
        }
      });
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// TAB 4: QUESTION REVIEW QUEUE
// ═══════════════════════════════════════════════════════════════
function renderQuestionQueueTab(container, editionId) {
  const reformAreas = Store.getReformAreas(editionId);
  let activeStatus = 'Submitted';
  let activeRA = '';

  const render = () => {
    const result = Store.getQuestionReviewQueue(editionId, { status: activeStatus, reformAreaId: activeRA });
    const rows = result.items.map(row => `
      <tr>
        <td><span class="app-id-chip">${row.appId.substring(0, 14)}…</span></td>
        <td><strong>${row.userName}</strong></td>
        <td>${row.reformAreaName}</td>
        <td style="max-width:220px;"><span title="${row.questionLabel}">${row.questionLabel?.substring(0, 50)}${row.questionLabel?.length > 50 ? '…' : ''}</span></td>
        <td><span class="status-badge status-${row.questionStatus.toLowerCase()}">${row.questionStatus}</span></td>
        <td><strong style="color:#4f46e5">${row.questionScore}</strong> / ${row.maxScore}</td>
        <td>
          <div class="row-actions">
            ${['Submitted', 'Resubmitted'].includes(row.questionStatus) ? `
              <button class="btn btn-xs btn-success-solid btn-q-approve" data-app="${row.appId}" data-field="${row.fieldId}" data-uid="${row.userId}" data-max="${row.maxScore}" title="Approve">✓</button>
              <button class="btn btn-xs btn-danger btn-q-reject" data-app="${row.appId}" data-field="${row.fieldId}" data-uid="${row.userId}" title="Reject">✕</button>
            ` : row.questionStatus === QUESTION_STATUS.APPROVED ? '<span style="color:#10b981;font-size:12px;">✓ Approved</span>' : '<span style="color:#ef4444;font-size:12px;">✕ Rejected</span>'}
          </div>
        </td>
      </tr>
    `).join('');

    container.innerHTML = `
      <div class="tab-section">
        <div class="tab-section-header">
          <h2>Question Review Queue <span class="count-chip">${result.total}</span></h2>
          <div class="filter-row">
            <select id="q-filter-status" class="form-select-sm">
              <option value="Submitted" ${activeStatus === 'Submitted' ? 'selected' : ''}>Pending Review</option>
              <option value="Approved" ${activeStatus === 'Approved' ? 'selected' : ''}>Approved</option>
              <option value="Rejected" ${activeStatus === 'Rejected' ? 'selected' : ''}>Rejected</option>
              <option value="" ${!activeStatus ? 'selected' : ''}>All</option>
            </select>
            <select id="q-filter-ra" class="form-select-sm">
              <option value="">All Reform Areas</option>
              ${reformAreas.map(r => `<option value="${r.id}" ${activeRA === r.id ? 'selected' : ''}>${r.name}</option>`).join('')}
            </select>
          </div>
        </div>
        ${result.items.length === 0 ? `
          <div class="empty-state">
            <div class="empty-icon">✅</div>
            <h3>No Questions to Review</h3>
            <p>When users submit questions, they appear here for review.</p>
          </div>
        ` : `
          <div class="table-wrapper">
            <table class="data-table">
              <thead><tr><th>App ID</th><th>Applicant</th><th>Reform Area</th><th>Question</th><th>Status</th><th>Score</th><th>Actions</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        `}
      </div>
    `;

    container.querySelector('#q-filter-status')?.addEventListener('change', e => { activeStatus = e.target.value; render(); });
    container.querySelector('#q-filter-ra')?.addEventListener('change', e => { activeRA = e.target.value; render(); });

    container.querySelectorAll('.btn-q-approve').forEach(btn => {
      btn.addEventListener('click', () => {
        const field = Store.getFieldById(btn.dataset.field);
        showPrompt({
          title: 'Approve Question', message: `Enter score (max ${btn.dataset.max}):`, placeholder: btn.dataset.max, confirmText: 'Approve',
          onConfirm: scoreStr => {
            const sc = parseFloat(scoreStr) || parseFloat(btn.dataset.max) || 1;
            Store.approveQuestion(btn.dataset.app, btn.dataset.field, getCurrentUser().id, sc);
            Store.addNotification(btn.dataset.uid, NOTIFICATION_EVENTS.QUESTION_APPROVED, `A question was approved. Score: ${sc}`, btn.dataset.app);
            Store.addAuditLog(getCurrentUser().id, `Approved question: ${field?.label}`, 'question', btn.dataset.app);
            showToast('Question approved!', 'success'); render();
          }
        });
      });
    });
    container.querySelectorAll('.btn-q-reject').forEach(btn => {
      btn.addEventListener('click', () => {
        const field = Store.getFieldById(btn.dataset.field);
        showPrompt({
          title: 'Reject Question', message: 'Enter rejection reason:', placeholder: 'e.g. Answer is incomplete…', confirmText: 'Reject',
          onConfirm: reason => {
            Store.rejectQuestion(btn.dataset.app, btn.dataset.field, getCurrentUser().id, reason || 'No reason');
            Store.addNotification(btn.dataset.uid, NOTIFICATION_EVENTS.QUESTION_REJECTED, `A question was rejected: ${reason}`, btn.dataset.app);
            Store.addAuditLog(getCurrentUser().id, `Rejected question: ${field?.label}`, 'question', btn.dataset.app);
            showToast('Question rejected.', 'info'); render();
          }
        });
      });
    });
  };

  render();
}

// ═══════════════════════════════════════════════════════════════
// TAB 5: SCORES
// ═══════════════════════════════════════════════════════════════
function renderScoresTab(container, editionId) {
  const stats = Store.getEditionStats(editionId);
  const raScores = Store.getReformAreaScores(editionId);

  container.innerHTML = `
    <div class="tab-section">
      <div class="tab-section-header"><h2>Score Overview</h2></div>
      <div class="kpi-row" style="margin-bottom:28px;">
        <div class="kpi-card big"><div class="kpi-value" style="color:#4f46e5;font-size:36px">${stats.avgScore}</div><div class="kpi-label">Average Score</div></div>
        <div class="kpi-card big"><div class="kpi-value" style="color:#10b981;font-size:36px">${stats.topScore}</div><div class="kpi-label">Highest Score</div></div>
        <div class="kpi-card big"><div class="kpi-value" style="color:#d97706;font-size:36px">${stats.lowestScore || 0}</div><div class="kpi-label">Lowest Score</div></div>
        <div class="kpi-card big"><div class="kpi-value" style="font-size:36px">${stats.total}</div><div class="kpi-label">Applications</div></div>
      </div>

      <div class="charts-grid">
        <div class="chart-card">
          <div class="chart-card-header"><h3>Reform Area Performance</h3></div>
          <canvas id="chart-ra-scores" height="280"></canvas>
        </div>
        <div class="chart-card">
          <div class="chart-card-header"><h3>Application Status Distribution</h3></div>
          <canvas id="chart-status-pie" height="280"></canvas>
        </div>
      </div>

      <div class="card-section" style="margin-top:24px;">
        <div class="card-section-header"><h2>Reform Area Scores</h2></div>
        <div class="card-section-body p-0">
          <table class="data-table">
            <thead><tr><th>Reform Area</th><th>Avg Score</th><th>Total Score</th><th>Performance</th></tr></thead>
            <tbody>
              ${raScores.map(ra => `
                <tr>
                  <td><div class="ra-name-cell"><div class="ra-color-dot" style="background:${ra.color}"></div>${ra.name}</div></td>
                  <td><strong style="color:#4f46e5">${ra.avgScore}</strong></td>
                  <td>${ra.totalScore}</td>
                  <td>
                    <div class="mini-progress">
                      <div class="mini-progress-fill" style="width:${Math.min(ra.avgScore, 100)}%;background:${ra.color}"></div>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Render Chart.js charts
  setTimeout(() => {
    if (window.Chart) {
      // Reform area bar chart
      const raCtx = document.getElementById('chart-ra-scores');
      if (raCtx) {
        new Chart(raCtx, {
          type: 'bar',
          data: {
            labels: raScores.map(r => r.name),
            datasets: [{ label: 'Avg Score', data: raScores.map(r => r.avgScore), backgroundColor: raScores.map(r => r.color + 'cc'), borderColor: raScores.map(r => r.color), borderWidth: 2, borderRadius: 6 }]
          },
          options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' } }, x: { grid: { display: false } } } }
        });
      }
      // Status pie chart
      const pieCtx = document.getElementById('chart-status-pie');
      if (pieCtx) {
        new Chart(pieCtx, {
          type: 'doughnut',
          data: {
            labels: ['Approved', 'Rejected', 'Submitted', 'Under Review', 'Draft'],
            datasets: [{ data: [stats.approved, stats.rejected, stats.submitted, stats.underReview, stats.draft], backgroundColor: ['#10b981', '#ef4444', '#0284c7', '#4f46e5', '#94a3b8'], borderWidth: 0 }]
          },
          options: { responsive: true, plugins: { legend: { position: 'bottom' } }, cutout: '65%' }
        });
      }
    }
  }, 100);
}

// ═══════════════════════════════════════════════════════════════
// TAB 6: REPORTS / ANALYTICS
// ═══════════════════════════════════════════════════════════════
function renderReportsTab(container, editionId) {
  const analytics = Store.getAnalytics(editionId);
  const { daily, buckets, catScores, reformAreaScores, stats } = analytics;

  container.innerHTML = `
    <div class="tab-section">
      <div class="tab-section-header"><h2>Analytics & Reports</h2></div>

      <div class="charts-grid charts-grid-3">
        <div class="chart-card" style="grid-column:span 2">
          <div class="chart-card-header"><h3>Submissions Over Time (Last 14 Days)</h3></div>
          <canvas id="chart-daily" height="220"></canvas>
        </div>
        <div class="chart-card">
          <div class="chart-card-header"><h3>Category Performance</h3></div>
          <canvas id="chart-category" height="220"></canvas>
        </div>
      </div>

      <div class="charts-grid" style="margin-top:24px;">
        <div class="chart-card">
          <div class="chart-card-header"><h3>Score Distribution</h3></div>
          <canvas id="chart-score-dist" height="260"></canvas>
        </div>
        <div class="chart-card">
          <div class="chart-card-header"><h3>Reform Area Avg Scores</h3></div>
          <canvas id="chart-ra-bar" height="260"></canvas>
        </div>
      </div>

      <div class="card-section" style="margin-top:24px;">
        <div class="card-section-header"><h2>Summary Statistics</h2></div>
        <div class="card-section-body">
          <div class="stats-summary-grid">
            <div class="ss-item"><div class="ss-val">${stats.total}</div><div class="ss-lbl">Total Applications</div></div>
            <div class="ss-item"><div class="ss-val">${stats.approved}</div><div class="ss-lbl">Approved</div></div>
            <div class="ss-item"><div class="ss-val">${stats.rejected}</div><div class="ss-lbl">Rejected</div></div>
            <div class="ss-item"><div class="ss-val">${stats.submitted}</div><div class="ss-lbl">Under Review</div></div>
            <div class="ss-item"><div class="ss-val">${stats.avgScore}</div><div class="ss-lbl">Avg Score</div></div>
            <div class="ss-item"><div class="ss-val">${stats.topScore}</div><div class="ss-lbl">Top Score</div></div>
          </div>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    if (!window.Chart) return;
    const palette = ['#4f46e5', '#10b981', '#d97706', '#ef4444', '#0284c7', '#7e22ce', '#0891b2'];

    // Daily line chart
    const dc = document.getElementById('chart-daily');
    if (dc) new Chart(dc, {
      type: 'line',
      data: {
        labels: Object.keys(daily),
        datasets: [{ label: 'Submissions', data: Object.values(daily), fill: true, borderColor: '#4f46e5', backgroundColor: 'rgba(79,70,229,0.08)', tension: 0.4, pointBackgroundColor: '#4f46e5', pointRadius: 4 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' } }, x: { grid: { display: false } } } }
    });

    // Category pie
    const cc = document.getElementById('chart-category');
    if (cc) {
      const catLabels = Object.keys(catScores);
      const catData = catLabels.map(k => catScores[k].count);
      new Chart(cc, {
        type: 'pie',
        data: { labels: catLabels, datasets: [{ data: catData, backgroundColor: palette, borderWidth: 0 }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
      });
    }

    // Score distribution
    const sd = document.getElementById('chart-score-dist');
    if (sd) new Chart(sd, {
      type: 'bar',
      data: {
        labels: Object.keys(buckets),
        datasets: [{ label: 'Applications', data: Object.values(buckets), backgroundColor: palette[0] + 'cc', borderColor: palette[0], borderWidth: 2, borderRadius: 6 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' } }, x: { grid: { display: false } } } }
    });

    // Reform area bar
    const rab = document.getElementById('chart-ra-bar');
    if (rab) new Chart(rab, {
      type: 'horizontalBar' in Chart.controllers ? 'horizontalBar' : 'bar',
      data: {
        labels: reformAreaScores.map(r => r.name),
        datasets: [{ label: 'Avg Score', data: reformAreaScores.map(r => r.avgScore), backgroundColor: reformAreaScores.map(r => r.color + 'cc'), borderColor: reformAreaScores.map(r => r.color), borderWidth: 2, borderRadius: 6 }]
      },
      options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true }, y: { grid: { display: false } } } }
    });
  }, 100);
}

// ═══════════════════════════════════════════════════════════════
// EDITION MODALS
// ═══════════════════════════════════════════════════════════════
function _openCreateEditionModal(container, onSelectEdition) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop-custom visible';
  backdrop.innerHTML = `
    <div class="modal-card-custom animate-modal-in" style="max-width:520px;text-align:left;">
      <h3 class="modal-title-custom" style="text-align:left;margin-bottom:20px;">Create New SRF Edition</h3>
      <div class="form-group-row" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
        <div class="form-group"><label>Edition Name *</label><input type="text" id="new-ed-name" class="form-input" placeholder="e.g. SRF 7.0"></div>
        <div class="form-group"><label>Version</label><input type="text" id="new-ed-version" class="form-input" placeholder="7.0"></div>
      </div>
      <div class="form-group" style="margin-bottom:12px;"><label>Description</label><textarea id="new-ed-desc" class="form-input" rows="2" style="resize:vertical"></textarea></div>
      <div class="form-group-row" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
        <div class="form-group"><label>Start Date</label><input type="date" id="new-ed-start" class="form-input"></div>
        <div class="form-group"><label>End Date</label><input type="date" id="new-ed-end" class="form-input"></div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button id="cancel-ed" class="btn btn-secondary">Cancel</button>
        <button id="submit-ed" class="btn btn-primary">Create Edition</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector('#cancel-ed').addEventListener('click', () => backdrop.remove());
  backdrop.querySelector('#submit-ed').addEventListener('click', () => {
    const name = backdrop.querySelector('#new-ed-name').value.trim();
    if (!name) { showToast('Edition name is required.', 'error'); return; }
    const ed = Store.createEdition({ name, version: backdrop.querySelector('#new-ed-version').value.trim() || name, description: backdrop.querySelector('#new-ed-desc').value.trim(), startDate: backdrop.querySelector('#new-ed-start').value, endDate: backdrop.querySelector('#new-ed-end').value, createdBy: getCurrentUser()?.id });
    Store.addAuditLog(getCurrentUser()?.id, `Created edition: ${name}`, 'edition', ed.id);
    showToast(`Edition "${name}" created!`, 'success');
    backdrop.remove();
    renderEditionsDashboard(container, onSelectEdition);
  });
}

function _openEditEditionModal(editionId, container, onSelectEdition) {
  const ed = Store.getEditionById(editionId);
  if (!ed) return;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop-custom visible';
  backdrop.innerHTML = `
    <div class="modal-card-custom animate-modal-in" style="max-width:520px;text-align:left;">
      <h3 class="modal-title-custom" style="text-align:left;margin-bottom:20px;">Edit: ${ed.name}</h3>
      <div class="form-group-row" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
        <div class="form-group"><label>Edition Name</label><input type="text" id="edit-ed-name" class="form-input" value="${ed.name}"></div>
        <div class="form-group"><label>Version</label><input type="text" id="edit-ed-version" class="form-input" value="${ed.version || ''}"></div>
      </div>
      <div class="form-group" style="margin-bottom:12px;"><label>Description</label><textarea id="edit-ed-desc" class="form-input" rows="2" style="resize:vertical">${ed.description || ''}</textarea></div>
      <div class="form-group-row" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
        <div class="form-group"><label>Start Date</label><input type="date" id="edit-ed-start" class="form-input" value="${ed.startDate || ''}"></div>
        <div class="form-group"><label>End Date</label><input type="date" id="edit-ed-end" class="form-input" value="${ed.endDate || ''}"></div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button id="cancel-edit-ed" class="btn btn-secondary">Cancel</button>
        <button id="submit-edit-ed" class="btn btn-primary">Save Changes</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector('#cancel-edit-ed').addEventListener('click', () => backdrop.remove());
  backdrop.querySelector('#submit-edit-ed').addEventListener('click', () => {
    Store.updateEdition(editionId, { name: backdrop.querySelector('#edit-ed-name').value.trim(), version: backdrop.querySelector('#edit-ed-version').value.trim(), description: backdrop.querySelector('#edit-ed-desc').value.trim(), startDate: backdrop.querySelector('#edit-ed-start').value, endDate: backdrop.querySelector('#edit-ed-end').value });
    Store.addAuditLog(getCurrentUser()?.id, `Updated edition: ${ed.name}`, 'edition', editionId);
    showToast('Edition updated!', 'success');
    backdrop.remove();
    renderEditionsDashboard(container, onSelectEdition);
  });
}

// ─── Shared helpers ───────────────────────────────────────────
function _paginationHtml({ page, totalPages, total }) {
  if (totalPages <= 1) return '';
  return `<div class="pagination-bar">
    <span class="pagination-info">Page ${page} of ${totalPages} (${total} total)</span>
    <div class="pagination-pages">
      ${Array.from({ length: totalPages }, (_, i) => i + 1).map(i => `<button class="pagination-btn ${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`).join('')}
    </div>
  </div>`;
}

export function renderMappingsTab(container, editionId) {
  const users = Store.getUsers().filter(u => u.role === 'user');
  const reformAreas = Store.getReformAreas(editionId);
  const fields = Store.getFieldsByEdition(editionId);

  if (users.length === 0) {
    container.innerHTML = `
      <div class="tab-section">
        <div class="tab-section-header"><h2>Mapping Configurations</h2></div>
        <div class="empty-state">
          <div class="empty-icon">👥</div>
          <h3>No User Accounts Available</h3>
          <p>Please create nodal user accounts under the User Management dashboard first.</p>
        </div>
      </div>
    `;
    return;
  }

  // Generate mapping view markup
  container.innerHTML = `
    <div class="tab-section">
      <div class="tab-section-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:12px;">
        <div>
          <h2>User Assignment Mappings</h2>
          <p style="font-size:12.5px; color:var(--text-muted); margin-top:2px;">Select a user to configure their mapping assignments for Reform Areas, Action Points, and Questions.</p>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <label style="font-weight:600; font-size:13px; color:var(--text-muted);">Select Nodal User:</label>
          <select id="mapping-user-select" class="form-select-sm" style="min-width:220px; height:34px;">
            <option value="">-- Choose User --</option>
            ${users.map(u => `<option value="${u.username}">${u.name || u.username} (${u.organization || 'User'})</option>`).join('')}
          </select>
        </div>
      </div>

      <div id="mapping-workspace-panel" class="hidden">
        <div style="display:grid; grid-template-columns: 1fr 1.2fr 1.5fr; gap:16px; align-items:start; margin-bottom:20px;">
          
          <!-- Column 1: Reform Areas -->
          <div class="card glass-card" style="max-height:65vh; display:flex; flex-direction:column;">
            <div class="card-header" style="padding:10px 14px; font-weight:700; font-size:13px;">1. Reform Areas</div>
            <div id="mapping-ra-list" style="overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:8px; flex:1;"></div>
          </div>

          <!-- Column 2: Action Points -->
          <div class="card glass-card" style="max-height:65vh; display:flex; flex-direction:column;">
            <div class="card-header" style="padding:10px 14px; font-weight:700; font-size:13px;">2. Action Points (AP)</div>
            <div id="mapping-ap-list" style="overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:10px; flex:1;"></div>
          </div>

          <!-- Column 3: Questions -->
          <div class="card glass-card" style="max-height:65vh; display:flex; flex-direction:column;">
            <div class="card-header" style="padding:10px 14px; font-weight:700; font-size:13px;">3. Questions</div>
            <div id="mapping-q-list" style="overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:10px; flex:1;"></div>
          </div>

        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px; border-top:1px solid var(--border-color); padding-top:16px;">
          <button id="btn-save-mappings" class="btn btn-primary btn-md" style="font-weight:600; padding:10px 24px; border-radius:8px;">💾 Save Mapping Configuration</button>
        </div>
      </div>

      <div id="mapping-empty-hint" class="empty-state" style="padding:48px;">
        <div class="empty-icon">👈</div>
        <h3>Select a Nodal User</h3>
        <p>Please select a nodal user from the dropdown above to load and edit their assigned compliance schema mappings.</p>
      </div>
    </div>
  `;

  const userSelect = container.querySelector('#mapping-user-select');
  const workspacePanel = container.querySelector('#mapping-workspace-panel');
  const emptyHint = container.querySelector('#mapping-empty-hint');
  const saveBtn = container.querySelector('#btn-save-mappings');

  const raList = container.querySelector('#mapping-ra-list');
  const apList = container.querySelector('#mapping-ap-list');
  const qList = container.querySelector('#mapping-q-list');

  // Load user data
  userSelect.addEventListener('change', () => {
    const username = userSelect.value;
    if (!username) {
      workspacePanel.classList.add('hidden');
      emptyHint.classList.remove('hidden');
      return;
    }

    workspacePanel.classList.remove('hidden');
    emptyHint.classList.add('hidden');

    // Populate columns
    _populateMappingColumns(username);
  });

  function _populateMappingColumns(username) {
    // 1. Reform Areas
    raList.innerHTML = reformAreas.map(ra => {
      const isChecked = ra.assignment?.users?.includes(username) ? 'checked' : '';
      return `
        <label class="mapping-item-label" style="display:flex; align-items:flex-start; gap:8px; padding:8px 10px; background:var(--bg-deep); border:1px solid var(--border-color); border-radius:6px; cursor:pointer; font-size:12px; font-weight:600; color:var(--text-main);">
          <input type="checkbox" id="chk-ra-${ra.id}" class="mapping-ra-chk" data-ra-id="${ra.id}" ${isChecked} style="margin-top:2px;">
          <span>${ra.name}</span>
        </label>
      `;
    }).join('');

    // Group questions by AP
    const apMap = {};
    fields.filter(f => !f.isLayoutElement).forEach(f => {
      const apId = f.actionPointId || 'ap_default';
      const apTitle = f.actionPointTitle || 'Standard Questions';
      if (!apMap[apId]) {
        apMap[apId] = {
          id: apId,
          title: apTitle,
          reformAreaId: f.reformAreaId,
          questions: []
        };
      }
      apMap[apId].questions.push(f);
    });

    const actionPoints = Object.values(apMap);

    // 2. Action Points
    apList.innerHTML = reformAreas.map(ra => {
      const raAps = actionPoints.filter(ap => ap.reformAreaId === ra.id);
      if (raAps.length === 0) return '';
      return `
        <div style="margin-bottom:8px;">
          <div style="font-size:10.5px; font-weight:700; text-transform:uppercase; color:var(--accent-indigo); margin-bottom:6px; letter-spacing:0.04em;">${ra.name}</div>
          <div style="display:flex; flex-direction:column; gap:6px;">
            ${raAps.map(ap => {
        // Check if all questions under this AP are assigned to the user
        const allQAssigned = ap.questions.every(q => q.assignment?.users?.includes(username));
        const isChecked = allQAssigned ? 'checked' : '';
        return `
                <label class="mapping-item-label" style="display:flex; align-items:flex-start; gap:8px; padding:6px 8px; background:rgba(255,255,255,0.01); border:1px solid var(--border-color); border-radius:6px; cursor:pointer; font-size:11.5px; font-weight:normal; color:var(--text-muted);">
                  <input type="checkbox" id="chk-ap-${ap.id}" class="mapping-ap-chk" data-ap-id="${ap.id}" data-ra-id="${ra.id}" ${isChecked} style="margin-top:2px;">
                  <span>${ap.title}</span>
                </label>
              `;
      }).join('')}
          </div>
        </div>
      `;
    }).join('');

    // 3. Questions
    qList.innerHTML = reformAreas.map(ra => {
      const raAps = actionPoints.filter(ap => ap.reformAreaId === ra.id);
      if (raAps.length === 0) return '';
      return `
        <div style="margin-bottom:12px;">
          <div style="font-size:10.5px; font-weight:700; text-transform:uppercase; color:var(--accent-indigo); margin-bottom:8px; letter-spacing:0.04em;">${ra.name}</div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${raAps.map(ap => `
              <div style="background:rgba(0,0,0,0.08); border-radius:6px; padding:6px 8px; border:1px solid var(--border-color); margin-bottom:8px;">
                <div style="font-size:10.5px; font-weight:600; color:var(--text-muted); margin-bottom:6px; border-bottom:1px dashed var(--border-color); padding-bottom:4px;">${ap.title}</div>
                <div style="display:flex; flex-direction:column; gap:6px;">
                  ${ap.questions.map(q => {
        const isChecked = q.assignment?.users?.includes(username) ? 'checked' : '';
        return `
                      <label class="mapping-item-label" style="display:flex; align-items:flex-start; gap:6px; cursor:pointer; font-size:11px; font-weight:normal; color:var(--text-main); margin-bottom:2px;">
                        <input type="checkbox" id="chk-q-${q.id}" class="mapping-q-chk" data-q-id="${q.id}" data-ap-id="${ap.id}" data-ra-id="${ra.id}" ${isChecked}>
                        <span><strong>Q ${q.num}:</strong> ${q.text || q.label}</span>
                      </label>
                    `;
      }).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');

    // Bind Cascading Handlers
    // 1. Reform Area Checkbox Change
    container.querySelectorAll('.mapping-ra-chk').forEach(chk => {
      chk.addEventListener('change', () => {
        const raId = chk.dataset.raId;
        const checked = chk.checked;
        // Toggle APs under this RA
        container.querySelectorAll(`.mapping-ap-chk[data-ra-id="${raId}"]`).forEach(apChk => {
          apChk.checked = checked;
        });
        // Toggle Qs under this RA
        container.querySelectorAll(`.mapping-q-chk[data-ra-id="${raId}"]`).forEach(qChk => {
          qChk.checked = checked;
        });
      });
    });

    // 2. Action Point Checkbox Change
    container.querySelectorAll('.mapping-ap-chk').forEach(chk => {
      chk.addEventListener('change', () => {
        const apId = chk.dataset.apId;
        const checked = chk.checked;
        // Toggle Qs under this AP
        container.querySelectorAll(`.mapping-q-chk[data-ap-id="${apId}"]`).forEach(qChk => {
          qChk.checked = checked;
        });
      });
    });
  }

  // Save Mapping Configuration
  saveBtn.addEventListener('click', () => {
    const username = userSelect.value;
    if (!username) return;

    // Save Reform Areas
    reformAreas.forEach(ra => {
      if (!ra.assignment) {
        ra.assignment = { type: 'all', users: [], startups: [], category: '', sector: '', district: '' };
      }
      const chk = container.querySelector(`#chk-ra-${ra.id}`);
      const checked = chk ? chk.checked : false;
      const idx = ra.assignment.users.indexOf(username);
      if (checked) {
        if (idx === -1) ra.assignment.users.push(username);
        ra.assignment.type = 'custom';
      } else {
        if (idx !== -1) ra.assignment.users.splice(idx, 1);
        if (ra.assignment.users.length === 0) ra.assignment.type = 'all';
      }
      Store.updateReformArea(ra.id, ra);
    });

    // Save Questions (fields)
    fields.forEach(f => {
      if (f.isLayoutElement) return;
      if (!f.assignment) {
        f.assignment = { type: 'all', users: [], startups: [], category: '', sector: '', district: '' };
      }
      const chk = container.querySelector(`#chk-q-${f.id}`);
      const checked = chk ? chk.checked : false;
      const idx = f.assignment.users.indexOf(username);
      if (checked) {
        if (idx === -1) f.assignment.users.push(username);
        f.assignment.type = 'custom';
      } else {
        if (idx !== -1) f.assignment.users.splice(idx, 1);
        if (f.assignment.users.length === 0) f.assignment.type = 'all';
      }
      Store.updateField(f.id, f);
    });

    Store.forceSave();
    Store.addAuditLog(getCurrentUser().id, `Updated assignment mappings for user: ${username}`, 'schema', editionId);
    showToast(`Mapping configurations for user "${username}" saved!`, 'success');
    _populateMappingColumns(username);
  });
}

export function renderRecycleBin(container, onSelectEdition) {
  const deletedEditions = Store.getDeletedEditions();

  const cards = deletedEditions.map(ed => {
    return `
      <div class="edition-card" style="opacity:0.8;">
        <div class="edition-card-top">
          <div class="edition-card-icon" style="background:linear-gradient(135deg,#94a3b8,#64748b);">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </div>
          <div class="edition-card-meta">
            <h3 style="text-decoration:line-through;color:var(--text-muted);">${ed.name}</h3>
            <p>Deleted Edition</p>
          </div>
        </div>
        <div class="edition-card-footer" style="justify-content:flex-end;">
          <button class="btn btn-sm btn-success-solid btn-restore-ed" data-id="${ed.id}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
            Restore
          </button>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-eyebrow">Admin Dashboard</div>
        <h1 class="page-title">Recycle Bin</h1>
        <p class="page-subtitle">Restore previously deleted SRF editions.</p>
      </div>
      <button id="btn-back-to-editions" class="btn btn-secondary btn-lg">Back to Active Editions</button>
    </div>

    ${deletedEditions.length === 0 ? `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" style="margin-bottom:16px;opacity:0.5;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        <h3>Recycle Bin is empty</h3>
        <p>No deleted editions found.</p>
      </div>
    ` : `
      <div class="editions-grid">
        ${cards}
      </div>
    `}
  `;

  container.querySelector('#btn-back-to-editions')?.addEventListener('click', () => {
    renderEditionsDashboard(container, onSelectEdition);
  });

  container.querySelectorAll('.btn-restore-ed').forEach(btn => {
    btn.addEventListener('click', () => {
      const edId = btn.dataset.id;
      showConfirm({
        title: 'Restore Edition',
        message: 'Are you sure you want to restore this edition? It will appear back in the active list.',
        type: 'success',
        confirmText: 'Restore',
        onConfirm: () => {
          Store.restoreEdition(edId);
          Store.addAuditLog(getCurrentUser().id, `Restored edition: ${edId}`, 'edition', edId);
          showToast('Edition restored successfully!', 'success');
          renderRecycleBin(container, onSelectEdition);
        }
      });
    });
  });
}

// Export legacy alias
export { renderEditionsDashboard as initEditionManager };
