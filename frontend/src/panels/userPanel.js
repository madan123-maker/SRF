import { userPanel, adminPanel, uiState } from '../core/app.js';
import { getCurrentUser } from '../auth/auth.js';
import { getApplicationsByUser, getUnreadCount, getDb, getApplicationById, getAnswersByApplication, getEditions, getPendingAssignmentsCount, getEditionById, createApplication, addAuditLog, addNotification, getAssignments, calculateApplicationProgress, calculateApplicationScore, calculateApplicationMaxScore, getFieldById, getFieldsByEdition, forceSave, updateUser, getSectionsByEdition, getFieldsBySection, isSectionAssignedToUser as isSectionAssignedToUserStore, isFieldAssignedToUser as isFieldAssignedToUserStore } from '../db/store.js';
import { openApplicationForm, _timeAgo, _userFacingStatus, _statusClass } from '../panels/applicationForm.js';
import { pushToNavHistory, cleanupAllHeartbeats } from '../core/bootstrap.js';
import { renderUserDashboardEnhanced, renderTabbedApplicationWorkspace } from '../modules/advancedDashboard.js';
import { renderNotificationsPage } from '../panels/notifications.js';
import { renderMessagesTab } from '../panels/profileMessages.js';
import { showToast } from '../ui/toastManager.js';
import { showConfirm, showAlert } from '../ui/confirmDialog.js';
import { statesDistrictsData } from '../data/geoData.js';
import { openChangePasswordModal } from '../auth/authModals.js';


export function renderUserPortal() {
  userPanel.classList.remove('hidden');
  adminPanel.classList.add('hidden');
  renderUserSidebar();
  const preservedTab = sessionStorage.getItem('srf_active_user_tab') || 'dashboard';
  switchUserTab(preservedTab);
}

export function renderUserSidebar() {
  const user = getCurrentUser();
  const nav = document.getElementById('sidebar-nav-container');
  document.getElementById('sidebar-title').textContent = 'My Portal';

  const userApps = getApplicationsByUser(user.id);
  const draftCount = userApps.filter(a => a.status === 'Draft').length;
  const unread = getUnreadCount(user.id);
  const unreadMessages = (getDb().messages || []).filter(m => m.receiverId === user.id && !m.read).length;

  const exploreCount = getApplicationsByUser(user.id).filter(a =>
    ['Draft', 'Submitted', 'Resubmitted', 'Under Review', 'Additional Documents Requested'].includes(a.status)
  ).length;

  const tabs = [
    { id: 'dashboard', label: 'My Dashboard', icon: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>', badge: '' },
    { id: 'assigned-editions', label: 'Assigned Editions', icon: '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>', badge: '' },
    { id: 'explore', label: 'Explore Applications', icon: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>', badge: exploreCount > 0 ? String(exploreCount) : '' },
    { id: 'apply', label: 'Start New Application', icon: '<path d="M12 5v14M5 12h14"/>', badge: '' },
    { id: 'drafts', label: 'Drafts', icon: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/>', badge: draftCount > 0 ? String(draftCount) : '' },
    { id: 'approved', label: 'Approved', icon: '<circle cx="12" cy="12" r="10"/><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>', badge: '' },
    { id: 'rejected', label: 'Rejected', icon: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>', badge: '' },
    { id: 'notifications', label: 'Notifications', icon: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>', badge: unread > 0 ? String(unread) : '' },
    { id: 'messages', label: 'Messages', icon: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', badge: unreadMessages > 0 ? String(unreadMessages) : '' },
    { id: 'profile', label: 'My Profile', icon: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', badge: '' }
  ];

  let sidebarHtml = tabs.map(t => `
    <a href="#" class="nav-item ${uiState.activeUserTab === t.id ? 'active' : ''}" data-tab="${t.id}">
      <span class="nav-item-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${t.icon}</svg>
      </span>
      <span class="nav-item-text">${t.label}</span>
      ${t.badge ? `<span class="nav-item-badge" style="margin-left:auto;background:var(--accent-indigo);color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:99px;">${t.badge}</span>` : ''}
    </a>
  `).join('');

  if (uiState.activeUserTab === 'form' && uiState.activeApplicationId) {
    const app = getApplicationById(uiState.activeApplicationId);
    if (app) {
      const allSections = getSectionsByEdition(app.editionId);
      const sections = allSections.filter(sec => isSectionAssignedToUser(sec, user));
      const answers = getAnswersByApplication(uiState.activeApplicationId);
      const answersMap = {};
      answers.forEach(a => { answersMap[a.fieldId] = a; });

      const sectionNav = sections.map(sec => {
        let fields = getFieldsBySection(sec.id).filter(f => isFieldAssignedToUser(f, user));
        const answered = fields.filter(f => answersMap[f.id]?.value).length;
        const secNum = (sec.num && sec.num !== 'undefined') ? sec.num : String(sec.orderIndex + 1);
        const secTitle = String((sec.name && sec.name !== 'undefined') ? sec.name : ((sec.title && sec.title !== 'undefined') ? sec.title : ''));
        return `
          <a href="#" class="nav-item section-nav-item ${sec.id === window.activeSectionId ? 'active' : ''}" data-sec="${sec.id}" style="padding-left: 20px;">
            <span class="nav-item-num" style="font-size:10px;min-width:28px;">S${secNum}</span>
            <span class="nav-item-text" style="font-size:13px;">${secTitle.replace(/^Section \d+:\s*/, '')}</span>
            <span class="nav-item-badge" style="margin-left:auto;font-size:11px;opacity:0.8;">${answered}/${fields.length}</span>
          </a>
        `;
      }).join('');

      sidebarHtml += `
        <div class="sidebar-divider" style="height: 1px; background: var(--border-color); margin: 12px 0;"></div>
        <div class="sidebar-section-header" style="margin: 8px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em;">Application Sections</div>
        ${sectionNav}
      `;
    }
  }

  nav.innerHTML = sidebarHtml;

  // Add click listeners to main nav items
  nav.querySelectorAll('.nav-item[data-tab]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      window.workspaceLock = false;
      switchUserTab(item.dataset.tab);
    });
  });

  // Add click listeners to section nav items
  nav.querySelectorAll('.nav-item[data-sec]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      window.activeSectionId = item.dataset.sec;
      if (window.activeUserFormContainer) {
        openApplicationForm(uiState.activeApplicationId, window.activeUserFormContainer);
      }
    });
  });

  // Sidebar footer: overall progress
  const apps = getApplicationsByUser(user.id);
  document.getElementById('sidebar-footer').innerHTML = `
    <div class="progress-box">
      <div class="progress-details">
        <span style="font-size:12px;color:var(--text-muted);">Recently Opened</span>
        <span style="font-size:13px;font-weight:700;color:var(--accent-indigo)">${apps.length}</span>
      </div>
      <div class="progress-details" style="margin-top:4px;">
        <span style="font-size:12px;color:var(--text-muted);">Approved</span>
        <span style="font-size:13px;font-weight:700;color:var(--success)">${apps.filter(a => a.status === 'Approved').length}</span>
      </div>
    </div>
  `;
}

export function switchUserTab(tab) {
  pushToNavHistory({ role: 'user', tab });
  cleanupAllHeartbeats();

  if (window.chatPollingInterval) {
    clearInterval(window.chatPollingInterval);
    window.chatPollingInterval = null;
  }
  uiState.currentFormAllowRemainingUploads = false;
  uiState.activeUserTab = tab;
  sessionStorage.setItem('srf_active_user_tab', tab);
  renderUserSidebar();
  document.querySelectorAll('#sidebar-nav-container .nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.tab === tab);
  });
  ['user-dashboard-view', 'user-form-view', 'user-history-view'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });

  const mainView = document.getElementById('user-dashboard-view');
  mainView.classList.remove('hidden');

  switch (tab) {
    case 'dashboard': renderUserDashboardEnhanced(mainView); break;
    case 'assigned-editions': renderAssignedEditionsPage(mainView); break;
    case 'explore': renderExploreApplications(mainView); break;
    case 'apply': renderApplyPage(mainView); break;
    case 'drafts': renderUserAppsFiltered(mainView, 'Draft'); break;
    case 'approved': renderUserAppsFiltered(mainView, 'Approved'); break;
    case 'rejected': renderUserAppsFiltered(mainView, 'Rejected'); break;
    case 'notifications': renderNotificationsPage(mainView); break;
    case 'profile': renderUserProfilePage(mainView); break;
    case 'messages': renderMessagesTab(mainView); break;
  }
}

