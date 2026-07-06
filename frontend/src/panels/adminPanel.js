import { adminPanel, userPanel, uiState } from '../core/app.js';
import { getCurrentUser, isSuperAdmin, isAdmin, login } from '../auth/auth.js';
import { getDb, getEditions, forceSave, addAuditLog, initStore, getUsers, getUserById, deleteUser, updateUser, importUsersBulk, getDepartments, createUser, getAssignments, getEditionById, getFieldById, removeAssignment, createAssignmentsBulk, addNotification, getGuidelines, deleteGuideline, createGuideline, getAuditLogs, calculateApplicationScore, calculateApplicationMaxScore, deleteDepartment, createDepartment, updateDepartment, getSectionsByEdition, getFieldsBySection, fetchAllAdmins, updateAdminAPI, deleteAdminAPI, updateUserAPI, deleteUserAPI } from '../db/store.js';
import { pushToNavHistory, cleanupAllHeartbeats } from '../core/bootstrap.js';
import { renderAdminAnalyticsDashboard } from '../modules/advancedDashboard.js';
import { renderAssignedDetailsPanel } from '../panels/publisherPanel.js';
import { renderRecycleBinPanel } from '../panels/recycleBin.js';
import { renderMessagesTab } from '../panels/profileMessages.js';
import { renderGovernancePanel } from '../modules/governanceManager.js';
import { showToast } from '../ui/toastManager.js';
import { showConfirm } from '../ui/confirmDialog.js';
import { statesDistrictsData, allStates } from '../data/geoData.js';
import { _statusClass, _statusLabel } from '../panels/applicationForm.js';
import { initEditionManager } from '../modules/editionManager.js';
import { NOTIFICATION_EVENTS } from '../db/schema.js';

let activeEditionId = null;
let currentAuditFilterUserId = '';
let currentAuditFilterAdminId = '';
let currentAuditFilterDistrict = '';
let currentAuditFilterCategory = '';
let currentAuditFilterStartDate = '';
let currentAuditFilterEndDate = '';
let currentAuditFilterUserSearch = '';


export function renderAdminPortal() {
  adminPanel.classList.remove('hidden');
  userPanel.classList.add('hidden');

  // Build sidebar
  renderAdminSidebar();
  const preservedTab = sessionStorage.getItem('srf_active_admin_tab') || 'analytics';
  switchAdminTab(preservedTab);
}