export function renderApplyPage(container) {
  const user = getCurrentUser();
  const apps = getApplicationsByUser(user.id);

  const publishedEditions = getEditions().filter(e => {
    // Hide editions that have already been applied to (unless Rejected or Draft)
    const hasActiveApp = apps.some(a => a.editionId === e.id && a.status !== 'Rejected' && a.status !== 'Draft');
    if (hasActiveApp) return false;

    // Hide editions with 0 reform areas/sections
    const allSections = getSectionsByEdition(e.id) || [];
    if (allSections.length === 0) return false;

    if (e.status !== 'published') return false;

    const sections = allSections.filter(sec => isSectionAssignedToUser(sec, user));
    return sections.length > 0;
  });

  container.innerHTML = `
    <div class="section-card" style="margin-bottom:24px;">
      <div class="section-badge" style="background:rgba(79,70,229,0.08);color:var(--accent-indigo);border:1px solid rgba(79,70,229,0.15);">Explore Applications</div>
      <h1>Explore Applications</h1>
      <p style="color:var(--text-muted);font-size:14px;">Select an edition to begin your SRF compliance submission.</p>
    </div>

    ${publishedEditions.length === 0 ? `
      <div class="empty-state">
        <h3>No active editions</h3>
        <p>No SRF editions are currently published and accepting applications. Please check back later.</p>
      </div>
    ` : `
      <div class="editions-grid">
        ${publishedEditions.map(ed => {
    const sections = getSectionsByEdition(ed.id).filter(sec => isSectionAssignedToUser(sec, user));
    const fields = sections.reduce((acc, sec) => {
      const secFields = getFieldsBySection(sec.id).filter(f => isFieldAssignedToUser(f, user));
      return acc + secFields.length;
    }, 0);
    const pendingTasks = getPendingAssignmentsCount(user.id, ed.id);
    return `
            <div class="edition-card" style="cursor:pointer;" data-edition-id="${ed.id}">
              <div class="edition-card-header">
                <div class="edition-card-title-row">
                  <div class="edition-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg></div>
                  <div><h3 class="edition-name">${ed.name}</h3><p class="edition-desc">${ed.description || ''}</p></div>
                </div>
                ${pendingTasks > 0 ? `<span class="badge" style="background:#ec4899; color:#fff; font-size:11px; padding:3px 8px; border-radius:99px; font-weight:700;">${pendingTasks} Pending</span>` : `<span style="display:inline-block;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700;background:rgba(16,185,129,0.1);color:#10b981;">Active</span>`}
              </div>
              <div class="edition-stats-row">
                <div class="edition-stat"><span class="estat-value">${sections.length}</span><span class="estat-label">Sections</span></div>
                <div class="edition-stat"><span class="estat-value">${fields}</span><span class="estat-label">Questions</span></div>
                <div class="edition-stat"><span class="estat-value">${ed.totalMarks || '—'}</span><span class="estat-label">Total Marks</span></div>
              </div>
              <div class="edition-card-footer">
                <span class="edition-date">${ed.startDate ? 'From: ' + ed.startDate : ''} ${ed.endDate ? 'To: ' + ed.endDate : ''}</span>
                <button class="btn btn-primary btn-sm btn-start-app" data-edition-id="${ed.id}">Apply Now</button>
              </div>
            </div>
          `;
  }).join('')}
      </div>
    `}
  `;

  container.querySelectorAll('.btn-start-app').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      startNewApplication(btn.dataset.editionId, container);
    });
  });

  container.querySelectorAll('.edition-card[data-edition-id]').forEach(card => {
    card.addEventListener('click', () => startNewApplication(card.dataset.editionId, container));
  });
}

export function startNewApplication(editionId, container) {
  const user = getCurrentUser();
  const ed = getEditionById(editionId);
  const fy = ed ? (ed.fiscalYear || ed.duration || 'FY 2025-26') : 'FY 2025-26';
  const category = user.category;
  if (!category) {
    showToast('No category specified in profile, defaulting to Category A1 (cat_a1)', 'warning');
  }
  const app = createApplication(user.id, editionId, category || 'cat_a1', fy);
  addAuditLog(user.id, `Created/opened application for edition ${editionId}`, 'application', app.id);
  addNotification(user.id, 'DRAFT_SAVED', `Draft application created for "${ed?.name || editionId}". Continue editing from Explore Applications.`, app.id);

  // Redirect to Explore Applications (Drafts tab) instead of opening form directly
  window.exploreAppsState = window.exploreAppsState || {};
  window.exploreAppsState.activeTab = 'Drafts';
  uiState.activeUserTab = 'explore';
  renderUserSidebar();
  switchUserTab('explore');
  showToast(`Draft created for "${ed?.name || editionId}". Click Continue to start filling.`, 'success');
}

export function renderAssignedEditionsPage(container) {
  const user = getCurrentUser();
  const rawUserAssignments = getAssignments ? getAssignments(user.id) : [];
  const userAssignments = rawUserAssignments.filter(isAssignmentValid);

  const assignedEditionIds = [...new Set(userAssignments.map(a => a.editionId))];
  const apps = getApplicationsByUser(user.id);

  // Categorize editions into 3 clean tabs
  const activeEditions = []; // No application yet → Start Application
  const startedEditions = []; // Draft or Docs Requested → Continue
  const completedEditions = []; // Submitted, Approved, Rejected → View Submission

  assignedEditionIds.forEach(eid => {
    const ed = getEditionById(eid);
    if (!ed || ed.status !== 'published') return;

    const edApps = apps.filter(a => a.editionId === eid);
    edApps.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const app = edApps[0];

    const editionAssignments = userAssignments.filter(a => a.editionId === eid);
    const assignedDate = editionAssignments[0]?.createdAt
      ? new Date(editionAssignments[0].createdAt).toLocaleDateString('en-IN')
      : (ed.startDate ? new Date(ed.startDate).toLocaleDateString('en-IN') : 'N/A');
    const dueDate = ed.endDate ? new Date(ed.endDate).toLocaleDateString('en-IN') : 'N/A';

    const cardData = { ed, app, assignedDate, dueDate };

    if (!app) {
      activeEditions.push(cardData);
    } else if (app.status === 'Draft' || app.status === 'Additional Documents Requested') {
      startedEditions.push(cardData);
    } else {
      // Submitted, Under Review, Resubmitted, Approved, Rejected
      completedEditions.push(cardData);
    }
  });

  if (window.assignedEditionsFilterTab === undefined) {
    window.assignedEditionsFilterTab = 'active';
  }
  const curTab = window.assignedEditionsFilterTab;

  // Countdown helper
  const getCountdown = (ed) => {
    if (!ed.endDate) return { text: 'No deadline', cls: '' };
    const diff = new Date(ed.endDate) - new Date();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days > 0) return { text: `⏳ ${days} days left`, cls: '' };
    if (days === 0) return { text: '⏰ Due today', cls: 'color:var(--warning)' };
    return { text: `🛑 Overdue by ${Math.abs(days)} days`, cls: 'color:var(--danger)' };
  };

  // Progress helper using required questions
  const getProgress = (appId, editionId) => {
    if (!appId) return 0;
    const prog = calculateApplicationProgress ? calculateApplicationProgress(appId) : null;
    if (prog && typeof prog.percentage === 'number') return prog.percentage;
    // fallback
    const score = calculateApplicationScore(appId) || 0;
    const max = calculateApplicationMaxScore(appId) || 1;
    return Math.round((score / max) * 100);
  };

  // ── Render: Active Assignments ──
  const renderActiveCard = (c) => {
    const cd = getCountdown(c.ed);
    return `
      <div class="glass-card glass-card-enhanced status-border-blue" style="padding:20px; display:flex; flex-direction:column; gap:12px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <h3 style="font-size:14px; font-weight:700; margin:0 0 4px 0; color:var(--text-main);">${c.ed.name}</h3>
            <span style="font-size:11px; color:var(--text-muted);">${c.ed.duration || c.ed.version || 'Annual'}</span>
          </div>
          <span class="status-badge status-draft" style="font-size:9px;">Not Started</span>
        </div>
        <p style="font-size:12.5px; color:var(--text-muted); margin:0; height:36px; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${c.ed.description || 'No description available.'}</p>
        <div style="display:flex; justify-content:space-between; font-size:11.5px; color:var(--text-muted); padding-top:8px; border-top:1px dashed var(--border-color);">
          <span>Assigned: <strong>${c.assignedDate}</strong></span>
          <span style="${cd.cls}">${cd.text}</span>
        </div>
        <button class="btn btn-primary btn-sm btn-assigned-action" data-action="start" data-edition-id="${c.ed.id}" style="width:100%; font-weight:600;">
          ▶ Start Application
        </button>
      </div>
    `;
  };

  // ── Render: Started (Draft) ──
  const renderStartedCard = (c) => {
    const cd = getCountdown(c.ed);
    const pct = getProgress(c.app?.id, c.ed.id);
    const lastEdited = c.app?.updatedAt ? _timeAgo(c.app.updatedAt) : 'N/A';
    const score = calculateApplicationScore(c.app?.id) || 0;
    const maxScore = calculateApplicationMaxScore(c.app?.id) || 1;
    const colorCls = c.app?.status === 'Additional Documents Requested' ? 'yellow' : 'orange';
    const displayStatus = c.app?.status === 'Additional Documents Requested' ? 'Docs Requested' : 'Draft';
    const statusCls = c.app?.status === 'Additional Documents Requested' ? 'status-add-docs' : 'status-draft';
    return `
      <div class="glass-card glass-card-enhanced status-border-${colorCls}" style="padding:20px; display:flex; flex-direction:column; gap:12px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <h3 style="font-size:14px; font-weight:700; margin:0 0 4px 0; color:var(--text-main);">${c.ed.name}</h3>
            <code style="font-size:10px; color:var(--text-muted); background:rgba(255,255,255,0.04); padding:1px 5px; border-radius:3px;">${c.app?.id || ''}</code>
          </div>
          <span class="status-badge ${statusCls}" style="font-size:9px;">${displayStatus}</span>
        </div>
        <div>
          <div style="display:flex; justify-content:space-between; font-size:11.5px; color:var(--text-muted); margin-bottom:4px;">
            <span>Progress</span><strong>${pct}%</strong>
          </div>
          <div style="height:6px; background:var(--border-color); border-radius:3px; overflow:hidden;">
            <div style="width:${pct}%; height:100%; background:var(--accent-${colorCls}); border-radius:3px;"></div>
          </div>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:11.5px; color:var(--text-muted);">
          <span>Score: <strong>${score} / ${maxScore}</strong></span>
          <span>Last edited: <strong>${lastEdited}</strong></span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:11.5px; color:var(--text-muted); padding-top:8px; border-top:1px dashed var(--border-color);">
          <span>Due: <strong>${c.dueDate}</strong></span>
          <span style="${cd.cls}">${cd.text}</span>
        </div>
        <button class="btn btn-primary btn-sm btn-assigned-action" data-action="continue" data-app-id="${c.app?.id}" style="width:100%; font-weight:600;">
          ↗ Continue Editing
        </button>
      </div>
    `;
  };

  // ── Render: Completed ──
  const renderCompletedCard = (c) => {
    const userFacingStatus = _userFacingStatus(c.app?.status || '');
    const statusCls = _statusClass(c.app?.status || '');
    const score = calculateApplicationScore(c.app?.id) || 0;
    const maxScore = calculateApplicationMaxScore(c.app?.id) || 1;
    const pct = Math.round((score / maxScore) * 100);
    const submittedAt = c.app?.submittedAt ? new Date(c.app.submittedAt).toLocaleDateString('en-IN') : '—';
    let colorCls = 'purple';
    if (c.app?.status === 'Approved') colorCls = 'green';
    else if (c.app?.status === 'Rejected') colorCls = 'red';
    return `
      <div class="glass-card glass-card-enhanced status-border-${colorCls}" style="padding:20px; display:flex; flex-direction:column; gap:12px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <h3 style="font-size:14px; font-weight:700; margin:0 0 4px 0; color:var(--text-main);">${c.ed.name}</h3>
            <code style="font-size:10px; color:var(--text-muted); background:rgba(255,255,255,0.04); padding:1px 5px; border-radius:3px;">${c.app?.id || ''}</code>
          </div>
          <span class="status-badge ${statusCls}" style="font-size:9px;">${userFacingStatus}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:11.5px; color:var(--text-muted);">
          <span>Compliance Score: <strong>${score} / ${maxScore} (${pct}%)</strong></span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:11.5px; color:var(--text-muted); padding-top:8px; border-top:1px dashed var(--border-color);">
          <span>Submitted: <strong>${submittedAt}</strong></span>
          <span>Due: <strong>${c.dueDate}</strong></span>
        </div>
        ${c.app?.rejectionReason ? `<p style="color:var(--danger);font-size:12px;margin:0;font-style:italic;background:rgba(239,68,68,0.06);padding:8px 12px;border-radius:8px;border-left:3px solid var(--danger);">Reason: "${c.app.rejectionReason}"</p>` : ''}
        <button class="btn btn-outline btn-sm btn-assigned-action" data-action="view" data-app-id="${c.app?.id}" style="width:100%; font-weight:600;">
          👁 View Submission
        </button>
      </div>
    `;
  };

  let tabCards = [];
  let renderCardFn = renderActiveCard;
  let emptyMsg = '';

  if (curTab === 'active') {
    tabCards = activeEditions;
    renderCardFn = renderActiveCard;
    emptyMsg = `
      <div style="text-align:center; padding:60px 20px; color:var(--text-muted);">
        <div style="font-size:48px; margin-bottom:16px;">📋</div>
        <h3 style="font-size:16px; font-weight:700; margin-bottom:8px;">No active assignments</h3>
        <p style="font-size:13px;">All assigned editions have been started. Check the <strong>Started</strong> tab to continue editing.</p>
      </div>`;
  } else if (curTab === 'started') {
    tabCards = startedEditions;
    renderCardFn = renderStartedCard;
    emptyMsg = `
      <div style="text-align:center; padding:60px 20px; color:var(--text-muted);">
        <div style="font-size:48px; margin-bottom:16px;">📝</div>
        <h3 style="font-size:16px; font-weight:700; margin-bottom:8px;">No drafts in progress</h3>
        <p style="font-size:13px;">Start an application from the <strong>Active Assignments</strong> tab to begin.</p>
      </div>`;
  } else {
    tabCards = completedEditions;
    renderCardFn = renderCompletedCard;
    emptyMsg = `
      <div style="text-align:center; padding:60px 20px; color:var(--text-muted);">
        <div style="font-size:48px; margin-bottom:16px;">🏆</div>
        <h3 style="font-size:16px; font-weight:700; margin-bottom:8px;">No completed submissions yet</h3>
        <p style="font-size:13px;">Applications will appear here once submitted for review.</p>
      </div>`;
  }

  const tabStyle = (id) => `background:none; border:none; border-bottom: 2px solid ${curTab === id ? 'var(--primary)' : 'transparent'}; padding:8px 16px; cursor:pointer; font-size:13px; font-weight:600; color:${curTab === id ? 'var(--primary)' : 'var(--text-muted)'}; transition: color 0.2s, border-color 0.2s;`;

  container.innerHTML = `
    <div class="section-card" style="margin-bottom:24px;">
      <div class="section-badge" style="background:rgba(79,70,229,0.08);color:var(--accent-indigo);border:1px solid rgba(79,70,229,0.15);">Assigned Editions</div>
      <h1>Assigned Framework Editions</h1>
      <p style="color:var(--text-muted);font-size:14px;">Editions assigned to your department. Start applications or track their progress below.</p>
    </div>

    <div class="workspace-nav-tabs" style="margin-bottom:24px; display:flex; gap:0; border-bottom: 1px solid var(--border-color); flex-wrap:wrap;">
      <button class="workspace-tab-link" data-tab="active" style="${tabStyle('active')}">
        Active Assignments <span style="background:rgba(99,102,241,0.12);color:var(--accent-indigo);font-size:10px;font-weight:700;padding:1px 6px;border-radius:99px;margin-left:6px;">${activeEditions.length}</span>
      </button>
      <button class="workspace-tab-link" data-tab="started" style="${tabStyle('started')}">
        Started <span style="background:rgba(249,115,22,0.12);color:#f97316;font-size:10px;font-weight:700;padding:1px 6px;border-radius:99px;margin-left:6px;">${startedEditions.length}</span>
      </button>
      <button class="workspace-tab-link" data-tab="completed" style="${tabStyle('completed')}">
        Completed <span style="background:rgba(16,185,129,0.12);color:#10b981;font-size:10px;font-weight:700;padding:1px 6px;border-radius:99px;margin-left:6px;">${completedEditions.length}</span>
      </button>
    </div>

    <div id="assigned-editions-list-content">
      ${tabCards.length === 0 ? emptyMsg : `
        <div class="assigned-editions-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px;">
          ${tabCards.map(renderCardFn).join('')}
        </div>
      `}
    </div>
  `;

  // Tab click listeners
  container.querySelectorAll('.workspace-tab-link').forEach(tab => {
    tab.addEventListener('click', () => {
      window.assignedEditionsFilterTab = tab.dataset.tab;
      renderAssignedEditionsPage(container);
    });
  });

  // Action button listeners
  container.querySelectorAll('.btn-assigned-action').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'start') {
        startNewApplication(btn.dataset.editionId, container);
      } else if (action === 'continue') {
        const appId = btn.dataset.appId;
        openApplicationForm(appId, container);
      } else if (action === 'view') {
        openApplicationDetail(btn.dataset.appId, container);
      }
    });
  });
}