export function renderAdminSidebar() {
  const user = getCurrentUser();
  const unreadMessages = (getDb().messages || []).filter(m => m.receiverId === user.id && !m.read).length;

  const nav = document.getElementById('sidebar-nav-container');
  document.getElementById('sidebar-title').textContent = 'Admin Panel';

  const tabs = [
    { id: 'analytics', label: 'Analytics Dashboard', icon: '<path d="M18 20V10M12 20V4M6 20v-6"/>', badge: '' },
    { id: 'editions', label: 'Editions Dashboard', icon: '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>', badge: '' },

    { id: 'users', label: 'Manage Users', icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', badge: '' },
    { id: 'audit', label: 'Audit Logs', icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>', badge: '' },
    { id: 'settings', label: 'Data Management', icon: '<ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"></path>', badge: '' },
    { id: 'messages', label: 'Messages', icon: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', badge: unreadMessages > 0 ? String(unreadMessages) : '' },
  ];

  if (isSuperAdmin()) {
    tabs.push({ id: 'admins', label: 'Manage Admins', icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', badge: '' });
    tabs.push({ id: 'departments', label: 'Manage Departments', icon: '<path d="M4 21h16M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16H4V5zm4 4h2v2H8V9zm0 6h2v2H8v-2zm6-6h2v2h-2V9zm0 6h2v2h-2v-2z"/>', badge: '' });
    tabs.push({ id: 'assigned-details', label: 'Reassign Tasks', icon: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', badge: '' });
    tabs.push({ id: 'recycle-bin', label: 'Recycle Bin', icon: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>', badge: '' });
  }

  nav.innerHTML = tabs.map(t => `
    <a href="#" class="nav-item ${uiState.activeAdminTab === t.id ? 'active' : ''}" data-tab="${t.id}">
      <span class="nav-item-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${t.icon}</svg>
      </span>
      <span class="nav-item-text">${t.label}</span>
      ${t.badge ? `<span class="nav-item-badge" style="margin-left:auto;background:var(--accent-indigo);color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:99px;">${t.badge}</span>` : ''}
    </a>
  `).join('');

  nav.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      switchAdminTab(item.dataset.tab);
    });
  });

  document.getElementById('sidebar-footer').innerHTML = `
    <div class="progress-box" style="background:transparent;border:none;padding:0;">
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">Total Editions</div>
      <div style="font-size:22px;font-weight:700;color:var(--accent-indigo);">${getEditions().length}</div>
    </div>
  `;
}

export function switchAdminTab(tab) {
  pushToNavHistory({ role: 'admin', tab });
  cleanupAllHeartbeats();

  if (window.chatPollingInterval) {
    clearInterval(window.chatPollingInterval);
    window.chatPollingInterval = null;
  }
  uiState.activeAdminTab = tab;
  sessionStorage.setItem('srf_active_admin_tab', tab);

  // Update nav highlights
  document.querySelectorAll('#sidebar-nav-container .nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.tab === tab);
  });

  // Hide all admin views
  ['admin-analytics-view', 'admin-editions-view', 'admin-tracker-view', 'schema-editor-panel',
    'admin-users-view', 'admin-admins-view', 'admin-guidelines-view', 'admin-audit-view', 'admin-settings-view', 'admin-departments-view', 'admin-assigned-details-view', 'admin-messages-view', 'admin-recycle-bin-view', 'admin-governance-view'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });

  const showView = (id) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  };

  switch (tab) {
    case 'tracker':
      showView('admin-tracker-view');
      break;

    case 'analytics':
      showView('admin-analytics-view');
      renderAdminAnalyticsDashboard(document.getElementById('admin-analytics-view'));
      break;

    case 'editions':
      showView('admin-editions-view');
      initEditionManager(
        document.getElementById('admin-editions-view'),
        (editionId) => openEditionTracker(editionId)
      );
      break;

    case 'schema':
      showView('schema-editor-panel');
      renderSchemaEditorAdmin(document.getElementById('schema-editor-panel'));
      break;

    case 'users':
      showView('admin-users-view');
      renderUsersPanel(document.getElementById('admin-users-view'));
      break;

    case 'admins':
      showView('admin-admins-view');
      renderAdminsPanel(document.getElementById('admin-admins-view'));
      break;

    case 'guidelines':
      showView('admin-guidelines-view');
      renderGuidelinesPanel(document.getElementById('admin-guidelines-view'));
      break;

    case 'audit':
      showView('admin-audit-view');
      renderAuditPanel(document.getElementById('admin-audit-view'));
      break;

    case 'settings':
      showView('admin-settings-view');
      renderSettingsPanel(document.getElementById('admin-settings-view'));
      break;



    case 'departments':
      showView('admin-departments-view');
      renderDepartmentsPanel(document.getElementById('admin-departments-view'));
      break;

    case 'assigned-details':
      showView('admin-assigned-details-view');
      renderAssignedDetailsPanel(document.getElementById('admin-assigned-details-view'));
      break;

    case 'recycle-bin':
      showView('admin-recycle-bin-view');
      renderRecycleBinPanel(document.getElementById('admin-recycle-bin-view'));
      break;

    case 'messages':
      showView('admin-messages-view');
      renderMessagesTab(document.getElementById('admin-messages-view'));
      break;

    case 'governance':
      showView('admin-governance-view');
      renderGovernancePanel(document.getElementById('admin-governance-view'));
      break;
  }
}

export function openEditionTracker(editionId) {
  pushToNavHistory({ role: 'admin', tab: 'tracker', editionId });

  activeEditionId = editionId;
  uiState.activeAdminTab = 'tracker';
  document.querySelectorAll('#sidebar-nav-container .nav-item').forEach(i => i.classList.remove('active'));

  ['admin-editions-view', 'admin-tracker-view', 'schema-editor-panel',
    'admin-users-view', 'admin-guidelines-view', 'admin-audit-view', 'admin-settings-view', 'admin-assigned-details-view', 'admin-messages-view', 'admin-recycle-bin-view'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });

  const trackerEl = document.getElementById('admin-tracker-view');
  trackerEl.classList.remove('hidden');
  renderApplicationTracker(trackerEl, editionId, () => switchAdminTab('editions'));
}

export function renderSchemaEditorAdmin(container) {
  const editions = getEditions();
  if (!activeEditionId && editions.length > 0) activeEditionId = editions[0].id;

  container.innerHTML = `
    <div class="section-card" style="margin-bottom:24px;">
      <div class="section-badge admin-badge">Schema Editor</div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;">
        <div>
          <h1>Form Schema Editor</h1>
          <p style="color:var(--text-muted);font-size:14px;">Build and manage dynamic compliance forms for each SRF edition. Add sections, questions, and configure field types, scoring, and document requirements.</p>
        </div>
        <div style="display:flex;gap:10px;align-items:center;">
          <label style="font-size:13px;font-weight:600;color:var(--text-muted);">Edition:</label>
          <select id="schema-edition-select" class="form-select-sm" style="min-width:160px;">
            ${editions.map(e => `<option value="${e.id}" ${e.id === activeEditionId ? 'selected' : ''}>${e.name}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>
    <div id="schema-editor-inner"></div>
  `;

  const editionSelect = container.querySelector('#schema-edition-select');
  editionSelect.addEventListener('change', () => {
    activeEditionId = editionSelect.value;
    renderSchemaEditorAdmin(container);
  });

  if (activeEditionId) {
    const sections = getSectionsByEdition(activeEditionId);
    // Convert to legacy format for formEditor.js compatibility
    let legacySchema = [];
    try {
      legacySchema = sections.map(sec => {
        const fields = getFieldsBySection(sec.id);
        const apMap = {};
        fields.forEach(f => {
          const apId = f.actionPointId || `${sec.id}_ap0`;
          const apTitle = f.actionPointTitle || 'Questions';
          if (!apMap[apId]) apMap[apId] = { id: apId, title: apTitle, questions: [] };

          let parsedElements = f.elements || [];
          if (typeof parsedElements === 'string') {
            try {
              parsedElements = JSON.parse(parsedElements);
            } catch (e) {
              parsedElements = [];
            }
          }
          if (!Array.isArray(parsedElements)) {
            parsedElements = [];
          }

          let defaultEl = null;
          if (parsedElements.length === 0) {
            defaultEl = {
              id: `el_${f.id}_1`,
              type: f.fieldType || 'text',
              label: f.text || f.label || 'Default Element',
              required: f.mandatory !== false,
              options: f.options || []
            };
            if (f.fieldType === 'radio' && (!defaultEl.options || defaultEl.options.length === 0)) {
              defaultEl.options = ["Yes", "No"];
            }
          }

          apMap[apId].questions.push({
            id: f.id,
            num: f.num || '',
            text: f.text || f.label || '',
            weight: f.weight || 1,
            fieldType: f.fieldType || 'text',
            uploadRequirement: f.uploadRequirement || 'optional',
            mandatory: f.mandatory !== false,
            guidelinePage: f.guidelinePage || 1,
            helpText: f.helpText || '',
            options: f.options || [],
            docs: f.docs || [],
            elements: (parsedElements.length > 0) ? parsedElements : [defaultEl],
            assignment: f.assignment || { type: 'all', users: [], startups: [], category: '', sector: '', district: '' }
          });
        });
        const secNum = (sec.num && sec.num !== 'undefined') ? sec.num : String(sec.orderIndex + 1);
        const secTitle = (sec.name && sec.name !== 'undefined') ? sec.name : ((sec.title && sec.title !== 'undefined') ? sec.title : '');
        const secDesc = (sec.description && sec.description !== 'undefined') ? sec.description : ((sec.desc && sec.desc !== 'undefined') ? sec.desc : '');
        return {
          id: sec.id,
          num: secNum,
          title: secTitle,
          desc: secDesc,
          marks: sec.marks || 10,
          dueDate: sec.dueDate || '2026-12-31',
          assignment: sec.assignment || { type: 'all', users: [], startups: [], category: '', sector: '', district: '' },
          actionPoints: Object.values(apMap)
        };
      });
    } catch (err) {
      console.error('[Schema Mapping Error]', err);
    }

    initFormEditor(
      container.querySelector('#schema-editor-inner'),
      legacySchema,
      (schema, verbose = true) => {
        const db = getDb();
        if (!db) return;

        // Clean current reformAreas and formFields for this edition
        db.reformAreas = (db.reformAreas || []).filter(r => r.editionId !== activeEditionId);
        db.formFields = (db.formFields || []).filter(f => f.editionId !== activeEditionId);

        schema.forEach((sec, secIdx) => {
          const ra = {
            id: sec.id,
            editionId: activeEditionId,
            name: sec.title || sec.name || '',
            description: sec.desc || sec.description || '',
            orderIndex: secIdx,
            marks: sec.marks || 10,
            dueDate: sec.dueDate || '2026-12-31',
            assignment: sec.assignment || { type: 'all', users: [], startups: [], category: '', sector: '', district: '' }
          };
          db.reformAreas.push(ra);

          let orderIdx = 0;
          (sec.actionPoints || []).forEach(ap => {
            (ap.questions || []).forEach(q => {
              db.formFields.push({
                id: q.id,
                num: q.num,
                editionId: activeEditionId,
                reformAreaId: sec.id,
                actionPointId: ap.id,
                actionPointTitle: ap.title,
                fieldType: q.fieldType || 'text',
                label: q.text || q.label,
                text: q.text || q.label,
                placeholder: `Enter response for Question ${q.num}...`,
                required: q.mandatory !== false,
                mandatory: q.mandatory !== false,
                weight: q.weight || 1,
                maxScore: q.weight || 1,
                uploadRequirement: q.uploadRequirement || 'optional',
                options: q.options || [],
                helpText: q.helpText || '',
                url: q.url || '',
                content: q.content || '',
                orderIndex: orderIdx++,
                isLayoutElement: ['heading', 'subheading', 'description', 'instruction', 'divider', 'card', 'banner', 'notes', 'warning', 'image', 'hyperlink'].includes(q.fieldType),
                isUploadElement: ['file', 'pdf', 'imageupload'].includes(q.fieldType),
                docs: q.docs || [],
                guidelinePage: q.guidelinePage || null,
                createdAt: new Date().toISOString(),
                elements: q.elements || [],
                assignment: q.assignment || { type: 'all', users: [], startups: [], category: '', sector: '', district: '' }
              });
            });
          });
        });

        forceSave();
        addAuditLog(getCurrentUser().id, 'Published schema and updated question assignments', 'schema', activeEditionId);
        if (verbose) {
          showToast('Schema saved successfully!', 'success');
          renderSchemaEditorAdmin(container);
        }
      },
      () => {
        showConfirm({
          title: 'Reset Schema',
          message: 'Reset the schema to the original default configuration?',
          type: 'danger', confirmText: 'Reset',
          onConfirm: async () => {
            const db = getDb();
            db.reformAreas = (db.reformAreas || []).filter(r => r.editionId !== activeEditionId);
            db.formFields = (db.formFields || []).filter(f => f.editionId !== activeEditionId);
            await initStore();
            showToast('Schema reset to default.', 'success');
            renderSchemaEditorAdmin(container);
          }
        });
      },
      getUsers()
    );
  }
}

export function renderUsersPanel(container) {
  const users = getUsers().filter(u => String(u.role).toLowerCase() === 'user');
  const rows = users.map(u => `
    <tr>
      <td><code style="font-size:11px;word-break:break-all;">${String(u.id).substring(0, 8)}...</code></td>
      <td><strong>${u.name || u.username}</strong><br><small style="color:var(--text-muted)">${u.username}</small></td>
      <td style="word-break:break-all;">${u.email || '—'}</td>
      <td><span class="role-badge" style="font-size:11px;">${u.role}</span></td>
      <td style="word-break:break-word;">${u.organization || '—'}</td>
      <td>${u.state || '—'}</td>
      <td>
        <div class="action-btns" style="flex-wrap:wrap; gap:8px;">
          ${u.role === 'user' && isSuperAdmin() ? `<button class="btn btn-action-text btn-primary btn-assign-user" data-id="${u.id}" style="padding:4px 8px;font-size:11px;">Assign</button>` : ''}
          <button class="btn btn-action-text btn-outline btn-edit-user" data-id="${u.id}" style="padding:4px 8px;font-size:11px;">✏️ Edit</button>
          ${u.role !== 'superadmin' ? `<button class="btn btn-action-text btn-danger btn-delete-user" data-id="${u.id}" style="padding:4px 8px;font-size:11px;">🗑️ Delete</button>` : ''}
          ${isSuperAdmin() && u.role !== 'superadmin' ? `<button class="btn btn-action-text btn-deactivate-user" data-id="${u.id}" style="padding:4px 8px;font-size:11px;color: ${u.isActive === false ? 'var(--success)' : '#ea580c'}">${u.isActive === false ? 'Activate' : 'Deactivate'}</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div class="page-header" style="margin-bottom:24px;">
      <div>
        <div class="page-eyebrow" style="color: #7c3aed; background: #ede9fe; padding: 4px 12px; border-radius: 6px; display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 12px;">User Management</div>
        <h1 class="page-title">Manage Users</h1>
        <p class="page-subtitle">View, assign and manage all registered users across editions.</p>
      </div>
      ${isSuperAdmin() || isAdmin() ? `
        <div style="display:flex;gap:10px; align-items:center;">
          <button class="btn btn-primary btn-lg" id="btn-create-user">+ Create User</button>
          <button class="btn btn-outline btn-lg" id="btn-bulk-import-users" style="background:#fff;">📂 Bulk Import Users</button>
        </div>
      ` : ''}
    </div>

    <div class="card glass-card">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
        <h2>All Users (${users.length})</h2>
        <input type="text" id="user-search" placeholder="Search by name, username, email..." class="search-input-sm">
      </div>
      <div class="card-body p-0">
        <div style="overflow-x:auto;">
          <table class="admin-dashboard-table" style="table-layout:fixed;min-width:900px;width:100%;">
            <colgroup>
              <col style="width:120px">
              <col style="width:130px">
              <col style="width:175px">
              <col style="width:110px">
              <col style="width:145px">
              <col style="width:120px">
              <col style="width:260px">
            </colgroup>
            <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Organization</th><th>State</th><th>Actions</th></tr></thead>
            <tbody id="users-tbody">${rows}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Search
  let timer;
  container.querySelector('#user-search')?.addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const q = e.target.value.toLowerCase();
      container.querySelectorAll('#users-tbody tr').forEach(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        const matches = cells.some(cell => cell.textContent.trim().toLowerCase().startsWith(q));
        row.style.display = matches ? '' : 'none';
      });
    }, 200);
  });

  // Create admin
  container.querySelector('#btn-create-admin')?.addEventListener('click', () => {
    openCreateAdminModal(container);
  });

  // Create User
  container.querySelector('#btn-create-user')?.addEventListener('click', () => {
    openCreateUserModal(container);
  });

  // Bulk import
  container.querySelector('#btn-bulk-import-users')?.addEventListener('click', () => {
    openBulkImportUsersModal(container);
  });

  // Assign sections
  container.querySelectorAll('.btn-assign-user').forEach(btn => {
    btn.addEventListener('click', () => openAssignmentModal(btn.dataset.id, container));
  });

  // Edit User
  container.querySelectorAll('.btn-edit-user').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = users.find(x => x.id === btn.dataset.id);
      if (u) openEditUserModal(u, container);
    });
  });

  // Delete User
  container.querySelectorAll('.btn-delete-user').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = users.find(x => x.id === btn.dataset.id);
      showConfirm({
        title: 'Delete User Account',
        message: `Are you sure you want to permanently delete user <strong>${u?.username}</strong>? This action cannot be undone.`,
        type: 'danger',
        confirmText: 'Delete User',
        onConfirm: async () => {
          btn.disabled = true;
          try {
            await deleteUserAPI(btn.dataset.id);
            addAuditLog(getCurrentUser().id, `Deleted user account: ${u?.username}`, 'user', btn.dataset.id);
            showToast('User deleted successfully natively.', 'success');
            renderUsersPanel(container);
          } catch (e) {
            showToast(e.message, 'error');
            btn.disabled = false;
          }
        }
      });
    });
  });

  // Deactivate User toggle
  container.querySelectorAll('.btn-deactivate-user').forEach(btn => {
    btn.addEventListener('click', () => openEditUserModal(btn.dataset.id, container));
  });
}

export function openBulkImportUsersModal(container) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop-custom';
  backdrop.innerHTML = `
    <div class="modal-card-custom animate-modal-in" style="max-width: 700px;">
      <h3 class="modal-title-custom">📂 Bulk Import Nodal Users</h3>
      <p class="modal-msg-custom">Upload a JSON file or paste structured user records to create accounts in bulk.</p>
      
      <div style="margin-bottom: 16px;">
        <label style="font-weight:600; display:block; margin-bottom:6px;">Upload JSON File</label>
        <input type="file" id="bulk-file-input" accept=".json" class="form-input" style="width:100%;">
      </div>

      <div style="margin-bottom: 16px;">
        <label style="font-weight:600; display:block; margin-bottom:6px;">Or Paste JSON Array</label>
        <textarea id="bulk-json-text" class="form-input" style="width:100%; height:120px; font-family:monospace; font-size:12px; padding:8px;" placeholder='[
  {
    "username": "dist_node1",
    "email": "nodal1@state.gov.in",
    "role": "user",
    "name": "Nodal Officer 1",
    "organization": "Startup India",
    "state": "Andhra Pradesh",
    "district": "Visakhapatnam"
  }
]'></textarea>
      </div>

      <div id="bulk-import-results" style="margin-bottom: 16px; display:none; max-height:150px; overflow-y:auto; padding:10px; background:var(--bg-deep); border-radius:6px; font-size:12px;"></div>

      <div class="modal-actions-custom" style="margin-top: 20px;">
        <button type="button" class="btn btn-secondary" id="cancel-bulk-import">Cancel</button>
        <button type="button" class="btn btn-primary" id="submit-bulk-import">Import Users</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('visible'));

  const fileInput = backdrop.querySelector('#bulk-file-input');
  const jsonText = backdrop.querySelector('#bulk-json-text');
  const cancelBtn = backdrop.querySelector('#cancel-bulk-import');
  const submitBtn = backdrop.querySelector('#submit-bulk-import');
  const resultsDiv = backdrop.querySelector('#bulk-import-results');

  const close = () => {
    backdrop.classList.remove('visible');
    setTimeout(() => backdrop.remove(), 200);
  };

  cancelBtn.addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      jsonText.value = event.target.result;
    };
    reader.readAsText(file);
  });

  submitBtn.addEventListener('click', async () => {
    let usersList = [];
    try {
      usersList = JSON.parse(jsonText.value.trim());
      if (!Array.isArray(usersList)) {
        throw new Error('JSON payload must be a root-level array of user objects.');
      }
    } catch (err) {
      showToast(`Invalid JSON payload: ${err.message}`, 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Importing...';
    resultsDiv.style.display = 'none';

    try {
      const res = await importUsersBulk(usersList);
      if (res.error) {
        showToast(res.error, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Import Users';
        return;
      }

      // Show stats
      resultsDiv.style.display = 'block';
      resultsDiv.innerHTML = `
        <strong style="color:var(--success);">✓ Bulk Import Finished!</strong>
        <p style="margin:4px 0 0 0;">Successfully registered: <strong>${res.createdCount} accounts</strong></p>
        \${res.errors && res.errors.length > 0 ? \`
          <p style="margin:8px 0 2px 0; font-weight:bold; color:var(--danger);">Errors encountered (\${res.errors.length}):</p>
          <ul style="margin:0; padding-left:20px; color:var(--danger);">
            \${res.errors.map(e => \`<li>\${e}</li>\`).join('')}
          </ul>
        \` : ''}
      `;
      showToast(`Bulk registration complete. Imported ${res.createdCount} users.`, 'success');

      // Refresh User directory panel in background
      if (container) {
        renderUsersPanel(container);
      }

      submitBtn.disabled = false;
      submitBtn.textContent = 'Import Users';
    } catch (err) {
      showToast(`Network error: \${err.message}`, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Import Users';
    }
  });
}

export function openCreateUserModal(container) {
  const depts = getDepartments();
  const deptOptionsHtml = depts.map(d => `<option value="${d.name}">${d.name} (${d.code})</option>`).join('');

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop-custom';
  backdrop.innerHTML = `
    <div class="modal-card-custom animate-modal-in" style="max-width: 600px;">
      <h3 class="modal-title-custom">Create State Nodal Team User</h3>
      <p class="modal-msg-custom">Fill out the details to register a new state user.</p>
      <form id="create-user-form" style="text-align: left;" autocomplete="off">
        <select id="reg-state" required class="form-select" style="display:none;">
          <option value="Andhra Pradesh" selected>Andhra Pradesh</option>
        </select>
        <div class="form-group-row">
          <div class="form-group">
            <label for="reg-district">District</label>
            <select id="reg-district" required class="form-select">
              <option value="" disabled selected>Select District</option>
            </select>
          </div>
          <div class="form-group">
            <label for="reg-org">Department / Organization</label>
            <input type="text" id="reg-org" required class="form-input" list="reg-org-options" placeholder="e.g. IT Dept or Startup Corp">
            <datalist id="reg-org-options">
              <option value="Department of Industries & Commerce (IND)">Department of Industries & Commerce (IND)</option>
              <option value="Department of Information Technology (IT)">Department of Information Technology (IT)</option>
              <option value="Department of Science & Technology (SNT)">Department of Science & Technology (SNT)</option>
              <option value="Department of Finance (FIN)">Department of Finance (FIN)</option>
              <option value="Department of Environment & Forests (ENV)">Department of Environment & Forests (ENV)</option>
              ${deptOptionsHtml}
            </datalist>
          </div>
        </div>
        <div class="form-group-row">
          <div class="form-group">
            <label for="reg-officer">Name</label>
            <input type="text" id="reg-officer" required placeholder="e.g. Devendra Joshi">
          </div>
          <div class="form-group">
            <label for="reg-email">Official Email</label>
            <input type="email" id="reg-email" required placeholder="startup.cell@state.gov.in">
          </div>
        </div>
        <div class="form-group-row">
          <div class="form-group">
            <label for="reg-username">Username</label>
            <input type="text" id="reg-username" required placeholder="e.g. ka_startup" autocomplete="off" readonly onfocus="this.removeAttribute('readonly');">
          </div>
          <div class="form-group">
            <label for="reg-password">Password</label>
            <input type="text" id="reg-password" class="form-input" disabled value="System Generated & Emailed" style="width:100%; font-style:italic; background:var(--bg-deep); color:var(--text-muted);">
          </div>
        </div>
        <div class="modal-actions-custom" style="margin-top: 20px;">
          <button type="button" class="btn btn-secondary" id="cancel-create-user">Cancel</button>
          <button type="submit" class="btn btn-primary">Create User</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('visible'));

  const form = backdrop.querySelector('#create-user-form');
  const cancelBtn = backdrop.querySelector('#cancel-create-user');
  const stateSelect = backdrop.querySelector('#reg-state');
  const districtSelect = backdrop.querySelector('#reg-district');
  const usernameInput = backdrop.querySelector('#reg-username');

  // Strip spaces dynamically from username
  usernameInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\s+/g, '');
  });

  const populateDistricts = (selectedState) => {
    districtSelect.innerHTML = '<option value="" disabled selected>Select District</option>';
    const districts = statesDistrictsData[selectedState] || statesDistrictsData["Andhra Pradesh"] || [];
    districts.forEach(dist => {
      const opt = document.createElement('option');
      opt.value = dist;
      opt.textContent = dist;
      districtSelect.appendChild(opt);
    });
  };

  populateDistricts("Andhra Pradesh");

  stateSelect.addEventListener('change', (e) => {
    populateDistricts(e.target.value);
  });

  const close = () => {
    backdrop.classList.remove('visible');
    setTimeout(() => backdrop.remove(), 200);
  };

  cancelBtn.addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = backdrop.querySelector('#reg-username').value.replace(/\s+/g, '').toLowerCase();
    const state = backdrop.querySelector('#reg-state').value.trim();
    const officer = backdrop.querySelector('#reg-officer').value.trim();
    const district = backdrop.querySelector('#reg-district').value.trim();
    const email = backdrop.querySelector('#reg-email').value.trim();
    const organization = backdrop.querySelector('#reg-org').value;
    const category = backdrop.querySelector('#reg-category')?.value || '';
    const sector = backdrop.querySelector('#reg-sector')?.value || '';
    const startupName = backdrop.querySelector('#reg-startupname')?.value.trim() || '';

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating...';

    const result = await createUser({
      username, email,
      role: 'user',
      name: officer,
      organization, state, district,
      category, sector, startupName
    });

    if (result.error) {
      showToast(result.error, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create User';
      return;
    }

    addAuditLog(getCurrentUser().id, `Registered state user: ${username}`, 'user', result.id);
    close();

    // Simple credential popup - plain text, no toggle buttons
    (() => {
      const pwd = result.tempPassword;
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;';
      d.innerHTML = `<div style="background:#fff;border-radius:16px;padding:36px 32px;max-width:420px;width:92%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.25);">
        <div style="width:52px;height:52px;background:#d1fae5;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;"><svg width="24" height="24" fill="none" stroke="#059669" stroke-width="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>
        <h3 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#111;">User Account Created</h3>
        <p style="color:#6b7280;font-size:14px;margin:0 0 20px;">User &ldquo;<strong>${username}</strong>&rdquo; has been successfully created.</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:left;margin-bottom:16px;">
          <div style="margin-bottom:12px;"><div style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px;">Username</div><div style="font-size:15px;font-weight:600;color:#1e293b;font-family:monospace;">${username}</div></div>
          <div><div style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px;">Temporary Password</div><div style="font-size:15px;font-weight:600;color:#1e293b;font-family:monospace;letter-spacing:2px;">********</div></div>
        </div>
        <p style="color:#6b7280;font-size:13px;margin:0 0 20px;">Use these credentials to log in. You will be prompted to change it later.</p>
        <button id="u-ok" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;border-radius:8px;padding:11px 36px;font-size:15px;font-weight:600;cursor:pointer;">OK</button>
      </div>`;
      document.body.appendChild(d);
      d.querySelector('#u-ok').addEventListener('click', () => d.remove());
    })();

    renderUsersPanel(container);
  });
}

export function openCreateAdminModal(container) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop-custom';
  backdrop.innerHTML = `
    <div class="modal-card-custom animate-modal-in" style="max-width: 600px;">
      <h3 class="modal-title-custom">Create Admin Account</h3>
      <p class="modal-msg-custom">Fill out the details to register a new administrator.</p>
      <form id="create-admin-form" style="text-align: left;" autocomplete="off">
        <div class="form-group-row">
          <div class="form-group">
            <label for="admin-state">State / UT</label>
            <select id="admin-state" class="form-select">
              <option value="" selected>Select State</option>
              ${allStates.map(st => `<option value="${st}">${st}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="admin-district">District</label>
            <select id="admin-district" class="form-select">
              <option value="" selected>Select District</option>
            </select>
          </div>
        </div>
        <div class="form-group-row">
          <div class="form-group">
            <label for="admin-name">Full Name</label>
            <input type="text" id="admin-name" required placeholder="e.g. John Doe">
          </div>
          <div class="form-group">
            <label for="admin-org">Organization / Department</label>
            <input type="text" id="admin-org" required class="form-input" list="admin-org-options" placeholder="e.g. IT Department or Startup Corp">
            <datalist id="admin-org-options">
              <option value="Department of Industries & Commerce (IND)">Department of Industries & Commerce (IND)</option>
              <option value="Department of Information Technology (IT)">Department of Information Technology (IT)</option>
              <option value="Department of Science & Technology (SNT)">Department of Science & Technology (SNT)</option>
              <option value="Department of Finance (FIN)">Department of Finance (FIN)</option>
              <option value="Department of Environment & Forests (ENV)">Department of Environment & Forests (ENV)</option>
            </datalist>
          </div>
        </div>
        <div class="form-group-row">
          <div class="form-group">
            <label for="admin-email">Official Email</label>
            <input type="email" id="admin-email" required placeholder="admin.srf@dpiit.gov.in">
          </div>
          <div class="form-group">
            <label for="admin-username">Username</label>
            <input type="text" id="admin-username" required placeholder="e.g. admin_john" autocomplete="off" readonly onfocus="this.removeAttribute('readonly');">
          </div>
        </div>
        <div class="form-group-row">
          <div class="form-group" style="width:50%;">
            <label for="admin-password">Password</label>
            <input type="text" id="admin-password" class="form-input" disabled value="System Generated & Emailed" style="width:100%; font-style:italic; background:var(--bg-deep); color:var(--text-muted);">
          </div>
        </div>
        <div class="modal-actions-custom" style="margin-top: 24px;">
          <button type="button" class="btn btn-secondary" id="cancel-create-admin">Cancel</button>
          <button type="submit" class="btn btn-primary">Create Admin</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('visible'));

  const form = backdrop.querySelector('#create-admin-form');
  const cancelBtn = backdrop.querySelector('#cancel-create-admin');
  const stateSelect = backdrop.querySelector('#admin-state');
  const districtSelect = backdrop.querySelector('#admin-district');
  const usernameInput = backdrop.querySelector('#admin-username');

  // Strip spaces dynamically from username
  usernameInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\s+/g, '');
  });

  // State → District cascade
  stateSelect.addEventListener('change', (e) => {
    const selectedState = e.target.value;
    districtSelect.innerHTML = '<option value="">Select District</option>';
    const districts = statesDistrictsData[selectedState] || statesDistrictsData["default"] || [];
    districts.forEach(dist => {
      const opt = document.createElement('option');
      opt.value = dist;
      opt.textContent = dist;
      districtSelect.appendChild(opt);
    });
  });

  const close = () => {
    backdrop.classList.remove('visible');
    setTimeout(() => backdrop.remove(), 200);
  };

  cancelBtn.addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = backdrop.querySelector('#admin-name').value.trim();
    const email = backdrop.querySelector('#admin-email').value.trim();
    const organization = backdrop.querySelector('#admin-org').value;
    const username = backdrop.querySelector('#admin-username').value.replace(/\s+/g, '').toLowerCase();
    const state = backdrop.querySelector('#admin-state').value || '';
    const district = backdrop.querySelector('#admin-district').value || '';

    if (!name || !email || !organization || !username) {
      showToast('All fields are required.', 'error');
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating...';

    const result = await createUser({
      username,
      email,
      role: 'admin',
      name,
      organization,
      state,
      district
    });

    if (result.error) {
      showToast(result.error, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Admin';
      return;
    }

    addAuditLog(getCurrentUser().id, `Created admin user: ${username}`, 'user', result.id);
    close();

    // Simple credential popup - plain text, no toggle buttons
    (() => {
      const pwd = result.tempPassword;
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;';
      d.innerHTML = `<div style="background:#fff;border-radius:16px;padding:36px 32px;max-width:420px;width:92%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.25);">
        <div style="width:52px;height:52px;background:#dbeafe;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;"><svg width="24" height="24" fill="none" stroke="#2563eb" stroke-width="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>
        <h3 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#111;">Admin Account Created</h3>
        <p style="color:#6b7280;font-size:14px;margin:0 0 20px;">Admin &ldquo;<strong>${username}</strong>&rdquo; has been successfully created.</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:left;margin-bottom:16px;">
          <div style="margin-bottom:12px;"><div style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px;">Username</div><div style="font-size:15px;font-weight:600;color:#1e293b;font-family:monospace;">${username}</div></div>
          <div><div style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px;">Temporary Password</div><div style="font-size:15px;font-weight:600;color:#1e293b;font-family:monospace;letter-spacing:2px;">********</div></div>
        </div>
        <p style="color:#6b7280;font-size:13px;margin:0 0 20px;">Use these credentials to log in. You will be prompted to change it later.</p>
        <button id="a-ok" style="background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;border:none;border-radius:8px;padding:11px 36px;font-size:15px;font-weight:600;cursor:pointer;">OK</button>
      </div>`;
      document.body.appendChild(d);
      d.querySelector('#a-ok').addEventListener('click', () => d.remove());
    })();

    renderAdminsPanel(container);
  });
}

export function openAssignmentModal(userId, container) {
  const user = getUserById(userId);
  const editions = getEditions().filter(e => e.status !== 'archived' && !e.isDeleted);
  const rawAssignments = getAssignments(userId);

  const currentAssignments = [];
  const assignmentsByEdition = {};
  rawAssignments.forEach(a => {
    if (!assignmentsByEdition[a.editionId]) assignmentsByEdition[a.editionId] = [];
    assignmentsByEdition[a.editionId].push(a);
  });

  Object.keys(assignmentsByEdition).forEach(editionId => {
    const editionAssignments = assignmentsByEdition[editionId];
    const totalReformAreas = getSectionsByEdition(editionId).length;
    const raAssigned = editionAssignments.filter(a => a.type === 'Reform Area');
    const hasFullEditionAssigned = editionAssignments.some(a => a.type === 'Edition');

    if (hasFullEditionAssigned || (raAssigned.length >= totalReformAreas && totalReformAreas > 0)) {
      const ed = getEditionById(editionId);
      currentAssignments.push({
        isGrouped: true,
        groupedIds: editionAssignments.map(a => a.id).join(','),
        type: 'Edition',
        responsibility: 'Full SRF Edition (' + (ed?.name || 'Edition') + ')',
        editionId
      });
    } else {
      currentAssignments.push(...editionAssignments);
    }
  });

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop-custom visible';
  backdrop.innerHTML = `
    <div class="modal-card-custom animate-modal-in" style="max-width:640px;text-align:left;max-height:85vh;overflow-y:auto;padding:24px;border-radius:16px;">
      <h3 class="modal-title-custom" style="text-align:left;margin-bottom:6px;font-family:var(--font-title);font-weight:700;">Assign Areas / Questions — ${user?.name || userId}</h3>
      <p style="color:var(--text-muted);font-size:13px;margin-bottom:20px;">Select an edition and assign Reform Areas, Action Points, or specific Questions to this user.</p>

      <div class="form-group" style="margin-bottom:16px;">
        <label style="font-weight:600;font-size:13px;color:var(--text-main);">Select Edition</label>
        <select id="assign-edition" class="form-input form-select" style="height:40px;">
          ${editions.map(e => `<option value="${e.id}">${e.name}</option>`).join('')}
        </select>
      </div>
      <div id="assign-sections-list" style="margin-bottom:20px;max-height:400px;overflow-y:auto;padding-right:8px;"></div>

      ${currentAssignments.length > 0 ? `
        <div style="margin-bottom:20px;background:var(--bg-secondary);padding:16px;border-radius:8px;border:1px solid var(--border-color);">
          <h4 style="font-size:13px;font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:8px;">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
             Current Assignments
          </h4>
          <div style="display:flex;flex-direction:column;gap:8px;">
          ${currentAssignments.map(a => {
    let displayTitle = a.responsibility;
    if (!displayTitle || displayTitle === 'undefined') {
      if (a.type === 'Question') {
        const field = getFieldById(a.questionId || a.fieldId);
        if (field) {
          displayTitle = field.num ? `Q${field.num}: ${field.label || field.text}` : (field.label || field.text);
        }
      } else if (a.type === 'Action Point') {
        displayTitle = a.title || a.actionPointId || 'Action Point Task';
      } else {
        const allSections = getSectionsByEdition(a.editionId) || [];
        const section = allSections.find(s => s.id === (a.sectionId || a.reformAreaId));
        if (section) {
          displayTitle = section.name || section.title;
        }
      }
    }
    if (!displayTitle || displayTitle === 'undefined') {
      displayTitle = a.title || a.sectionId || 'Specific Assignment';
    }
    return `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg-main);border:1px solid var(--border-color);border-radius:8px;font-size:13px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                <div>
                  <strong style="color:var(--text-main);">${displayTitle}</strong>
                  <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Type: ${a.type || 'General'}</div>
                </div>
                <button class="btn btn-xs btn-danger btn-remove-assign" data-id="${a.id}" ${a.isGrouped ? `data-grouped-ids="${a.groupedIds}"` : ''}>Remove</button>
              </div>
            `;
  }).join('')}
          </div>
        </div>
      ` : ''}

      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button id="close-assign-modal" class="btn btn-secondary">Close</button>
        <button id="submit-assign" class="btn btn-primary">Send Questions</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const loadSections = (editionId) => {
    const reformAreas = getSectionsByEdition(editionId);
    const listEl = backdrop.querySelector('#assign-sections-list');

    if (reformAreas.length === 0) {
      listEl.innerHTML = `
        <div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;border: 1px dashed var(--border-color);border-radius: 8px;">
          No reform areas found for this edition.<br><br>
          <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;margin-top:10px;padding:8px 16px;background:var(--bg-secondary);border-radius:6px;">
            <input type="checkbox" id="assign-full-edition-empty" class="form-checkbox" value="full">
            <span style="font-weight:600;color:var(--text-main);">Assign Full Edition Anyway</span>
          </label>
        </div>
      `;
      return;
    }

    let html = '<div style="display:flex;flex-direction:column;gap:16px;">';

    reformAreas.forEach(ra => {
      const title = ra.name || ra.title || 'Unnamed Reform Area';
      const fields = getFieldsBySection(ra.id).filter(f => !f.isLayoutElement);

      html += `
        <div class="ra-assign-group" style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden;background:var(--bg-main);box-shadow:0 1px 2px rgba(0,0,0,0.02);">
          <div style="padding:12px 16px;background:var(--bg-secondary);border-bottom:1px solid var(--border-color);display:flex;align-items:center;gap:12px;">
            <input type="checkbox" class="assign-chk chk-ra" value="${ra.id}" data-type="Reform Area" data-title="RA: ${title.replace(/"/g, '&quot;')}" style="width:16px;height:16px;cursor:pointer;">
            <div style="flex:1;">
              <div style="font-weight:600;font-size:14px;color:var(--text-main);">${title}</div>
              <div style="font-size:11px;color:var(--text-muted);">${fields.length} Questions total</div>
            </div>
          </div>
          <div style="padding:12px 16px;display:flex;flex-direction:column;gap:12px;">
      `;

      // Group by action points
      const apMap = {};
      fields.forEach(f => {
        const apId = f.actionPointId || 'unassigned_ap';
        if (!apMap[apId]) apMap[apId] = { id: apId, title: f.actionPointTitle || 'Action Point', fields: [] };
        apMap[apId].fields.push(f);
      });

      Object.values(apMap).forEach(ap => {
        html += `
            <div class="ap-assign-group" style="padding-left:24px;border-left:2px solid var(--border-color);margin-left:8px;">
              <label style="display:flex;align-items:center;gap:10px;margin-bottom:8px;cursor:pointer;">
                <input type="checkbox" class="assign-chk chk-ap" value="${ap.id}" data-type="Action Point" data-title="AP: ${ap.title.replace(/"/g, '&quot;')}" data-ra="${ra.id}" style="width:14px;height:14px;">
                <span style="font-weight:500;font-size:13px;color:var(--text-main);">${ap.title}</span>
              </label>
              <div class="q-assign-group" style="display:flex;flex-direction:column;gap:6px;padding-left:24px;">
        `;

        ap.fields.forEach(q => {
          const qLabel = q.num ? `Q${q.num}: ${q.label || q.text}` : (q.label || q.text || 'Unnamed Question');
          html += `
                <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:4px 0;">
                  <input type="checkbox" class="assign-chk chk-q" value="${q.id}" data-type="Question" data-title="${qLabel.replace(/"/g, '&quot;')}" data-ra="${ra.id}" data-ap="${ap.id}" style="width:13px;height:13px;margin-top:2px;">
                  <span style="font-size:12px;color:var(--text-muted);line-height:1.4;">${qLabel}</span>
                </label>
          `;
        });

        html += `
              </div>
            </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    });

    html += '</div>';
    listEl.innerHTML = html;

    // Checkbox cascading logic
    backdrop.querySelectorAll('.chk-ra').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const checked = e.target.checked;
        const parentGroup = e.target.closest('.ra-assign-group');
        parentGroup.querySelectorAll('.chk-ap, .chk-q').forEach(child => child.checked = checked);
      });
    });

    backdrop.querySelectorAll('.chk-ap').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const checked = e.target.checked;
        const parentGroup = e.target.closest('.ap-assign-group');
        parentGroup.querySelectorAll('.chk-q').forEach(child => child.checked = checked);

        const raGroup = e.target.closest('.ra-assign-group');
        const allAps = Array.from(raGroup.querySelectorAll('.chk-ap'));
        raGroup.querySelector('.chk-ra').checked = allAps.length > 0 && allAps.every(c => c.checked);
      });
    });

    backdrop.querySelectorAll('.chk-q').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const apGroup = e.target.closest('.ap-assign-group');
        const allQs = Array.from(apGroup.querySelectorAll('.chk-q'));
        apGroup.querySelector('.chk-ap').checked = allQs.length > 0 && allQs.every(c => c.checked);

        const raGroup = e.target.closest('.ra-assign-group');
        const allAps = Array.from(raGroup.querySelectorAll('.chk-ap'));
        raGroup.querySelector('.chk-ra').checked = allAps.length > 0 && allAps.every(c => c.checked);
      });
    });
  };

  loadSections(editions[0]?.id);
  backdrop.querySelector('#assign-edition').addEventListener('change', (e) => loadSections(e.target.value));

  backdrop.querySelector('#close-assign-modal').addEventListener('click', () => backdrop.remove());

  backdrop.querySelectorAll('.btn-remove-assign').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.groupedIds) {
        const ids = btn.dataset.groupedIds.split(',');
        ids.forEach(id => removeAssignment(id));
      } else {
        removeAssignment(btn.dataset.id);
      }
      showToast('Assignment(s) removed.', 'info');
      backdrop.remove();
      openAssignmentModal(userId, container);
    });
  });

  backdrop.querySelector('#submit-assign').addEventListener('click', () => {
    const editionId = backdrop.querySelector('#assign-edition').value;

    const assignmentsToCreate = [];
    const emptyAssignCheckbox = backdrop.querySelector('#assign-full-edition-empty');

    if (emptyAssignCheckbox && emptyAssignCheckbox.checked) {
      assignmentsToCreate.push({
        type: 'Edition',
        editionId,
        responsibility: 'Full SRF Edition'
      });
    } else {
      backdrop.querySelectorAll('.ra-assign-group').forEach(raGroup => {
        const raChk = raGroup.querySelector('.chk-ra');
        if (raChk && raChk.checked) {
          assignmentsToCreate.push({
            type: 'Reform Area',
            sectionId: raChk.value,
            reformAreaId: raChk.value,
            editionId,
            responsibility: raChk.dataset.title
          });
        } else {
          raGroup.querySelectorAll('.ap-assign-group').forEach(apGroup => {
            const apChk = apGroup.querySelector('.chk-ap');
            if (apChk && apChk.checked) {
              assignmentsToCreate.push({
                type: 'Action Point',
                sectionId: apChk.dataset.ra,
                reformAreaId: apChk.dataset.ra,
                actionPointId: apChk.value,
                editionId,
                responsibility: apChk.dataset.title
              });
            } else {
              apGroup.querySelectorAll('.chk-q:checked').forEach(qChk => {
                assignmentsToCreate.push({
                  type: 'Question',
                  sectionId: qChk.dataset.ra,
                  reformAreaId: qChk.dataset.ra,
                  actionPointId: qChk.dataset.ap,
                  questionId: qChk.value,
                  fieldId: qChk.value,
                  editionId,
                  responsibility: qChk.dataset.title
                });
              });
            }
          });
        }
      });
    }

    if (assignmentsToCreate.length === 0) {
      showToast('Select at least one assignment item.', 'error');
      return;
    }

    const createdCount = createAssignmentsBulk(userId, assignmentsToCreate, getCurrentUser().id);

    addNotification(userId, NOTIFICATION_EVENTS.SECTION_ASSIGNED,
      `You have been assigned new responsibilities in ${getEditionById(editionId)?.name || 'an edition'}.`);
    addAuditLog(getCurrentUser().id, `Bulk assigned ${createdCount} items to user ${userId}`, 'user', userId);

    showToast(`${createdCount} new assignment(s) saved successfully!`, 'success');
    backdrop.remove();
  });
}


export function renderGuidelinesPanel(container) {
  const editions = getEditions();
  const selEdId = activeEditionId || editions[0]?.id;
  const guidelines = selEdId ? getGuidelines({ editionId: selEdId }) : [];

  container.innerHTML = `
    <div class="section-card" style="margin-bottom:24px;">
      <div class="section-badge admin-badge">Guidelines Manager</div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;">
        <div><h1>Guidelines & Hyperlinks</h1>
        <p style="color:var(--text-muted);font-size:14px;">Attach text guidelines, hyperlinks, PDFs, and video references to editions, reform areas, sections, or individual questions.</p></div>
        <div style="display:flex;gap:10px;align-items:center;">
          <select id="guide-edition-sel" class="form-select-sm">
            ${editions.map(e => `<option value="${e.id}" ${e.id === selEdId ? 'selected' : ''}>${e.name}</option>`).join('')}
          </select>
          <button class="btn btn-primary" id="btn-add-guideline">+ Add Guideline</button>
        </div>
      </div>
    </div>
    <div class="card glass-card">
      <div class="card-header"><h2>Guidelines (${guidelines.length})</h2></div>
      <div class="card-body p-0">
        ${guidelines.length === 0 ? `
          <div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--border-color)" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            <h3>No guidelines yet</h3><p>Click "+ Add Guideline" to create the first one.</p></div>
        ` : `
          <table class="admin-dashboard-table">
            <thead><tr><th>Title</th><th>Type</th><th>Scope</th><th>Content / URL</th><th>Action</th></tr></thead>
            <tbody>
              ${guidelines.map(g => `
                <tr>
                  <td><strong>${g.title}</strong></td>
                  <td><span class="status-badge status-draft" style="text-transform:capitalize;">${g.type}</span></td>
                  <td>${g.sectionId ? 'Section' : g.reformAreaId ? 'Reform Area' : 'Edition'}</td>
                  <td>${g.url ? `<a href="${g.url}" target="_blank" style="color:var(--primary);">${g.url.substring(0, 40)}...</a>` : g.content.substring(0, 60)}</td>
                  <td><button class="btn btn-xs btn-danger btn-del-guideline" data-id="${g.id}">Delete</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </div>
    </div>
  `;

  container.querySelector('#guide-edition-sel')?.addEventListener('change', (e) => {
    activeEditionId = e.target.value;
    renderGuidelinesPanel(container);
  });

  container.querySelectorAll('.btn-del-guideline').forEach(btn => {
    btn.addEventListener('click', () => {
      showConfirm({
        title: 'Delete Guideline', message: 'Delete this guideline?', type: 'danger', confirmText: 'Delete',
        onConfirm: () => { deleteGuideline(btn.dataset.id); showToast('Guideline deleted.', 'success'); renderGuidelinesPanel(container); }
      });
    });
  });

  container.querySelector('#btn-add-guideline')?.addEventListener('click', () => openAddGuidelineModal(selEdId, container));
}

export function openAddGuidelineModal(editionId, container) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop-custom visible';
  backdrop.innerHTML = `
    <div class="modal-card-custom animate-modal-in" style="max-width:520px;text-align:left;">
      <h3 class="modal-title-custom" style="text-align:left;margin-bottom:20px;">Add Guideline</h3>
      <div class="form-group" style="margin-bottom:12px;">
        <label>Title *</label>
        <input type="text" id="guide-title" placeholder="e.g. Application Guidelines" class="form-input">
      </div>
      <div class="form-group" style="margin-bottom:12px;">
        <label>Type</label>
        <select id="guide-type" class="form-input form-select">
          <option value="text">Text Note</option>
          <option value="url">Hyperlink / Website URL</option>
          <option value="pdf">PDF Reference</option>
          <option value="video">Video Link</option>
          <option value="sample">Sample Document</option>
        </select>
      </div>
      <div class="form-group" style="margin-bottom:12px;">
        <label>URL (if applicable)</label>
        <input type="url" id="guide-url" placeholder="https://..." class="form-input">
      </div>
      <div class="form-group" style="margin-bottom:20px;">
        <label>Text Content / Description</label>
        <textarea id="guide-content" rows="3" class="form-input" style="resize:vertical;" placeholder="Guideline text or description..."></textarea>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button id="cancel-guide" class="btn btn-secondary">Cancel</button>
        <button id="submit-guide" class="btn btn-primary">Add Guideline</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector('#cancel-guide').addEventListener('click', () => backdrop.remove());
  backdrop.querySelector('#submit-guide').addEventListener('click', () => {
    const title = backdrop.querySelector('#guide-title').value.trim();
    if (!title) { showToast('Title is required.', 'error'); return; }
    createGuideline({
      editionId, type: backdrop.querySelector('#guide-type').value,
      title, url: backdrop.querySelector('#guide-url').value.trim(),
      content: backdrop.querySelector('#guide-content').value.trim()
    });
    showToast('Guideline added!', 'success');
    backdrop.remove();
    renderGuidelinesPanel(container);
  });
}

export function exportAllSubmissionsExcelFunc() {
  const db = getDb();
  const apps = (db.applications || []).filter(a => ['Submitted', 'Resubmitted', 'Approved', 'Rejected', 'Under Review', 'Additional Documents Requested'].includes(a.status));
  const users = db.users || [];
  const editions = db.editions || [];
  const answers = db.applicationAnswers || [];
  const formFields = db.formFields || [];

  const relevantEditionIds = [...new Set(apps.map(a => a.editionId))];
  const fieldsToInclude = formFields.filter(f => relevantEditionIds.includes(f.editionId));
  fieldsToInclude.sort((a, b) => {
    if (a.editionId !== b.editionId) return a.editionId.localeCompare(b.editionId);
    return (a.orderIndex || 0) - (b.orderIndex || 0);
  });

  const fixedHeaders = ['Application ID', 'Edition', 'User Name', 'Username', 'Email', 'Organization', 'State', 'District', 'Status', 'Submitted At', 'Last Updated', 'Score', 'Num Documents'];

  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8"></head>
    <body><table border="1"><thead><tr>`;

  fixedHeaders.forEach(h => { html += `<th style="background-color:#f3f4f6;"><b>${h}</b></th>`; });

  fieldsToInclude.forEach(f => {
    const editionName = editions.find(e => e.id === f.editionId)?.name || f.editionId;
    html += `<th style="background-color:#eef2ff;"><b>[${editionName}] ${f.num ? f.num + ': ' : ''}${f.label || f.text || f.id} (Answer)</b></th>`;
    html += `<th style="background-color:#eef2ff;"><b>[${editionName}] ${f.num ? f.num + ': ' : ''}${f.label || f.text || f.id} (Documents)</b></th>`;
  });
  html += `<th style="background-color:#fef3c7;"><b>Other Documents (Multi-Upload)</b></th>`;
  html += `</tr></thead><tbody>`;

  apps.forEach(app => {
    const user = users.find(u => u.id === app.userId);
    const edition = editions.find(e => e.id === app.editionId);
    const appAnswers = answers.filter(a => a.applicationId === app.id);
    const numDocs = appAnswers.reduce((sum, a) => sum + (a.files?.length || 0), 0);

    html += `<tr>`;
    const fixedData = [
      app.id, edition?.name || app.editionId,
      user?.name || user?.nodalOfficer || '—', user?.username || '—', user?.email || '—',
      user?.organization || app.organization || '—', user?.state || app.state || '—', user?.district || '—',
      app.status, app.submittedAt ? new Date(app.submittedAt).toLocaleString('en-IN') : '—',
      new Date(app.updatedAt).toLocaleString('en-IN'), app.score || 0, numDocs
    ];

    fixedData.forEach(d => { html += `<td>${d}</td>`; });

    let otherDocumentsHtml = [];

    fieldsToInclude.forEach(f => {
      if (f.editionId !== app.editionId) {
        html += `<td style="background-color:#f9fafb;">N/A</td><td style="background-color:#f9fafb;">N/A</td>`;
        return;
      }
      const ans = appAnswers.find(a => a.fieldId === f.id);
      if (!ans) {
        html += `<td></td><td></td>`;
        return;
      }

      // Standard files for this question
      const standardDocIds = (f.docs || []).map(d => d.id);
      const standardFiles = (ans.files || []).filter(file => standardDocIds.includes(file.docId));

      // Custom files for this question (goes to Other Documents)
      const customFiles = (ans.files || []).filter(file => !standardDocIds.includes(file.docId));
      if (customFiles.length > 0) {
        customFiles.forEach(file => {
          const label = file.customLabel || file.name || 'Other Document';
          if (file.dataUrl) {
            otherDocumentsHtml.push(`<div><a href="${file.dataUrl}">${label}</a></div>`);
          } else {
            otherDocumentsHtml.push(`<div>📄 ${label}</div>`);
          }
        });
      }

      // Answer Value cell
      html += `<td>${ans.value ? `<div>${ans.value}</div>` : ''}</td>`;

      // Standard Documents cell
      let standardDocsHtml = [];
      if (standardFiles.length > 0) {
        standardFiles.forEach(file => {
          if (file.dataUrl) {
            standardDocsHtml.push(`<div><a href="${file.dataUrl}">${file.name || 'View Document'}</a></div>`);
          } else {
            standardDocsHtml.push(`<div>📄 ${file.name}</div>`);
          }
        });
      }
      html += `<td>${standardDocsHtml.join('')}</td>`;
    });

    // Other Documents column
    html += `<td>${otherDocumentsHtml.length > 0 ? otherDocumentsHtml.join('') : '<i>None</i>'}</td>`;

    html += `</tr>`;
  });

  html += `</tbody></table></body></html>`;

  if (apps.length === 0) { showToast('No submitted applications to export.', 'info'); return; }

  const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `SRF_All_Submissions_${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Exported ${apps.length} submitted applications successfully!`, 'success');
}

export function openExportEditionModal(onConfirm) {
  const editions = getEditions();
  const editionOptions = editions.map(e => `<option value="${e.id}">${e.name} (${e.version})</option>`).join('');

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop-custom visible';
  backdrop.style.zIndex = '10001';
  backdrop.innerHTML = `
    <div class="modal-card-custom animate-modal-in" style="max-width: 450px; padding:24px;">
      <h3 style="margin-top:0; font-family:var(--font-title); font-weight:700; font-size:18px;">Export Submissions to Excel</h3>
      <p style="font-size:13px; color:var(--text-muted); margin-bottom:16px;">Select which edition's data you want to export. Choosing "All Editions" will download a combined spreadsheet.</p>
      
      <div class="form-group" style="text-align:left; margin-bottom:20px;">
        <label style="font-weight:600; display:block; margin-bottom:6px; font-size:13px;">Select Edition</label>
        <select id="export-edition-select" class="form-select" style="width:100%; height:40px;">
          <option value="">All Editions</option>
          ${editionOptions}
        </select>
      </div>
      
      <div style="display:flex; justify-content:flex-end; gap:10px; border-top:1px solid var(--border-color); padding-top:16px;">
        <button type="button" class="btn btn-secondary" id="btn-export-cancel">Cancel</button>
        <button type="button" class="btn btn-primary" id="btn-export-confirm" style="background:linear-gradient(135deg,#059669,#10b981); border:none;">Download Excel</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector('#btn-export-cancel').addEventListener('click', close);
  backdrop.querySelector('#btn-export-confirm').addEventListener('click', () => {
    const edId = backdrop.querySelector('#export-edition-select').value;
    close();
    onConfirm(edId);
  });
}

export function renderAuditPanel(container) {
  let restoreFocus = false;
  let selectionStart = 0;

  const result = getAuditLogs({
    page: 1,
    pageSize: 100,
    userId: currentAuditFilterUserId,
    adminId: currentAuditFilterAdminId,
    district: currentAuditFilterDistrict,
    category: currentAuditFilterCategory,
    startDate: currentAuditFilterStartDate,
    endDate: currentAuditFilterEndDate
  });

  const rows = result.items.map(log => {
    const userObj = getUserById(log.userId);
    return `
      <tr>
        <td>${new Date(log.timestamp).toLocaleString('en-IN')}</td>
        <td>${userObj?.name || log.userId}</td>
        <td>${log.action}</td>
        <td><span style="font-size:11px;color:var(--text-muted);">${log.entityType}</span></td>
        <td><code style="font-size:11px;">${log.entityId || '—'}</code></td>
        <td style="font-size:12px;color:var(--text-muted);">${log.details || ''}</td>
      </tr>
    `;
  }).join('');

  // Application Tracking logic
  const allApps = getDb().applications || [];
  let filteredApps = allApps;

  // Exclude applications from soft-deleted editions
  const activeEditions = getEditions().filter(e => !e.isDeleted);
  const activeEditionIds = activeEditions.map(e => e.id);
  filteredApps = filteredApps.filter(app => activeEditionIds.includes(app.editionId));

  if (currentAuditFilterUserId) {
    filteredApps = filteredApps.filter(app => app.userId === currentAuditFilterUserId);
  }
  if (currentAuditFilterDistrict) {
    const districtUserIds = new Set(
      getUsers().filter(u => u.district === currentAuditFilterDistrict).map(u => u.id)
    );
    filteredApps = filteredApps.filter(app => districtUserIds.has(app.userId));
  }

  const trackRows = filteredApps.map(app => {
    const user = getUserById(app.userId);
    const edition = getEditionById(app.editionId);

    const score = calculateApplicationScore(app.id);
    const maxScore = calculateApplicationMaxScore(app.id) || 1;
    const pct = ((score / maxScore) * 100).toFixed(1);

    const hasAnyScore = score > 0;
    const hasBeenReviewed = ['Approved', 'Rejected', 'Additional Documents Requested'].includes(app.status) || hasAnyScore;

    const scoreDisplay = hasBeenReviewed ? `${score} / ${maxScore}` : '—';
    const pctDisplay = hasBeenReviewed ? `${pct}%` : '—';

    const statusCls = _statusClass(app.status);
    const statusLabel = _statusLabel(app.status);
    const updatedDate = new Date(app.updatedAt || app.submittedAt || Date.now()).toLocaleString('en-IN');

    return `
      <tr>
        <td><code style="font-size:11px;">${app.id}</code></td>
        <td><strong>${user?.username || app.userId}</strong><br><span style="font-size:11px;color:var(--text-muted);">${user?.name || ''}</span></td>
        <td>${app.organization || app.state || '—'}</td>
        <td>${edition?.name || app.editionId}</td>
        <td><span class="status-badge ${statusCls}" style="font-size:11px;">${statusLabel}</span></td>
        <td><strong>${scoreDisplay}</strong></td>
        <td><span style="color:var(--success);font-weight:700;">${pctDisplay}</span></td>
        <td style="font-size:12px;color:var(--text-muted);">${updatedDate}</td>
      </tr>
    `;
  }).join('');

  const usersList = getUsers() || [];

  // User select options
  const stateUsers = usersList.filter(u => u.role === 'user');
  const selectedUserObj = currentAuditFilterUserId ? getUserById(currentAuditFilterUserId) : null;
  const selectedUserLabel = selectedUserObj ? `${selectedUserObj.name || selectedUserObj.username} (${selectedUserObj.district || 'AP'})` : '';

  // Admin select options
  const adminUsers = usersList.filter(u => ['admin', 'reviewer', 'superadmin'].includes(u.role));
  const adminOptionsHtml = `<option value="">All Admins / Reviewers</option>` +
    adminUsers.map(u => `<option value="${u.id}" ${currentAuditFilterAdminId === u.id ? 'selected' : ''}>${u.name || u.username} (${u.role})</option>`).join('');

  // District options
  const districtsList = [...new Set(usersList.filter(u => u.district).map(u => u.district))];
  const districtOptionsHtml = `<option value="">All Districts</option>` +
    districtsList.map(d => `<option value="${d}" ${currentAuditFilterDistrict === d ? 'selected' : ''}>${d}</option>`).join('');

  container.innerHTML = `
    <div class="section-card" style="margin-bottom:24px;">
      <div class="section-badge admin-badge">Audit Trail</div>
      <h1>Audit Logs</h1>
      <p style="color:var(--text-muted);font-size:14px;">Complete action history — every user action, approval, submission, and system event is tracked here.</p>
    </div>

    <div class="card glass-card" style="margin-bottom:24px; padding:16px;">
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:16px; align-items:center;">
        <div class="form-group" style="margin-bottom:0; display:flex; flex-direction:column; gap:6px;">
          <label style="font-weight:600; font-size:12px; color:var(--text-muted); display:block;">Filter by User</label>
          <div style="display:flex; gap:6px; width:100%;">
            <div class="searchable-select-container" style="flex:1; position:relative;">
              <input type="text" id="audit-filter-user-autocomplete" class="form-input" placeholder="Search user..." value="${selectedUserLabel || currentAuditFilterUserSearch || ''}" style="height:38px; width:100%;" autocomplete="off">
              <div id="audit-filter-user-dropdown" class="searchable-select-dropdown hidden">
                <div class="searchable-select-item ${!currentAuditFilterUserId ? 'selected' : ''}" data-id="" data-label="All State Users">All State Users</div>
                ${stateUsers.map(u => {
    const label = `${u.name || u.nodalOfficer || u.username} (${u.district || 'AP'})`;
    const isSelected = currentAuditFilterUserId === u.id;
    return `<div class="searchable-select-item ${isSelected ? 'selected' : ''}" data-id="${u.id}" data-label="${label}">${label}</div>`;
  }).join('')}
              </div>
            </div>
            <button class="btn btn-primary" id="btn-search-user" style="height:38px; padding:0 12px; display:flex; align-items:center; justify-content:center; border:none; border-radius:6px; cursor:pointer;" title="Search User">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label style="font-weight:600; font-size:12px; color:var(--text-muted); display:block; margin-bottom:6px;">Filter by Admin</label>
          <select id="audit-filter-admin-select" class="form-select" style="height:38px;">
            ${adminOptionsHtml}
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label style="font-weight:600; font-size:12px; color:var(--text-muted); display:block; margin-bottom:6px;">Filter by District</label>
          <select id="audit-filter-district-select" class="form-select" style="height:38px;">
            ${districtOptionsHtml}
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label style="font-weight:600; font-size:12px; color:var(--text-muted); display:block; margin-bottom:6px;">Filter by Action</label>
          <select id="audit-filter-action-select" class="form-select" style="height:38px;">
            <option value="" ${currentAuditFilterCategory === '' ? 'selected' : ''}>All Actions</option>
            <option value="login" ${currentAuditFilterCategory === 'login' ? 'selected' : ''}>Login History</option>
            <option value="approve" ${currentAuditFilterCategory === 'approve' ? 'selected' : ''}>Approvals (App/Doc/Q)</option>
            <option value="reject" ${currentAuditFilterCategory === 'reject' ? 'selected' : ''}>Rejections & Resubmissions</option>
            <option value="assign" ${currentAuditFilterCategory === 'assign' ? 'selected' : ''}>Task Assignments</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label style="font-weight:600; font-size:12px; color:var(--text-muted); display:block; margin-bottom:6px;">Start Date</label>
          <input type="date" id="audit-filter-start-date" class="form-control" value="${currentAuditFilterStartDate}" style="height:38px; width: 100%; border: 1px solid var(--border-color); border-radius: 6px; padding: 0 12px; background: var(--bg-card); color: var(--text-main);">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label style="font-weight:600; font-size:12px; color:var(--text-muted); display:block; margin-bottom:6px;">End Date</label>
          <input type="date" id="audit-filter-end-date" class="form-control" value="${currentAuditFilterEndDate}" style="height:38px; width: 100%; border: 1px solid var(--border-color); border-radius: 6px; padding: 0 12px; background: var(--bg-card); color: var(--text-main);">
        </div>
      </div>
    </div>

    <div class="card glass-card" style="margin-bottom:24px;">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
        <div>
          <h2>Export &amp; Downloads</h2>
          <p style="font-size:13px;color:var(--text-muted);margin:4px 0 0 0;">Download real-time data of all user submissions and documents.</p>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-primary" id="btn-export-submissions-excel" style="background:linear-gradient(135deg,#059669,#10b981);border:none;color:#fff;display:flex;align-items:center;gap:6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Download All Submissions (Enterprise Excel)
          </button>
        </div>
      </div>
    </div>

    <!-- Application Progress & Score Tracking -->
    <div class="card glass-card" style="margin-bottom:24px;">
      <div class="card-header">
        <h2>Application Progress &amp; Score Tracking</h2>
        <p style="font-size:13px;color:var(--text-muted);margin:4px 0 0 0;">Track SRF compliance applications, review status, scores, and completion percentage.</p>
      </div>
      <div class="card-body p-0">
        ${filteredApps.length === 0 ? '<div class="empty-state"><p>No applications found.</p></div>' : `
          <div style="overflow-x:auto;">
            <table class="admin-dashboard-table">
              <thead>
                <tr>
                  <th>Application ID</th>
                  <th>SRF User</th>
                  <th>Organization / State</th>
                  <th>Edition</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Percentage</th>
                  <th>Last Updated</th>
                </tr>
              </thead>
              <tbody>${trackRows}</tbody>
            </table>
          </div>
        `}
      </div>
    </div>

    <div class="card glass-card">
      <div class="card-header"><h2>Recent Actions (${result.total})</h2></div>
      <div class="card-body p-0">
        ${result.items.length === 0 ? '<div class="empty-state"><p>No audit logs matching filters.</p></div>' : `
          <div style="overflow-x:auto;">
            <table class="admin-dashboard-table">
              <thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Entity</th><th>ID</th><th>Details</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        `}
      </div>
    </div>
  `;

  const autocompleteInput = container.querySelector('#audit-filter-user-autocomplete');
  const autocompleteDropdown = container.querySelector('#audit-filter-user-dropdown');

  if (autocompleteInput && autocompleteDropdown) {
    // Show dropdown on click
    autocompleteInput.addEventListener('click', (e) => {
      e.stopPropagation();
      autocompleteDropdown.classList.remove('hidden');
    });

    autocompleteInput.addEventListener('focus', (e) => {
      autocompleteDropdown.classList.remove('hidden');
    });

    // Filter items as user types
    autocompleteInput.addEventListener('input', (e) => {
      const val = e.target.value.toLowerCase();
      currentAuditFilterUserSearch = val;

      const items = autocompleteDropdown.querySelectorAll('.searchable-select-item');
      items.forEach(item => {
        const text = item.textContent.toLowerCase();
        if (item.dataset.id === "") {
          item.classList.toggle('hidden', val.length > 0);
        } else {
          item.classList.toggle('hidden', !text.includes(val));
        }
      });
    });

    // Select item from list
    autocompleteDropdown.querySelectorAll('.searchable-select-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = item.dataset.id;
        currentAuditFilterUserId = id;
        currentAuditFilterUserSearch = id ? item.dataset.label : '';
        autocompleteDropdown.classList.add('hidden');
        renderAuditPanel(container);
      });
    });

    // Close dropdown when clicking outside
    const closeDropdownHandler = (e) => {
      if (!autocompleteInput.contains(e.target) && !autocompleteDropdown.contains(e.target)) {
        autocompleteDropdown.classList.add('hidden');
      }
    };
    document.addEventListener('click', closeDropdownHandler);

    // Search and Enter functionality
    const executeUserSearch = () => {
      const query = autocompleteInput.value.trim().toLowerCase();
      if (!query) {
        currentAuditFilterUserId = '';
        currentAuditFilterUserSearch = '';
        renderAuditPanel(container);
        return;
      }

      // Find first visible select-item in dropdown, or best match in stateUsers
      const visibleItems = Array.from(autocompleteDropdown.querySelectorAll('.searchable-select-item')).filter(item => !item.classList.contains('hidden'));
      const firstValidItem = visibleItems.find(item => item.dataset.id !== "");

      if (firstValidItem) {
        const id = firstValidItem.dataset.id;
        currentAuditFilterUserId = id;
        currentAuditFilterUserSearch = firstValidItem.dataset.label;
        autocompleteInput.value = firstValidItem.dataset.label;
        autocompleteDropdown.classList.add('hidden');
        renderAuditPanel(container);
      } else {
        // Fallback prefix / text match in stateUsers
        const matched = stateUsers.find(u =>
          (u.name && u.name.toLowerCase().includes(query)) ||
          (u.nodalOfficer && u.nodalOfficer.toLowerCase().includes(query)) ||
          (u.username && u.username.toLowerCase().includes(query)) ||
          (u.district && u.district.toLowerCase().includes(query))
        );
        if (matched) {
          const label = `${matched.name || matched.nodalOfficer || matched.username} (${matched.district || 'AP'})`;
          currentAuditFilterUserId = matched.id;
          currentAuditFilterUserSearch = label;
          autocompleteInput.value = label;
          autocompleteDropdown.classList.add('hidden');
          renderAuditPanel(container);
        } else {
          showToast('No matching user found', 'warning');
        }
      }
    };

    container.querySelector('#btn-search-user')?.addEventListener('click', (e) => {
      e.stopPropagation();
      executeUserSearch();
    });

    autocompleteInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        executeUserSearch();
      }
    });
  }
  container.querySelector('#audit-filter-admin-select')?.addEventListener('change', (e) => {
    currentAuditFilterAdminId = e.target.value;
    renderAuditPanel(container);
  });
  container.querySelector('#audit-filter-district-select')?.addEventListener('change', (e) => {
    currentAuditFilterDistrict = e.target.value;
    renderAuditPanel(container);
  });
  container.querySelector('#audit-filter-action-select')?.addEventListener('change', (e) => {
    currentAuditFilterCategory = e.target.value;
    renderAuditPanel(container);
  });
  container.querySelector('#audit-filter-start-date')?.addEventListener('change', (e) => {
    currentAuditFilterStartDate = e.target.value;
    renderAuditPanel(container);
  });
  container.querySelector('#audit-filter-end-date')?.addEventListener('change', (e) => {
    currentAuditFilterEndDate = e.target.value;
    renderAuditPanel(container);
  });

  // Download All Submissions Excel listener (available for admin & superadmin)
  container.querySelector('#btn-export-submissions-excel')?.addEventListener('click', () => {
    openExportEditionModal(async (editionId) => {
      const btn = container.querySelector('#btn-export-submissions-excel');
      if (!btn) return;
      const originalHtml = btn.innerHTML;
      try {
        btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;border-top-color:#fff;margin-right:6px;"></div> Generating Export...';
        btn.disabled = true;

        let urlStr = '/api/export/excel';
        if (editionId) urlStr += `?editionId=${encodeURIComponent(editionId)}`;

        const response = await fetch(urlStr, { method: 'GET' });
        if (!response.ok) throw new Error('Failed to download Excel');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SRF_Export_${editionId || 'All'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        showToast('Export downloaded successfully!', 'success');
      } catch (err) {
        console.error(err);
        showToast('Error generating export', 'error');
      } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
      }
    });
  });

  if (restoreFocus) {
    const newInput = container.querySelector('#audit-filter-user-search');
    if (newInput) {
      newInput.focus();
      newInput.selectionStart = selectionStart;
      newInput.selectionEnd = selectionStart;
    }
  }
}

export function renderSettingsPanel(container) {
  const db = getDb() || {};
  const editionsCount = (db.editions || []).filter(e => !e.isDeleted).length;
  const appsCount = (db.applications || []).filter(a => !a.isDeleted).length;
  const usersCount = (db.users || []).filter(u => u.active !== false).length;
  const auditLogsCount = (db.auditLogs || []).length;
  const dbJsonString = JSON.stringify(db, null, 2);

  container.innerHTML = `
    <div class="section-card" style="margin-bottom:24px;">
      <div class="section-badge admin-badge">Platform Operations</div>
      <h1>Data Management</h1>
      <p style="color:var(--text-muted);font-size:14px;">Monitor database metrics, view raw system data, export collections, and perform database operations.</p>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px;">
      <div class="card glass-card" style="padding:16px;display:flex;flex-direction:column;gap:4px;">
        <span style="font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted)">Editions</span>
        <span style="font-size:28px;font-weight:700;color:var(--accent-indigo)">${editionsCount}</span>
      </div>
      <div class="card glass-card" style="padding:16px;display:flex;flex-direction:column;gap:4px;">
        <span style="font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted)">Applications</span>
        <span style="font-size:28px;font-weight:700;color:var(--accent-indigo)">${appsCount}</span>
      </div>
      <div class="card glass-card" style="padding:16px;display:flex;flex-direction:column;gap:4px;">
        <span style="font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted)">Registered Users</span>
        <span style="font-size:28px;font-weight:700;color:var(--accent-indigo)">${usersCount}</span>
      </div>
      <div class="card glass-card" style="padding:16px;display:flex;flex-direction:column;gap:4px;">
        <span style="font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted)">Audit Logs</span>
        <span style="font-size:28px;font-weight:700;color:var(--accent-indigo)">${auditLogsCount}</span>
      </div>
    </div>

    <div class="card glass-card" style="margin-bottom:24px;">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
        <div>
          <h2>Export &amp; Downloads</h2>
          <p style="font-size:13px;color:var(--text-muted);margin:4px 0 0 0;">Download real-time data of all user submissions and documents.</p>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-primary" id="btn-export-submissions-excel-settings" style="background:linear-gradient(135deg,#059669,#10b981);border:none;color:#fff;display:flex;align-items:center;gap:6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Download All Submissions (Excel)
          </button>
          ${isSuperAdmin() ? `<button class="btn btn-primary" id="btn-export-csv" style="background:linear-gradient(135deg,#4f46e5,#6366f1);border:none;color:#fff;display:flex;align-items:center;gap:6px;">Applications Report (CSV)</button>` : ''}
          ${isSuperAdmin() ? `<button class="btn btn-primary" id="btn-export-users-csv" style="background:#6366f1;border-color:#6366f1;color:#fff;">Export Users (CSV)</button>` : ''}
          ${isSuperAdmin() ? `<button class="btn btn-primary" id="btn-export-admins-csv" style="background:#f59e0b;border-color:#f59e0b;color:#fff;">Export Admins (CSV)</button>` : ''}
        </div>
      </div>
    </div>
  `;

  container.querySelector('#btn-export-submissions-excel-settings')?.addEventListener('click', () => {
    openExportEditionModal(async (editionId) => {
      const btn = container.querySelector('#btn-export-submissions-excel-settings');
      if (!btn) return;
      const originalHtml = btn.innerHTML;
      try {
        btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;border-top-color:#fff;margin-right:6px;"></div> Generating Export...';
        btn.disabled = true;

        let urlStr = '/api/export/excel';
        if (editionId) urlStr += `?editionId=${encodeURIComponent(editionId)}`;

        const response = await fetch(urlStr, { method: 'GET' });
        if (!response.ok) throw new Error('Failed to download Excel');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SRF_Export_${editionId || 'All'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        showToast('Export downloaded successfully!', 'success');
      } catch (err) {
        console.error(err);
        showToast('Error generating export', 'error');
      } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
      }
    });
  });



  container.querySelector('#btn-export-csv')?.addEventListener('click', () => {
    const db = getDb();
    const apps = db.applications || [];
    const users = db.users || [];
    const editions = db.editions || [];

    const escapeCSV = (val) => {
      if (val === undefined || val === null) return '""';
      let str = String(val).trim();
      // Replace double quotes with double-double quotes for CSV standard
      str = str.replace(/"/g, '""');
      return `"${str}"`;
    };

    const fixedHeaders = [
      "User Name",
      "Application ID",
      "Edition",
      "User ID",
      "Username",
      "Email",
      "State",
      "User Category",
      "District",
      "Sector",
      "Nodal Officer",
      "Startup Name",
      "Status",
      "Rejection Reason",
      "Additional Docs Note",
      "Total Score",
      "Max Score",
      "Percentage",
      "Last Updated",
      "Reform Area Statuses",
      "Timeline Logs",
      "Comments & Admin Remarks"
    ];

    const relevantEditionIds = [...new Set(apps.map(a => a.editionId))];
    const fieldsToInclude = (db.formFields || []).filter(f => relevantEditionIds.includes(f.editionId));
    fieldsToInclude.sort((a, b) => {
      if (a.editionId !== b.editionId) return a.editionId.localeCompare(b.editionId);
      return (a.orderIndex || 0) - (b.orderIndex || 0);
    });

    const dynamicHeaders = fieldsToInclude.map(f => {
      const editionName = editions.find(e => e.id === f.editionId)?.name || f.editionId;
      return `[${editionName}] ${f.num ? f.num + ': ' : ''}${f.label || f.text || f.id}`;
    });

    const headers = [...fixedHeaders, ...dynamicHeaders];

    let csvContent = headers.join(',') + "\n";

    apps.forEach(app => {
      const u = users.find(x => x.id === app.userId) || {};
      const ed = editions.find(x => x.id === app.editionId) || {};
      const score = calculateApplicationScore(app.id);
      const max = calculateApplicationMaxScore(app.id) || 1;
      const pct = ((score / max) * 100).toFixed(1) + '%';

      // 1. Reform Area Statuses
      const rasList = [];
      const ras = app.reformAreaStatuses || {};
      for (const [raId, status] of Object.entries(ras)) {
        const ra = db.reformAreas?.find(x => x.id === raId) || {};
        rasList.push(`${ra.name || raId}: ${status}`);
      }
      const reformAreaStatusesStr = rasList.join('\n');

      // 2. Timeline Logs ("everything happening on that particular data")
      const timelineStr = (app.timeline || []).map(t => {
        const time = t.timestamp ? new Date(t.timestamp).toLocaleString('en-IN') : '';
        const byUser = users.find(x => x.id === t.by || x.username === t.by) || {};
        const actor = byUser.username || t.by || 'system';
        return `[${time}] ${t.action} (by: ${actor})`;
      }).join('\n');

      // 3. Comments & Admin Remarks
      const commentsStr = (app.comments || []).map(c => {
        const time = c.timestamp ? new Date(c.timestamp).toLocaleString('en-IN') : '';
        const byUser = users.find(x => x.id === c.by || x.username === c.by) || {};
        const actor = byUser.username || c.by || 'user';
        return `[${time}] ${actor}: ${c.text}`;
      }).join('\n');

      // 4. Detailed Answers Breakdown (Columns)
      const answers = db.applicationAnswers?.filter(a => a.applicationId === app.id) || [];
      const dynamicRowData = fieldsToInclude.map(f => {
        if (f.editionId !== app.editionId) {
          return escapeCSV("N/A");
        }
        const ans = answers.find(a => a.fieldId === f.id);
        if (!ans) return escapeCSV("");

        let cellContent = [];
        if (ans.value !== undefined && ans.value !== null && ans.value !== '') {
          cellContent.push(`Answer: ${ans.value}`);
        }
        if (ans.files && ans.files.length > 0) {
          ans.files.forEach(file => {
            if (file.docId) {
              const docUrl = window.location.origin + `/api/files/${app.id}/${f.id}/${file.docId}`;
              cellContent.push(`=HYPERLINK("${docUrl}", "View Document: ${file.name || 'File'}")`);
            } else {
              cellContent.push(`File: ${file.name}`);
            }
          });
        }
        if (ans.adminRemarks) cellContent.push(`Admin Remarks: ${ans.adminRemarks}`);

        // If there's a HYPERLINK formula, we can't easily concatenate it with other text in CSV without breaking the formula in Excel.
        // If there's exactly one hyperlink and no other text, use just the formula.
        // Otherwise, we just join them with newlines and hope Excel parses it (it usually doesn't parse formulas if there is other text).
        // To be safe, if we have files, we will try to make the whole cell the HYPERLINK if it's the only thing, or just output text.
        const hasFormula = cellContent.some(c => c.startsWith('=HYPERLINK'));
        if (hasFormula && cellContent.length === 1) {
          return cellContent[0]; // Output raw formula
        } else if (hasFormula) {
          // Excel won't execute formulas that are combined with text in the same cell.
          // But we must output everything. We'll separate by newline and escape.
          return escapeCSV(cellContent.join('\n'));
        } else {
          return escapeCSV(cellContent.join('\n'));
        }
      });

      const row = [
        escapeCSV(u.name || ''),
        escapeCSV(app.id),
        escapeCSV(ed.name || app.editionId),
        escapeCSV(app.userId),
        escapeCSV(u.username || ''),
        escapeCSV(u.email || ''),
        escapeCSV(u.state || ''),
        escapeCSV(u.category || ''),
        escapeCSV(u.district || ''),
        escapeCSV(u.sector || ''),
        escapeCSV(u.nodalOfficer || ''),
        escapeCSV(u.startupName || ''),
        escapeCSV(app.status),
        escapeCSV(app.rejectionReason || ''),
        escapeCSV(app.additionalDocsNote || ''),
        score,
        max,
        escapeCSV(pct),
        escapeCSV(app.lastUpdatedAt || app.submittedAt || app.createdAt || ''),
        escapeCSV(reformAreaStatusesStr),
        escapeCSV(timelineStr),
        escapeCSV(commentsStr),
        ...dynamicRowData
      ];
      csvContent += row.join(',') + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `srf_applications_export_${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    showToast('CSV exported successfully.', 'success');
  });

  // ── Export Users CSV ──────────────────────────────────────────────────────
  container.querySelector('#btn-export-users-csv')?.addEventListener('click', () => {
    const db = getDb();
    const allUsers = (db.users || []).filter(u => u.role === 'user');

    const escapeCSV = (val) => {
      if (val === undefined || val === null) return '""';
      let str = String(val).trim().replace(/"/g, '""');
      return `"${str}"`;
    };

    const headers = [
      'User ID', 'Name', 'Username', 'Email',
      'Organization', 'State', 'Category', 'District', 'Sector',
      'Nodal Officer', 'Startup Name', 'Status', 'Created At'
    ];

    let csvContent = headers.join(',') + '\n';

    allUsers.forEach(u => {
      const row = [
        escapeCSV(u.id),
        escapeCSV(u.name || ''),
        escapeCSV(u.username || ''),
        escapeCSV(u.email || ''),
        escapeCSV(u.organization || ''),
        escapeCSV(u.state || ''),
        escapeCSV(u.category || ''),
        escapeCSV(u.district || ''),
        escapeCSV(u.sector || ''),
        escapeCSV(u.nodalOfficer || ''),
        escapeCSV(u.startupName || ''),
        escapeCSV(u.active === false ? 'Deactivated' : 'Active'),
        escapeCSV(u.createdAt || '')
      ];
      csvContent += row.join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `srf_users_export_${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    showToast('Users CSV exported successfully.', 'success');
  });

  // ── Export Admins CSV ─────────────────────────────────────────────────────
  container.querySelector('#btn-export-admins-csv')?.addEventListener('click', () => {
    const db = getDb();
    const admins = (db.users || []).filter(u => u.role === 'admin' || u.role === 'superadmin');

    const escapeCSV = (val) => {
      if (val === undefined || val === null) return '""';
      let str = String(val).trim().replace(/"/g, '""');
      return `"${str}"`;
    };

    const headers = [
      'User ID', 'Name', 'Username', 'Email',
      'Role', 'Organization', 'Status', 'Created At'
    ];

    let csvContent = headers.join(',') + '\n';

    admins.forEach(u => {
      const row = [
        escapeCSV(u.id),
        escapeCSV(u.name || ''),
        escapeCSV(u.username || ''),
        escapeCSV(u.email || ''),
        escapeCSV(u.role || ''),
        escapeCSV(u.organization || ''),
        escapeCSV(u.active === false ? 'Deactivated' : 'Active'),
        escapeCSV(u.createdAt || '')
      ];
      csvContent += row.join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `srf_admins_export_${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    showToast('Admins CSV exported successfully.', 'success');
  });


}

export function renderDepartmentsPanel(container) {
  const depts = getDepartments();

  // Sort departments by date/name
  depts.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  let tableRows = '';
  if (depts.length === 0) {
    tableRows = `
      <tr>
        <td colspan="5" style="text-align:center; padding: 40px; color: var(--text-muted);">
          No departments found. Click "Add Department" to create one.
        </td>
      </tr>
    `;
  } else {
    tableRows = depts.map(d => `
      <tr data-id="${d.id}">
        <td style="font-weight: 600; color: var(--text-main); font-size: 14.5px;">${d.name}</td>
        <td><span class="app-id-code" style="font-weight:700; color:var(--accent-indigo);">${d.code}</span></td>
        <td style="color: var(--text-muted); max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${d.description || ''}">${d.description || '—'}</td>
        <td style="color: var(--text-muted);">${new Date(d.createdAt).toLocaleDateString()}</td>
        <td>
          <div class="action-btns">
            <button class="btn btn-action-text btn-edit-dept" data-id="${d.id}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit
            </button>
            <button class="btn btn-action-text btn-delete-dept" data-id="${d.id}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              Delete
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  container.innerHTML = `
    <div class="section-card">
      <div class="section-badge admin-badge">Super Admin View</div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:12px;">
        <div>
          <h2 style="margin:0;">Manage Departments</h2>
          <p style="color:var(--text-muted); font-size:14px; margin-top:4px;">
            Create and manage governmental departments and organizations participating in the SRF ranking.
          </p>
        </div>
        <button class="btn btn-primary btn-sm" id="btn-add-dept">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:4px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Department
        </button>
      </div>

      <div style="margin-bottom:16px; display:flex; justify-content:flex-end;">
        <input type="text" id="dept-search-input" class="search-input-sm" placeholder="Search departments..." style="width:250px;">
      </div>

      <div style="overflow-x:auto;">
        <table class="admin-dashboard-table">
          <thead>
            <tr>
              <th>Department Name</th>
              <th>Code</th>
              <th>Description</th>
              <th>Created Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="dept-table-body">
            ${tableRows}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Search filter
  const searchInput = container.querySelector('#dept-search-input');
  searchInput.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    const rows = container.querySelectorAll('#dept-table-body tr');
    rows.forEach(row => {
      const name = row.cells[0]?.textContent.toLowerCase() || '';
      const code = row.cells[1]?.textContent.toLowerCase() || '';
      const desc = row.cells[2]?.textContent.toLowerCase() || '';
      if (name.startsWith(q) || code.startsWith(q) || desc.startsWith(q)) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    });
  });

  // Add Department button
  container.querySelector('#btn-add-dept').addEventListener('click', () => {
    openCreateDepartmentModal(container);
  });

  // Edit Department buttons
  container.querySelectorAll('.btn-edit-dept').forEach(btn => {
    btn.addEventListener('click', () => {
      openEditDepartmentModal(btn.dataset.id, container);
    });
  });

  // Delete Department buttons
  container.querySelectorAll('.btn-delete-dept').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const dept = depts.find(d => d.id === id);
      if (!dept) return;

      showConfirm({
        title: 'Delete Department',
        message: `Are you sure you want to delete "${dept.name}"? This action cannot be undone.`,
        confirmText: 'Delete',
        type: 'danger',
        onConfirm: () => {
          deleteDepartment(id);
          addAuditLog(getCurrentUser().id, `Deleted department "${dept.name}" (${dept.code})`, 'department', id);
          showToast(`Department "${dept.name}" deleted.`, 'success');
          renderDepartmentsPanel(container);
        }
      });
    });
  });
}

export function openCreateDepartmentModal(container) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop-custom visible';
  backdrop.innerHTML = `
    <div class="modal-card-custom animate-modal-in" style="max-width:500px; text-align:left;">
      <h3 class="modal-title-custom" style="margin-bottom:15px;">Add Department</h3>
      <div class="form-group" style="margin-bottom:12px;">
        <label style="display:block; font-weight:600; margin-bottom:6px; font-size:13px; color:var(--text-main);">Name *</label>
        <input type="text" id="dept-name" class="form-input" style="width:100%;" required>
      </div>
      <div class="form-group" style="margin-bottom:12px;">
        <label style="display:block; font-weight:600; margin-bottom:6px; font-size:13px; color:var(--text-main);">Code *</label>
        <input type="text" id="dept-code" class="form-input" style="width:100%;" required>
      </div>
      <div class="form-group" style="margin-bottom:20px;">
        <label style="display:block; font-weight:600; margin-bottom:6px; font-size:13px; color:var(--text-main);">Description</label>
        <textarea id="dept-desc" class="form-input" style="width:100%; height:80px;"></textarea>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:10px;">
        <button class="btn btn-secondary" id="btn-cancel-dept">Cancel</button>
        <button class="btn btn-primary" id="btn-save-dept">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  const closeModal = () => backdrop.remove();
  document.getElementById('btn-cancel-dept').addEventListener('click', closeModal);
  document.getElementById('btn-save-dept').addEventListener('click', () => {
    const name = document.getElementById('dept-name').value.trim();
    const code = document.getElementById('dept-code').value.trim();
    const desc = document.getElementById('dept-desc').value.trim();
    if (!name || !code) {
      showToast('Name and Code are required.', 'error');
      return;
    }
    const dept = createDepartment({ name, code, description: desc });
    addAuditLog(getCurrentUser().id, `Created department "${dept.name}" (${dept.code})`, 'department', dept.id);
    showToast('Department created successfully', 'success');
    closeModal();
    renderDepartmentsPanel(container);
  });
}

export function openEditDepartmentModal(deptId, container) {
  const depts = getDepartments();
  const dept = depts.find(d => d.id === deptId);
  if (!dept) return;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop-custom visible';
  backdrop.innerHTML = `
    <div class="modal-card-custom animate-modal-in" style="max-width:500px; text-align:left;">
      <h3 class="modal-title-custom" style="margin-bottom:15px;">Edit Department</h3>
      <div class="form-group" style="margin-bottom:12px;">
        <label style="display:block; font-weight:600; margin-bottom:6px; font-size:13px; color:var(--text-main);">Name *</label>
        <input type="text" id="dept-name" class="form-input" value="${dept.name}" style="width:100%;" required>
      </div>
      <div class="form-group" style="margin-bottom:12px;">
        <label style="display:block; font-weight:600; margin-bottom:6px; font-size:13px; color:var(--text-main);">Code *</label>
        <input type="text" id="dept-code" class="form-input" value="${dept.code}" style="width:100%;" required>
      </div>
      <div class="form-group" style="margin-bottom:20px;">
        <label style="display:block; font-weight:600; margin-bottom:6px; font-size:13px; color:var(--text-main);">Description</label>
        <textarea id="dept-desc" class="form-input" style="width:100%; height:80px;">${dept.description || ''}</textarea>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:10px;">
        <button class="btn btn-secondary" id="btn-cancel-dept">Cancel</button>
        <button class="btn btn-primary" id="btn-save-dept">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  const closeModal = () => backdrop.remove();
  document.getElementById('btn-cancel-dept').addEventListener('click', closeModal);
  document.getElementById('btn-save-dept').addEventListener('click', () => {
    const name = document.getElementById('dept-name').value.trim();
    const code = document.getElementById('dept-code').value.trim();
    const desc = document.getElementById('dept-desc').value.trim();
    if (!name || !code) {
      showToast('Name and Code are required.', 'error');
      return;
    }
    updateDepartment(deptId, { name, code, description: desc });
    addAuditLog(getCurrentUser().id, `Updated department "${name}" (${code})`, 'department', deptId);
    showToast('Department updated successfully', 'success');
    closeModal();
    renderDepartmentsPanel(container);
  });
}

export async function renderAdminsPanel(container) {
  container.innerHTML = `
    <div class="page-header" style="margin-bottom:24px;">
      <div>
        <div class="page-eyebrow" style="color: #ea580c; background: #ffedd5; padding: 4px 12px; border-radius: 6px; display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 12px;">Security Engine</div>
        <h1 class="page-title">Manage Admins</h1>
        <p class="page-subtitle">View and manage all system administrators securely via PostgreSQL API layer.</p>
      </div>
      <div style="display:flex;gap:10px; align-items:center;">
        <button class="btn btn-primary btn-lg" id="btn-create-admin-new">+ Create Admin</button>
      </div>
    </div>
    <div id="admins-loading">
      <div style="padding: 40px; text-align: center; color: var(--text-muted);">
        <svg style="animation: spin 1s linear infinite; margin-bottom: 12px;" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" stroke-width="2" stroke-opacity="0.3"></circle><path d="M12 2a10 10 0 0 1 10 10" stroke-width="2"></path></svg>
        <p>Fetching Secure Administrators...</p>
      </div>
    </div>
  `;

  try {
    const admins = await fetchAllAdmins();
    const rows = admins.map(u => `
      <tr>
        <td><code style="font-size:11px;">${String(u.id).substring(0, 8)}...</code></td>
        <td><strong>${u.name || u.username}</strong><br><small style="color:var(--text-muted)">${u.username}</small></td>
        <td style="word-break:break-all;">${u.email || '—'}</td>
        <td><span class="role-badge" style="font-size:11px;background:var(--accent-indigo);color:#fff">${u.role}</span></td>
        <td>${u.organization || '—'}</td>
        <td>${u.state || '—'}</td>
        <td><code style="font-size:11px;">${u.lastIp || 'N/A'}</code></td>
        <td><span style="font-size:11.5px;color:var(--text-muted)">${u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'Never'}</span></td>
        <td>
          <div class="action-btns" style="flex-wrap:wrap; gap:8px;">
            ${u.username !== 'superadmin' ? `<button class="btn btn-action-text btn-primary btn-edit-admin" data-id="${u.id}" style="padding:4px 8px;font-size:11px;">✏️ Edit</button><button class="btn btn-action-text btn-danger btn-del-admin" data-id="${u.id}" style="padding:4px 8px;font-size:11px;">🗑️ Delete</button>` : '<span style="font-size:11px;color:var(--success);font-weight:600;">System</span>'}
          </div>
        </td>
      </tr>
    `).join('');

    container.innerHTML = `
      <div class="page-header" style="margin-bottom:24px;">
        <div>
          <div class="page-eyebrow" style="color: #ea580c; background: #ffedd5; padding: 4px 12px; border-radius: 6px; display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 12px;">Security Access</div>
          <h1 class="page-title">Native Administrators</h1>
          <p class="page-subtitle">Highly privileged Administrative users natively tracked in PostgreSQL cluster.</p>
        </div>
        <div style="display:flex;gap:10px; align-items:center;">
          <button class="btn btn-primary btn-lg" id="btn-create-admin-new">+ Create Admin</button>
        </div>
      </div>
      <div class="card glass-card">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
          <h2>Security Cluster (${admins.length})</h2>
          <input type="text" id="admin-search" placeholder="Search admins..." class="search-input-sm">
        </div>
        <div class="card-body p-0">
          <div style="overflow-x:auto;">
            <table class="admin-dashboard-table" style="table-layout:fixed;min-width:1050px;width:100%;">
              <colgroup>
                <col style="width:90px">
                <col style="width:140px">
                <col style="width:180px">
                <col style="width:110px">
                <col style="width:120px">
                <col style="width:120px">
                <col style="width:120px">
                <col style="width:160px">
                <col style="width:90px">
              </colgroup>
              <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Dept</th><th>State</th><th>Last IP</th><th>Last Login</th><th>Actions</th></tr></thead>
              <tbody id="admins-tbody">${rows}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    container.querySelector('#btn-create-admin-new')?.addEventListener('click', () => {
      openCreateAdminModal(container);
    });

    const tbody = container.querySelector('#admins-tbody');
    if (tbody) {
      tbody.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.btn-edit-admin');
        if (editBtn) {
          const id = editBtn.dataset.id;
          const targetAdmin = admins.find(a => a.id === id);
          if (targetAdmin) openEditAdminModal(targetAdmin, container);
        }

        const delBtn = e.target.closest('.btn-del-admin');
        if (delBtn) {
          const id = delBtn.dataset.id;
          if (confirm('Are you strictly sure you want to permanently delete this Admin Account? This destructive action cannot be undone.')) {
            try {
              delBtn.disabled = true;
              delBtn.textContent = '...';
              await deleteAdminAPI(id);
              addAuditLog(getCurrentUser().id, 'Permanently deleted administrative profile', 'admin', id);
              renderAdminsPanel(container); // Reload grid
            } catch (err) {
              showToast(err.message, 'error');
              delBtn.disabled = false;
              delBtn.textContent = '🗑️ Delete';
            }
          }
        }
      });
    }

  } catch (e) {
    container.innerHTML += `< div style = "color:var(--danger);padding:40px;text-align:center;" > Failed to load admins: ${e.message}</div > `;
  }
}

export function openEditAdminModal(admin, container) {
  const depts = getDepartments();
  const deptOptionsHtml = depts.map(d => `<option value="${d.name}">${d.name} (${d.code})</option>`).join('');

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop-custom';
  backdrop.innerHTML = `
    <div class="modal-card-custom animate-modal-in" style="max-width: 600px;">
      <h3 class="modal-title-custom">Update Admin Metadata</h3>
      <p class="modal-msg-custom">Modify institutional access parameters below.</p>
      <form id="edit-admin-form" style="text-align: left;" autocomplete="off">
        <div class="form-group-row">
          <div class="form-group">
            <label for="edit-admin-state">State / UT</label>
            <select id="edit-admin-state" class="form-select">
              <option value="">Select State</option>
              ${allStates.map(st => `<option value="${st}" ${st === admin.state ? 'selected' : ''}>${st}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="edit-admin-district">District</label>
            <select id="edit-admin-district" class="form-select">
              <option value="${admin.district || ''}">${admin.district || 'Select District'}</option>
            </select>
          </div>
        </div>
        <div class="form-group-row">
          <div class="form-group">
            <label for="edit-admin-name">Full Name</label>
            <input type="text" id="edit-admin-name" required value="${admin.name || admin.username}">
          </div>
          <div class="form-group">
            <label for="edit-admin-org">Organization / Department</label>
            <input type="text" id="edit-admin-org" required class="form-input" list="edit-admin-org-options" value="${admin.organization || ''}">
            <datalist id="edit-admin-org-options">
              <option value="Department of Industries & Commerce (IND)">Department of Industries & Commerce (IND)</option>
              <option value="Department of Information Technology (IT)">Department of Information Technology (IT)</option>
              <option value="Department of Science & Technology (SNT)">Department of Science & Technology (SNT)</option>
              <option value="Department of Finance (FIN)">Department of Finance (FIN)</option>
              <option value="Department of Environment & Forests (ENV)">Department of Environment & Forests (ENV)</option>
            </datalist>
          </div>
        </div>
        <div class="modal-actions-custom" style="margin-top: 24px;">
          <button type="button" class="btn btn-secondary" id="cancel-edit-admin">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Changes</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('visible'));

  const form = backdrop.querySelector('#edit-admin-form');
  const cancelBtn = backdrop.querySelector('#cancel-edit-admin');
  const stateSelect = backdrop.querySelector('#edit-admin-state');
  const districtSelect = backdrop.querySelector('#edit-admin-district');

  stateSelect.addEventListener('change', (e) => {
    const selectedState = e.target.value;
    districtSelect.innerHTML = '<option value="">Select District</option>';
    const districts = statesDistrictsData[selectedState] || statesDistrictsData["default"] || [];
    districts.forEach(dist => {
      const opt = document.createElement('option');
      opt.value = dist;
      opt.textContent = dist;
      districtSelect.appendChild(opt);
    });
  });

  const close = () => {
    backdrop.classList.remove('visible');
    setTimeout(() => backdrop.remove(), 200);
  };

  cancelBtn.addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = backdrop.querySelector('#edit-admin-name').value.trim();
    const organization = backdrop.querySelector('#edit-admin-org').value;
    const state = backdrop.querySelector('#edit-admin-state').value || '';
    const district = backdrop.querySelector('#edit-admin-district').value || '';

    if (!name || !organization) {
      showToast('Name and Organization are structurally required.', 'error');
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    try {
      await updateAdminAPI(admin.id, { name, organization, state, district });
      addAuditLog(getCurrentUser().id, 'Updated Admin metadata successfully', 'admin', admin.id);
      close();
      renderAdminsPanel(container);
    } catch (err) {
      showToast(err.message, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Changes';
    }
  });
}

export function openEditUserModal(user, container) {
  const depts = getDepartments();
  const deptOptionsHtml = depts.map(d => `<option value="${d.name}">${d.name} (${d.code})</option>`).join('');

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop-custom';
  backdrop.innerHTML = `
    <div class="modal-card-custom animate-modal-in" style="max-width: 600px;">
      <h3 class="modal-title-custom">Update User Record Metadata</h3>
      <p class="modal-msg-custom">Modify granular access, category, and sector parameters below.</p>
      <form id="edit-user-form" style="text-align: left;" autocomplete="off">
        <div class="form-group-row">
          <div class="form-group">
            <label for="edit-user-state">State / UT</label>
            <select id="edit-user-state" class="form-select">
              <option value="">Select State</option>
              ${allStates.map(st => `<option value="${st}" ${st === user.state ? 'selected' : ''}>${st}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="edit-user-district">District</label>
            <select id="edit-user-district" class="form-select">
              <option value="${user.district || ''}">${user.district || 'Select District'}</option>
            </select>
          </div>
        </div>
        <div class="form-group-row">
          <div class="form-group">
            <label for="edit-user-name">Full Name</label>
            <input type="text" id="edit-user-name" required value="${user.name || user.username}">
          </div>
          <div class="form-group">
            <label for="edit-user-org">Organization / Department</label>
            <input type="text" id="edit-user-org" required class="form-input" list="edit-org-options" value="${user.organization || ''}">
            <datalist id="edit-org-options">
              <option value="Department of Industries & Commerce (IND)">Department of Industries & Commerce (IND)</option>
              <option value="Department of Information Technology (IT)">Department of Information Technology (IT)</option>
              <option value="Department of Science & Technology (SNT)">Department of Science & Technology (SNT)</option>
              <option value="Department of Finance (FIN)">Department of Finance (FIN)</option>
              <option value="Department of Environment & Forests (ENV)">Department of Environment & Forests (ENV)</option>
              ${deptOptionsHtml}
            </datalist>
          </div>
        </div>
        <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 16px 0;">
        <div class="form-group-row">
          <div class="form-group">
            <label for="edit-user-category">Startup Category</label>
            <select id="edit-user-category" class="form-select">
              <option value="">Select Category (Optional)</option>
              <option value="Technology" ${user.category === 'Technology' ? 'selected' : ''}>Technology</option>
              <option value="Healthcare" ${user.category === 'Healthcare' ? 'selected' : ''}>Healthcare</option>
              <option value="Agriculture" ${user.category === 'Agriculture' ? 'selected' : ''}>Agriculture</option>
              <option value="FinTech" ${user.category === 'FinTech' ? 'selected' : ''}>FinTech</option>
              <option value="E-Commerce" ${user.category === 'E-Commerce' ? 'selected' : ''}>E-Commerce</option>
              <option value="Education" ${user.category === 'Education' ? 'selected' : ''}>Education</option>
              <option value="Other" ${user.category === 'Other' ? 'selected' : ''}>Other</option>
            </select>
          </div>
          <div class="form-group">
            <label for="edit-user-sector">Sector</label>
            <select id="edit-user-sector" class="form-select">
              <option value="">Select Sector (Optional)</option>
              <option value="Private" ${user.sector === 'Private' ? 'selected' : ''}>Private</option>
              <option value="Public" ${user.sector === 'Public' ? 'selected' : ''}>Public</option>
              <option value="Hybrid" ${user.sector === 'Hybrid' ? 'selected' : ''}>Hybrid</option>
            </select>
          </div>
        </div>
        <div class="form-group-row">
          <div class="form-group">
            <label for="edit-user-startupname" style="width:100%;">Startup / Company Name</label>
            <input type="text" id="edit-user-startupname" style="width:100%" placeholder="e.g. TechCorp Innovations (Optional)" value="${user.startupName || ''}">
          </div>
        </div>
        
        <div class="modal-actions-custom" style="margin-top: 24px;">
          <button type="button" class="btn btn-secondary" id="cancel-edit-user">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Changes</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('visible'));

  const form = backdrop.querySelector('#edit-user-form');
  const cancelBtn = backdrop.querySelector('#cancel-edit-user');
  const stateSelect = backdrop.querySelector('#edit-user-state');
  const districtSelect = backdrop.querySelector('#edit-user-district');

  stateSelect.addEventListener('change', (e) => {
    const selectedState = e.target.value;
    districtSelect.innerHTML = '<option value="">Select District</option>';
    const districts = statesDistrictsData[selectedState] || statesDistrictsData["default"] || [];
    districts.forEach(dist => {
      const opt = document.createElement('option');
      opt.value = dist;
      opt.textContent = dist;
      districtSelect.appendChild(opt);
    });
  });

  const close = () => {
    backdrop.classList.remove('visible');
    setTimeout(() => backdrop.remove(), 200);
  };

  cancelBtn.addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = backdrop.querySelector('#edit-user-name').value.trim();
    const organization = backdrop.querySelector('#edit-user-org').value;
    const state = backdrop.querySelector('#edit-user-state').value || '';
    const district = backdrop.querySelector('#edit-user-district').value || '';
    const category = backdrop.querySelector('#edit-user-category').value || '';
    const sector = backdrop.querySelector('#edit-user-sector').value || '';
    const startupName = backdrop.querySelector('#edit-user-startupname').value.trim();

    if (!name || !organization) {
      showToast('Name and Organization are structurally required.', 'error');
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    try {
      await updateUserAPI(user.id, { name, organization, state, district, category, sector, startupName });
      addAuditLog(getCurrentUser().id, 'Updated User metadata natively', 'user', user.id);
      close();
      renderUsersPanel(container);
    } catch (err) {
      showToast(err.message, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Changes';
    }
  });
}