export function isAssignmentValid(a) {
  if (!a) return false;
  const ed = getEditionById ? getEditionById(a.editionId) : null;
  if (!ed) return false;

  const sections = getSectionsByEdition(a.editionId) || [];
  const sectionIds = new Set(sections.map(s => s.id));

  if (!a.type || a.type === 'Reform Area') {
    return sectionIds.has(a.sectionId) || sectionIds.has(a.reformAreaId);
  }

  if (a.type === 'Question') {
    const fieldId = a.questionId || a.fieldId;
    if (!fieldId) return false;
    const field = getFieldById ? getFieldById(fieldId) : null;
    return field && field.editionId === a.editionId;
  }

  if (a.type === 'Action Point') {
    if (!a.actionPointId) return false;
    const allFields = sections.flatMap(s => getFieldsBySection ? getFieldsBySection(s.id) : []);
    return allFields.some(f => f.actionPointId === a.actionPointId);
  }

  return true;
}

export function isSectionAssignedToUser(sec, user) {
  if (user.role === 'admin' || user.role === 'superadmin') return true;
  return isSectionAssignedToUserStore(sec, user.id);
}

export function isFieldAssignedToUser(f, user) {
  if (user.role === 'admin' || user.role === 'superadmin') return true;
  return isFieldAssignedToUserStore(f, user.id);
}

export function getGuidelinePageForQuestion(num) {
  if (!num) return null;
  const parts = num.split('.');
  if (parts.length < 2) return null;
  const sec = parseInt(parts[0]);
  const q = parseInt(parts[1]);
  if (isNaN(sec) || isNaN(q)) return null;

  const map = {
    // Section 1
    "1.1": 9, "1.2": 9, "1.3": 9, "1.4": 9, "1.5": 9,
    "2.1": 11, "2.2": 11, "2.3": 11,
    "3.1": 13, "3.2": 13, "3.3": 13, "3.4": 13,
    // Section 2
    "4.1": 17, "4.2": 17, "4.3": 17, "4.4": 17,
    "5.1": 19, "5.2": 19,
    "6.1": 20, "6.2": 20, "6.3": 20,
    // Section 3
    "7.1": 22,
    "8.1": 23, "8.2": 23,
    "9.1": 25, "9.2": 25,
    // Section 4
    "10.1": 28, "10.2": 28, "10.3": 28,
    "11.1": 30, "11.2": 30,
    "12.1": 32, "12.2": 32,
    // Section 5
    "13.1": 35, "13.2": 35, "13.3": 35,
    "14.1": 37, "14.2": 37, "14.3": 37, "14.4": 37,
    // Section 6
    "15.1": 40, "15.2": 40, "15.3": 40,
    "16.1": 41, "16.2": 41,
    "17.1": 43, "17.2": 43,
    // Section 7
    "18.1": 45, "19.1": 46
  };

  return map[num] || (9 + sec * 2);
}

export function renderExploreApplications(container) {
  const user = getCurrentUser();
  if (!window.exploreAppsState) {
    window.exploreAppsState = { activeTab: 'All', search: '', sortBy: 'updatedAt', sortDir: 'desc' };
  }
  const state = window.exploreAppsState;

  const TAB_STATUSES = {
    'All': ['Draft', 'Submitted', 'Resubmitted', 'Under Review', 'Additional Documents Requested'],
    'Drafts': ['Draft'],
    'Submitted': ['Submitted', 'Resubmitted', 'Under Review'],
    'Docs Requested': ['Additional Documents Requested'],
  };

  const renderContent = () => {
    const allApps = getApplicationsByUser(user.id).filter(app => {
    const ed = getEditionById(app.editionId);
    return ed && !ed.isDeleted && ed.status === 'published';
  });
    const filterStatuses = TAB_STATUSES[state.activeTab] || TAB_STATUSES['All'];
    let apps = allApps.filter(a => filterStatuses.includes(a.status));

    const q = (state.search || '').toLowerCase().trim();
    if (q) {
      apps = apps.filter(a => {
        const ed = getEditionById(a.editionId);
        return a.id.toLowerCase().includes(q) ||
          (ed ? ed.name || '' : '').toLowerCase().includes(q) ||
          (ed ? ed.framework || '' : '').toLowerCase().includes(q);
      });
    }

    apps = apps.slice().sort((a, b) => {
      const av = a[state.sortBy] || '';
      const bv = b[state.sortBy] || '';
      if (av < bv) return state.sortDir === 'asc' ? -1 : 1;
      if (av > bv) return state.sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    const counts = {};
    Object.keys(TAB_STATUSES).forEach(function (tab) {
      counts[tab] = allApps.filter(a => TAB_STATUSES[tab].includes(a.status)).length;
    });

    const tStyle = function (id) {
      return 'background:none;border:none;border-bottom:2px solid ' + (state.activeTab === id ? 'var(--primary)' : 'transparent') + ';padding:8px 16px;cursor:pointer;font-size:13px;font-weight:600;color:' + (state.activeTab === id ? 'var(--primary)' : 'var(--text-muted)') + ';transition:color 0.2s,border-color 0.2s;';
    };

    const tabsHtml = Object.keys(TAB_STATUSES).map(function (tab) {
      return '<button class="explore-tab-link" data-tab="' + tab + '" style="' + tStyle(tab) + '">' + tab + ' <span style="background:rgba(99,102,241,0.1);color:var(--accent-indigo);font-size:10px;font-weight:700;padding:1px 6px;border-radius:99px;margin-left:4px;">' + counts[tab] + '</span></button>';
    }).join('');

    const cardsHtml = apps.map(function (app) {
      const edition = getEditionById(app.editionId);
      const score = calculateApplicationScore(app.id) || 0;
      const maxScore = calculateApplicationMaxScore(app.id) || 1;
      const answers = getAnswersByApplication(app.id);
      const mandatory = getFieldsByEdition(app.editionId).filter(f => !f.isLayoutElement && f.mandatory);
      const filled = mandatory.filter(f => { const ans = answers.find(a => a.fieldId === f.id); return ans && ans.value && String(ans.value).trim() !== ''; });
      const progressPct = mandatory.length > 0 ? Math.round((filled.length / mandatory.length) * 100) : Math.round((score / maxScore) * 100);
      const pending = mandatory.length - filled.length;
      const displayStatus = _userFacingStatus(app.status);
      const statusCls = _statusClass(app.status);
      let colorCls = 'blue';
      if (app.status === 'Draft') colorCls = 'gray';
      else if (['Submitted', 'Resubmitted', 'Under Review'].includes(app.status)) colorCls = 'blue';
      else if (app.status === 'Additional Documents Requested') colorCls = 'orange';
      else if (app.status === 'Approved') colorCls = 'green';
      else if (app.status === 'Rejected') colorCls = 'red';
      const canEdit = ['Draft', 'Additional Documents Requested'].includes(app.status);
      const isDraft = app.status === 'Draft';
      const edName = edition ? edition.name || 'Unknown Edition' : 'Unknown Edition';
      const createdDate = new Date(app.createdAt).toLocaleDateString('en-IN');
      const lastEdited = _timeAgo(app.updatedAt);
      const rejectionHtml = (app.status === 'Rejected' && app.rejectionReason) ? '<p style="color:var(--danger);font-size:12px;margin:0;background:rgba(239,68,68,0.06);padding:8px 10px;border-radius:6px;border-left:3px solid var(--danger);">Reason: &ldquo;' + app.rejectionReason + '&rdquo;</p>' : '';
      const docsHtml = (app.status === 'Additional Documents Requested' && app.additionalDocsNote) ? '<p style="color:#f97316;font-size:12px;margin:0;background:rgba(249,115,22,0.06);padding:8px 10px;border-radius:6px;border-left:3px solid #f97316;">Action: &ldquo;' + app.additionalDocsNote + '&rdquo;</p>' : '';
      const continueBtn = canEdit ? '<button class="btn btn-primary btn-xs explore-btn-continue" data-id="' + app.id + '" style="font-weight:600;flex:1;">↗ Continue</button>' : '';
      const deleteBtn = isDraft ? '<button class="btn btn-danger btn-xs explore-btn-delete" data-id="' + app.id + '" style="font-weight:600;padding:4px 8px;">🗑</button>' : '';
      return '<div class="glass-card glass-card-enhanced" style="padding:20px;display:flex;flex-direction:column;gap:12px;border-left:3px solid var(--accent-' + colorCls + ');">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;"><code style="font-size:11px;color:var(--text-muted);background:rgba(255,255,255,0.04);padding:2px 6px;border-radius:4px;">' + app.id + '</code><span class="status-badge ' + statusCls + '" style="font-size:9.5px;">' + displayStatus + '</span></div>'
        + '<div><h3 style="font-size:15px;font-weight:700;margin:0 0 4px;color:var(--text-main);">' + edName + '</h3><p style="font-size:12px;color:var(--text-muted);margin:0;">Created: ' + createdDate + ' · Last edited: ' + lastEdited + '</p></div>'
        + '<div><div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--text-muted);margin-bottom:5px;"><span>Progress (Required)</span><strong>' + progressPct + '%</strong></div><div style="height:6px;background:var(--border-color);border-radius:3px;overflow:hidden;"><div style="width:' + progressPct + '%;height:100%;background:var(--accent-' + colorCls + ');border-radius:3px;transition:width 0.3s;"></div></div></div>'
        + '<div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--text-muted);border-top:1px dashed var(--border-color);padding-top:10px;"><span>Score: <strong>' + score + ' / ' + maxScore + '</strong></span>' + (pending > 0 ? '<span style="color:var(--warning);">⚠ ' + pending + ' pending</span>' : '<span style="color:var(--success);">✓ Complete</span>') + '</div>'
        + rejectionHtml + docsHtml
        + '<div style="display:flex;gap:8px;margin-top:auto;">' + continueBtn + '<button class="btn btn-outline btn-xs explore-btn-workspace" data-id="' + app.id + '" style="font-weight:600;flex:1;">👁 Open Workspace</button>' + deleteBtn + '</div>'
        + '</div>';
    }).join('');

    const emptyMsg = q
      ? 'Try a different search term.'
      : 'Go to <strong>Assigned Editions → Active Assignments</strong> and click <strong>Start Application</strong>.';

    container.innerHTML = '<div class="section-card" style="margin-bottom:24px;"><div class="section-badge" style="background:rgba(79,70,229,0.08);color:var(--accent-indigo);border:1px solid rgba(79,70,229,0.15);">Explore Applications</div><h1>Explore Applications</h1><p style="color:var(--text-muted);font-size:14px;">Your working area. All applications created from assigned editions are tracked here.</p></div>'
      + '<div style="display:flex;gap:0;border-bottom:1px solid var(--border-color);margin-bottom:20px;flex-wrap:wrap;">' + tabsHtml + '</div>'
      + '<div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;align-items:center;"><div style="flex:1;min-width:240px;position:relative;"><input type="text" id="explore-search" class="form-input" placeholder="Search by App ID, Edition Name, or Framework..." value="' + (state.search || '') + '" style="padding-left:34px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2.5" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>'
      + '<select id="explore-sort" class="form-input" style="width:200px;font-size:13px;"><option value="updatedAt"' + (state.sortBy === 'updatedAt' ? ' selected' : '') + '>Recently Updated</option><option value="createdAt"' + (state.sortBy === 'createdAt' ? ' selected' : '') + '>Recently Created</option><option value="editionId"' + (state.sortBy === 'editionId' ? ' selected' : '') + '>Alphabetical</option></select>'
      + '<button id="explore-sort-dir" class="btn btn-secondary btn-sm">' + (state.sortDir === 'desc' ? '▼ Desc' : '▲ Asc') + '</button></div>'
      + (apps.length === 0
        ? '<div style="text-align:center;padding:60px 20px;color:var(--text-muted);"><div style="font-size:48px;margin-bottom:16px;">📂</div><h3 style="font-size:16px;font-weight:700;margin-bottom:8px;">No applications found</h3><p style="font-size:13px;">' + emptyMsg + '</p></div>'
        : '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:20px;">' + cardsHtml + '</div>');

    container.querySelectorAll('.explore-tab-link').forEach(function (btn) { btn.addEventListener('click', function () { state.activeTab = btn.dataset.tab; renderContent(); }); });
    var searchEl = container.querySelector('#explore-search');
    if (searchEl) searchEl.addEventListener('input', function (e) { state.search = e.target.value; renderContent(); var inp = container.querySelector('#explore-search'); if (inp) { inp.focus(); var v = inp.value; inp.value = ''; inp.value = v; } });
    var sortEl = container.querySelector('#explore-sort');
    if (sortEl) sortEl.addEventListener('change', function (e) { state.sortBy = e.target.value; renderContent(); });
    var sortDirEl = container.querySelector('#explore-sort-dir');
    if (sortDirEl) sortDirEl.addEventListener('click', function () { state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc'; renderContent(); });
    container.querySelectorAll('.explore-btn-continue').forEach(function (btn) { btn.addEventListener('click', function () { openApplicationForm(btn.dataset.id, container); }); });
    container.querySelectorAll('.explore-btn-workspace').forEach(function (btn) { btn.addEventListener('click', function () { openApplicationDetail(btn.dataset.id, container); }); });
    container.querySelectorAll('.explore-btn-delete').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const confirmed = await showConfirm({ title: 'Delete Draft', message: 'Permanently delete this draft? This cannot be undone.', type: 'danger' });
        if (!confirmed) return;
        const db = getDb();
        const idx = db.applications.findIndex(function (a) { return a.id === btn.dataset.id; });
        if (idx !== -1) { db.applications.splice(idx, 1); await forceSave(); renderUserSidebar(); showToast('Draft deleted.', 'success'); renderContent(); }
      });
    });
  };

  renderContent();
}

export function renderUserAppsFiltered(container, status) {
  const user = getCurrentUser();

  if (window.appsFilterState === undefined) {
    window.appsFilterState = {
      search: '',
      subStatus: 'All',
      sortBy: 'updatedAt',
      sortDir: 'desc',
      page: 1,
      pageSize: 12,
      sortDropdownOpen: false
    };
  }

  if (window.appsLastStatusParam !== status) {
    window.appsLastStatusParam = status;
    window.appsFilterState.search = '';
    window.appsFilterState.subStatus = 'All';
    window.appsFilterState.page = 1;
  }

  const renderContent = () => {
    let rawApps = getApplicationsByUser(user.id);

    if (status === 'Submitted') {
      rawApps = rawApps.filter(a => ['Submitted', 'Resubmitted', 'Under Review', 'Additional Documents Requested'].includes(a.status));
    } else {
      rawApps = rawApps.filter(a => a.status === status);
    }

    const totalCount = rawApps.length;
    const submittedCount = rawApps.filter(a => a.status === 'Submitted').length;
    const reviewCount = rawApps.filter(a => a.status === 'Under Review').length;
    const docsCount = rawApps.filter(a => a.status === 'Additional Documents Requested').length;
    const resubmittedCount = rawApps.filter(a => a.status === 'Resubmitted').length;

    let filtered = [...rawApps];
    const q = window.appsFilterState.search.toLowerCase().trim();
    if (q) {
      filtered = filtered.filter(a => {
        const ed = getEditionById(a.editionId);
        return a.id.toLowerCase().includes(q) || (ed?.name || '').toLowerCase().includes(q);
      });
    }

    if (status === 'Submitted' && window.appsFilterState.subStatus !== 'All') {
      const sub = window.appsFilterState.subStatus;
      filtered = filtered.filter(a => a.status === sub);
    }

    const sortBy = window.appsFilterState.sortBy;
    const sortDir = window.appsFilterState.sortDir;
    filtered.sort((a, b) => {
      let av = a[sortBy] || '';
      let bv = b[sortBy] || '';
      if (sortBy === 'score') {
        av = calculateApplicationScore(a.id) || 0;
        bv = calculateApplicationScore(b.id) || 0;
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / window.appsFilterState.pageSize) || 1;
    if (window.appsFilterState.page > totalPages) {
      window.appsFilterState.page = totalPages;
    }
    const page = window.appsFilterState.page;
    const startIdx = (page - 1) * window.appsFilterState.pageSize;
    const paginatedApps = filtered.slice(startIdx, startIdx + window.appsFilterState.pageSize);

    let subStatusTabsHtml = '';
    if (status === 'Submitted') {
      const curSub = window.appsFilterState.subStatus;
      subStatusTabsHtml = `
        <div class="sub-status-tabs-container">
          <button class="sub-status-tab ${curSub === 'All' ? 'active' : ''}" data-sub="All">
            All In Review <span class="sub-status-tab-count">${totalCount}</span>
          </button>
          <button class="sub-status-tab ${curSub === 'Submitted' ? 'active' : ''}" data-sub="Submitted">
            Submitted <span class="sub-status-tab-count">${submittedCount}</span>
          </button>
          <button class="sub-status-tab ${curSub === 'Under Review' ? 'active' : ''}" data-sub="Under Review">
            Under Review <span class="sub-status-tab-count">${reviewCount}</span>
          </button>
          <button class="sub-status-tab ${curSub === 'Additional Documents Requested' ? 'active' : ''}" data-sub="Additional Documents Requested">
            Docs Requested <span class="sub-status-tab-count">${docsCount}</span>
          </button>
          <button class="sub-status-tab ${curSub === 'Resubmitted' ? 'active' : ''}" data-sub="Resubmitted">
            Resubmitted <span class="sub-status-tab-count">${resubmittedCount}</span>
          </button>
        </div>
      `;
    }

    const controlsHtml = `
      <style>
        .custom-sort-option {
          padding: 8px 12px;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 2px;
          transition: background 0.2s, border-left 0.15s;
          border-left: 3px solid transparent;
        }
        .custom-sort-option:hover {
          background: rgba(255, 255, 255, 0.08);
        }
        .custom-sort-option.active {
          background: rgba(79, 70, 229, 0.12);
          border-left-color: var(--accent-indigo);
        }
        .custom-sort-option.active .option-title {
          color: var(--accent-indigo) !important;
        }
      </style>
      <div style="display:flex; justify-content:space-between; align-items:center; gap:16px; margin-bottom:20px; flex-wrap:wrap;">
        <div class="form-group" style="margin-bottom:0; flex:1; min-width:240px; position:relative;">
          <input type="text" id="apps-search-input" class="form-input" placeholder="Search by App ID or Edition Name..." value="${window.appsFilterState.search}" style="padding-left:36px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2.5" style="position:absolute; left:12px; top:50%; transform:translateY(-50%);"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
        <div style="display:flex; gap:12px; align-items:center;">
          <label style="font-size:12px; font-weight:600; color:var(--text-muted); font-family:var(--font-title);">Sort By:</label>
          <div class="custom-sort-dropdown" style="position:relative; display:inline-block;">
            <button id="apps-sort-trigger" class="form-input form-select-sm" style="width:170px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; background:var(--bg-card); border:1px solid var(--border-color); border-radius:8px; padding:6px 12px; font-size:13px; color:var(--text-main); font-weight:500;">
              <span style="display:flex; align-items:center; gap:6px;">
                ${sortBy === 'updatedAt' ? '⏱️ Recently Updated' : sortBy === 'id' ? '#️⃣ Application ID' : '🏆 Score'}
              </span>
              <span style="font-size:10px; color:var(--text-muted); transition: transform 0.2s; ${window.appsFilterState.sortDropdownOpen ? 'transform: rotate(180deg);' : ''}">▼</span>
            </button>
            <div id="apps-sort-menu" class="glass-card" style="display:${window.appsFilterState.sortDropdownOpen ? 'block' : 'none'}; position:absolute; top:calc(100% + 6px); right:0; width:240px; z-index:9999; padding:6px; border:1px solid var(--border-color); border-radius:10px; box-shadow:var(--shadow-lg); background:var(--bg-card); backdrop-filter:blur(20px);">
              <div class="custom-sort-option ${sortBy === 'updatedAt' ? 'active' : ''}" data-value="updatedAt" title="Sort by the latest updates first.">
                <div class="option-title" style="display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:600; color:var(--text-main);">
                  <span>⏱️</span> Recently Updated
                </div>
                <div style="font-size:10.5px; color:var(--text-muted);">View records modified most recently</div>
              </div>
              <div class="custom-sort-option ${sortBy === 'id' ? 'active' : ''}" data-value="id" style="margin-top:4px;" title="Sort alphabetically by the unique tracking ID.">
                <div class="option-title" style="display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:600; color:var(--text-main);">
                  <span>#️⃣</span> Application ID
                </div>
                <div style="font-size:10.5px; color:var(--text-muted);">Order by unique compliance tracking code</div>
              </div>
              <div class="custom-sort-option ${sortBy === 'score' ? 'active' : ''}" data-value="score" style="margin-top:4px;" title="Sort by the accumulated points from highest to lowest.">
                <div class="option-title" style="display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:600; color:var(--text-main);">
                  <span>🏆</span> Score
                </div>
                <div style="font-size:10.5px; color:var(--text-muted);">Sort by total approved compliance points</div>
              </div>
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" id="btn-apps-sort-dir" style="padding: 6px 10px;">
            ${sortDir === 'desc' ? '▼ Desc' : '▲ Asc'}
          </button>
        </div>
      </div>
    `;

    const titleMap = {
      'Draft': 'Draft Applications',
      'Submitted': 'In Review Applications',
      'Approved': 'Approved & Certified Applications',
      'Rejected': 'Rejected Compliance Applications'
    };
    const currentTitle = titleMap[status] || `${status} Applications`;

    const cardsHtml = paginatedApps.map(app => {
      const edition = getEditionById(app.editionId);
      const score = calculateApplicationScore(app.id);
      const maxScore = calculateApplicationMaxScore(app.id) || 1;
      const pct = ((score / maxScore) * 100).toFixed(1);
      const answers = getAnswersByApplication(app.id);
      const approvedCount = answers.filter(a => a.questionStatus === 'Approved').length;
      const pendingCount = answers.filter(a => a.questionStatus === 'Submitted').length;
      const statusCls = _statusClass(app.status);
      const hasAnyScore = score > 0 || approvedCount > 0;
      const hasBeenReviewed = ['Approved', 'Rejected', 'Additional Documents Requested'].includes(app.status) || hasAnyScore;
      const scoreDisplay = hasBeenReviewed ? score : '—';
      const maxScoreDisplay = hasBeenReviewed ? `/ ${maxScore}` : '';
      const pctDisplay = hasBeenReviewed ? `${pct}%` : '—';

      let colorCls = 'blue';
      if (app.status === 'Draft') colorCls = 'orange';
      else if (app.status === 'Additional Documents Requested') colorCls = 'yellow';
      else if (['Submitted', 'Resubmitted', 'Under Review'].includes(app.status)) colorCls = 'purple';
      else if (app.status === 'Approved') colorCls = 'green';
      else if (app.status === 'Rejected') colorCls = 'red';

      return `
        <div class="app-summary-card glass-card glass-card-enhanced status-border-${colorCls}">
          <div class="app-card-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <code class="app-id-code" style="font-size:11px;">${app.id}</code>
            <span class="status-badge ${statusCls}" style="font-size:10px; font-weight:700; text-transform:uppercase; padding:2px 8px; border-radius:99px;">${app.status}</span>
          </div>
          <div class="app-card-body" style="padding:0;">
            <p class="app-edition" style="font-weight:700; color:var(--text-main); margin-bottom:10px; font-size:14.5px;">${edition?.name || 'Unknown Framework'}</p>
            
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span style="font-size:12.5px; color:var(--text-muted);">Compliance Score:</span>
              <span style="font-size:13.5px; font-weight:700; color:var(--accent-indigo)">${scoreDisplay} <span style="font-size:11.5px; font-weight:normal; color:var(--text-muted);">${maxScoreDisplay}</span></span>
            </div>

            <div style="margin-bottom:12px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; font-size:11.5px; color:var(--text-muted);">
                <span>Progress Rate</span>
                <strong>${pctDisplay}</strong>
              </div>
              <div class="reform-progress-bar-container" style="height: 6px; margin: 0; background: var(--border-color); border-radius: 3px; overflow: hidden;">
                <div class="reform-progress-fill" style="width: ${hasBeenReviewed ? pct : 0}%; height: 100%; background: var(--accent-${colorCls}); border-radius: 3px;"></div>
              </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; font-size:11.5px; color:var(--text-muted); border-top:1px dashed var(--border-color); padding-top:8px; margin-top:8px;">
              <span>Approved: <strong>${approvedCount}</strong></span>
              <span>Pending: <strong>${pendingCount}</strong></span>
            </div>
            <p class="app-date" style="font-size:11px; color:var(--text-muted); margin-top:6px;">🕒 Updated: ${new Date(app.updatedAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</p>
            ${app.status === 'Rejected' && app.rejectionReason ? `<p style="color:var(--danger);font-size:12px;margin-top:8px;font-style:italic;background:rgba(239,68,68,0.06);padding:8px 12px;border-radius:8px;border-left:3px solid var(--danger);line-height:1.4;">Reason: "${app.rejectionReason}"</p>` : ''}
            ${app.status === 'Approved' && app.reviewerComments ? `<p style="color:var(--success);font-size:12px;margin-top:8px;font-style:italic;background:rgba(16,185,129,0.06);padding:8px 12px;border-radius:8px;border-left:3px solid var(--success);line-height:1.4;">Reviewer Note: "${app.reviewerComments}"</p>` : ''}
            ${app.status === 'Additional Documents Requested' && app.additionalDocsNote ? `<p style="color:var(--warning);font-size:12px;margin-top:8px;font-style:italic;background:rgba(245,158,11,0.06);padding:8px 12px;border-radius:8px;border-left:3px solid var(--warning);line-height:1.4;">Required Action: "${app.additionalDocsNote}"</p>` : ''}
          </div>
          <div class="app-card-footer" style="margin-top:14px; padding-top:12px; border-top:1px solid var(--border-color); display:flex; gap:8px; justify-content:flex-end;">
            ${app.status === 'Draft' ? `<button class="btn btn-xs btn-primary btn-open-form" data-id="${app.id}" style="font-weight:600;">Continue</button>` : ''}
            ${app.status === 'Rejected' ? `<button class="btn btn-xs btn-warning btn-open-form" data-id="${app.id}" style="font-weight:600;">Resubmit</button>` : ''}
            ${app.status === 'Additional Documents Requested' ? `<button class="btn btn-xs btn-primary btn-open-form" data-id="${app.id}" style="font-weight:600;">Upload Docs</button>` : ''}
            <button class="btn btn-xs btn-outline btn-view-detail" data-id="${app.id}" style="font-weight:600;">Open Workspace</button>
          </div>
        </div>
      `;
    }).join('');

    let paginationHtml = '';
    if (totalPages > 1) {
      paginationHtml = `
        <div style="display:flex; justify-content:center; align-items:center; gap:16px; margin-top:28px; font-family:var(--font-title); font-size:13px;">
          <button class="btn btn-secondary btn-sm" id="btn-apps-prev" ${page === 1 ? 'disabled' : ''}>← Previous</button>
          <span>Page <strong>${page}</strong> of <strong>${totalPages}</strong></span>
          <button class="btn btn-secondary btn-sm" id="btn-apps-next" ${page === totalPages ? 'disabled' : ''}>Next →</button>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="section-card" style="margin-bottom:24px;">
        <div class="section-badge" style="background:rgba(79,70,229,0.08);color:var(--accent-indigo);border:1px solid rgba(79,70,229,0.15);">${status === 'Submitted' ? 'In Review' : status}</div>
        <h1>${currentTitle}</h1>
        <p style="color:var(--text-muted);font-size:14px;">Found ${totalItems} matching compliance records.</p>
      </div>

      ${subStatusTabsHtml}
      ${controlsHtml}

      ${totalItems === 0 ? `
        <div class="empty-state">
          <h3>No applications found</h3>
          <p>Try refining your search or status filter options.</p>
        </div>
      ` : `
        <div class="app-cards-grid">${cardsHtml}</div>
        ${paginationHtml}
      `}
    `;

    container.querySelector('#apps-search-input')?.addEventListener('input', (e) => {
      window.appsFilterState.search = e.target.value;
      window.appsFilterState.page = 1;
      renderContent();
      const inp = container.querySelector('#apps-search-input');
      inp.focus();
      const val = inp.value;
      inp.value = '';
      inp.value = val;
    });

    // Trigger toggle click
    container.querySelector('#apps-sort-trigger')?.addEventListener('click', (e) => {
      e.stopPropagation();
      window.appsFilterState.sortDropdownOpen = !window.appsFilterState.sortDropdownOpen;
      renderContent();
    });

    // Custom option clicks
    container.querySelectorAll('.custom-sort-option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        window.appsFilterState.sortBy = opt.dataset.value;
        window.appsFilterState.sortDropdownOpen = false;
        renderContent();
      });
    });

    // Close on click outside
    if (window.appsSortOutsideClick) {
      document.removeEventListener('click', window.appsSortOutsideClick);
    }
    window.appsSortOutsideClick = (e) => {
      if (!e.target.closest('.custom-sort-dropdown')) {
        window.appsFilterState.sortDropdownOpen = false;
        if (window.appsSortOutsideClick) {
          document.removeEventListener('click', window.appsSortOutsideClick);
        }
        renderContent();
      }
    };
    if (window.appsFilterState.sortDropdownOpen) {
      document.addEventListener('click', window.appsSortOutsideClick);
    }

    container.querySelector('#btn-apps-sort-dir')?.addEventListener('click', () => {
      window.appsFilterState.sortDir = window.appsFilterState.sortDir === 'desc' ? 'asc' : 'desc';
      renderContent();
    });

    container.querySelectorAll('.sub-status-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        window.appsFilterState.subStatus = tab.dataset.sub;
        window.appsFilterState.page = 1;
        renderContent();
      });
    });

    container.querySelector('#btn-apps-prev')?.addEventListener('click', () => {
      if (window.appsFilterState.page > 1) {
        window.appsFilterState.page--;
        renderContent();
      }
    });

    container.querySelector('#btn-apps-next')?.addEventListener('click', () => {
      if (window.appsFilterState.page < totalPages) {
        window.appsFilterState.page++;
        renderContent();
      }
    });

    container.querySelectorAll('.btn-open-form').forEach(btn => {
      btn.addEventListener('click', () => openApplicationForm(btn.dataset.id, container));
    });

    container.querySelectorAll('.btn-view-detail').forEach(btn => {
      btn.addEventListener('click', () => openApplicationDetail(btn.dataset.id, container));
    });
  };

  renderContent();
}

export function openApplicationDetail(appId, container) {
  const user = getCurrentUser();
  const app = getApplicationById(appId);
  if (!app) return;
  if (user.role === 'user' && app.userId !== user.id) {
    showAlert({ title: 'Access Denied', message: 'You are not authorized to view this application.', type: 'error' });
    uiState.activeUserTab = 'dashboard';
    renderUserSidebar();
    switchUserTab('dashboard');
    return;
  }

  // Render the modern workspace
  renderTabbedApplicationWorkspace(container, appId);
}

export function renderUserProfilePage(container) {
  const user = getCurrentUser();
  const isStateUser = user.role === 'user';

  let profileFieldsHtml = '';
  if (isStateUser) {
    profileFieldsHtml = `
          <div class="form-group-row" style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:12px;">
            <div class="form-group">
              <label>Name</label>
              <input type="text" id="prof-name" class="form-input" value="${user.name || user.nodalOfficer || ''}" required style="width:100%;">
            </div>
            <div class="form-group">
              <label>Official Email</label>
              <input type="email" id="prof-email" class="form-input" value="${user.email || ''}" required style="width:100%;">
            </div>
          </div>
          <div class="form-group-row" style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:12px;">
            <div class="form-group" style="grid-column: span 2;">
              <label>Department Name</label>
              <input type="text" id="prof-org" class="form-input" value="${user.organization || ''}" style="width:100%;">
            </div>
            <div class="form-group" style="display:none;">
              <label>State / UT Name</label>
              <select id="prof-state" required class="form-input form-select" style="width:100%;height:38px;">
                <option value="Andhra Pradesh" selected>Andhra Pradesh</option>
              </select>
            </div>
          </div>
          <div class="form-group-row" style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:12px;">
            <div class="form-group" style="grid-column: span 2;">
              <label>District</label>
              <select id="prof-district" required class="form-input form-select" style="width:100%;height:38px;">
                <option value="" disabled>Select District</option>
              </select>
            </div>
          </div>
    `;
  } else {
    profileFieldsHtml = `
          <div class="form-group-row" style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:12px;">
            <div class="form-group">
              <label>Name</label>
              <input type="text" id="prof-name" class="form-input" value="${user.name || ''}" required style="width:100%;">
            </div>
            <div class="form-group">
              <label>Official Email</label>
              <input type="email" id="prof-email" class="form-input" value="${user.email || ''}" required style="width:100%;">
            </div>
          </div>
          <div class="form-group-row" style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:12px;">
            <div class="form-group">
              <label>Organization / Department</label>
              <input type="text" id="prof-org" class="form-input" value="${user.organization || ''}" style="width:100%;">
            </div>
          </div>
    `;
  }

  container.innerHTML = `
    <div class="section-card" style="margin-bottom:24px;">
      <div class="section-badge" style="background:rgba(79,70,229,0.08);color:var(--accent-indigo);border:1px solid rgba(79,70,229,0.15);">Profile Settings</div>
      <h1>My Profile Settings</h1>
      <p style="color:var(--text-muted);font-size:14px;">View and edit contact details, organization, and location settings.</p>
    </div>

    <div class="card glass-card" style="max-width:640px;">
      <div class="card-header"><h2>Profile Details</h2></div>
      <div class="card-body">
        <form id="user-profile-form">
          ${profileFieldsHtml}
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; flex-wrap:wrap; gap:8px;">
            <button type="submit" class="btn btn-primary">Save Profile Changes</button>
            <button type="button" id="btn-initiate-change-pwd" class="btn btn-secondary" style="display:flex;align-items:center;gap:6px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Change Password
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  if (isStateUser) {
    const stateSelect = container.querySelector('#prof-state');
    const districtSelect = container.querySelector('#prof-district');

    const populateDistricts = (stateVal, selectedDistrict) => {
      districtSelect.innerHTML = '<option value="" disabled>Select District</option>';
      const districts = statesDistrictsData[stateVal] || statesDistrictsData["default"] || [];
      districts.forEach(dist => {
        const opt = document.createElement('option');
        opt.value = dist;
        opt.textContent = dist;
        if (dist === selectedDistrict) opt.selected = true;
        districtSelect.appendChild(opt);
      });
    };

    if (stateSelect.value) {
      populateDistricts(stateSelect.value, user.district);
    }

    stateSelect.addEventListener('change', (e) => {
      populateDistricts(e.target.value, '');
    });
  }

  container.querySelector('#user-profile-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = container.querySelector('#prof-name').value.trim();
    const email = container.querySelector('#prof-email').value.trim();
    const organization = container.querySelector('#prof-org').value.trim();
    let state = '';
    let district = '';

    if (isStateUser) {
      state = container.querySelector('#prof-state').value;
      district = container.querySelector('#prof-district').value;
    }

    const updatedData = {
      name, email, nodalOfficer: isStateUser ? name : '', organization, state, district,
      sector: user.sector || '', startupName: user.startupName || '', category: user.category || ''
    };

    updateUser(user.id, updatedData);

    Object.assign(user, updatedData);
    sessionStorage.setItem('srf_current_user', JSON.stringify(user));

    showToast('Profile updated successfully!', 'success');
    renderUserPortal();
  });

  container.querySelector('#btn-initiate-change-pwd')?.addEventListener('click', openChangePasswordModal);
}

