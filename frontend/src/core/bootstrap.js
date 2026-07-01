import { activeApplicationId, openApplicationForm, loginScreen, portalScreen, adminPanel, userPanel } from '../../app.js';
import { releaseLock, initStore, getDb, getEditions, getAssignments, getEditionById, getAllAssignments, getUserById, getUsers, getApplicationById, getApplicationsByUser, addAuditLog } from '../db/store.js';
import { initAuth, getCurrentUser, getRoleInfo, isAdmin, isSuperAdmin } from '../auth/auth.js';
import { initToasts } from '../ui/toastManager.js';
import { renderDiagnosticsPanel } from '../panels/diagnostics.js';
import { openEditionTracker, switchAdminTab, openEditUserModal, renderAdminPortal } from '../panels/adminPanel.js';
import { openApplicationDetail, switchUserTab, startNewApplication, renderUserPortal } from '../panels/userPanel.js';
import { renderTabbedApplicationWorkspace } from '../modules/advancedDashboard.js';
import { updateNotificationBadge, showNotificationsDropdown } from '../panels/notifications.js';
import { openProfileModal } from '../panels/profileMessages.js';

export async function cleanupAllHeartbeats() {
  if (window.formLockHeartbeat) {
    clearInterval(window.formLockHeartbeat);
    window.formLockHeartbeat = null;
  }
  if (window.detailLockHeartbeat) {
    clearInterval(window.detailLockHeartbeat);
    window.detailLockHeartbeat = null;
  }
  if (activeApplicationId) {
    try {
      await releaseLock(activeApplicationId);
    } catch (e) {
      console.warn('Failed to release lock on cleanup:', e);
    }
  }
}

export async function boot() {
  await initStore();
  checkExistingSession();
  initAuth();
  initToasts();
  renderDiagnosticsPanel();

  // Listen for storage changes from other tabs to dynamically update lists
  const throttledStorageRefresh = debounce(async () => {
    const user = getCurrentUser();
    if (user) {
      await initStore();
      if (window.refreshCurrentView) {
        window.refreshCurrentView();
      }
    }
  }, 1000);

  window.addEventListener('storage', (e) => {
    if (e.key === 'srf_platform_v3') {
      throttledStorageRefresh();
    }
  });

  // Background auto-refresh for Admins and Reviewers to fetch new submissions instantly
  setInterval(async () => {
    try {
      const user = getCurrentUser();
      if (user && ['admin', 'reviewer', 'superadmin'].includes(user.role)) {
        if (document.visibilityState === 'visible') {
          const db = getDb();
          const oldAppsStr = JSON.stringify((db?.applications || []).map(a => ({ id: a.id, status: a.status, updatedAt: a.updatedAt })));
          await initStore();
          const newDb = getDb();
          const newAppsStr = JSON.stringify((newDb?.applications || []).map(a => ({ id: a.id, status: a.status, updatedAt: a.updatedAt })));
          if (oldAppsStr !== newAppsStr && window.refreshCurrentView) {
            window.refreshCurrentView();
          }
        }
      }
    } catch (e) {
      console.warn('[Admin Auto-Refresh] Background sync failed:', e);
    }
  }, 6000); // Poll every 6 seconds for high responsiveness
}

export function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

export function pushToNavHistory(state) {
  if (window.isNavigatingBack) return;
  const current = window.navHistory[window.navHistory.length - 1];
  if (current && current.role === state.role && current.tab === state.tab && current.editionId === state.editionId && current.appId === state.appId) {
    return;
  }
  window.navHistory.push(state);
  updateGlobalBackButton();
}

export function updateGlobalBackButton() {
  const btn = document.getElementById('global-back-btn');
  if (!btn) return;
  if (window.navHistory.length > 1) {
    btn.classList.remove('hidden');
  } else {
    btn.classList.add('hidden');
  }
}

export function goBack() {
  if (window.navHistory.length <= 1) return;
  window.navHistory.pop(); // pop current state
  const prev = window.navHistory[window.navHistory.length - 1];
  if (!prev) return;
  
  window.isNavigatingBack = true;
  if (prev.role === 'admin') {
    if (prev.tab === 'tracker' && prev.editionId) {
      openEditionTracker(prev.editionId);
    } else if (prev.tab === 'tabbed-workspace' && prev.appId) {
      openApplicationDetail(prev.appId, document.getElementById('admin-tracker-view'));
    } else {
      switchAdminTab(prev.tab);
    }
  } else if (prev.role === 'user') {
    if (prev.tab === 'form' && prev.appId) {
      openApplicationForm(prev.appId, document.getElementById('user-form-view'));
    } else if (prev.tab === 'tabbed-workspace' && prev.appId) {
      openApplicationDetail(prev.appId, document.getElementById('user-dashboard-view'));
    } else {
      switchUserTab(prev.tab);
    }
  }
  window.isNavigatingBack = false;
  updateGlobalBackButton();
}

export async function postJson(url, payload) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    throw new Error('Unable to reach the server. Please start the backend with npm run dev.');
  }

  const contentType = res.headers.get('content-type') || '';
  const rawText = await res.text();
  let data = {};

  if (rawText && contentType.includes('application/json')) {
    try {
      data = JSON.parse(rawText);
    } catch (error) {
      throw new Error('The server returned invalid JSON. Please check the backend console.');
    }
  } else if (rawText) {
    const plainText = rawText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const message = plainText || `Server returned HTTP ${res.status}`;
    throw new Error(message.slice(0, 180));
  }

  if (!res.ok || data.success === false) {
    throw new Error(data.error || data.message || `Request failed with HTTP ${res.status}`);
  }

  return data;
}

export function showLandingView(view) {
  document.querySelectorAll('.landing-view').forEach(v => {
    v.classList.add('hidden');
    v.classList.remove('fade-in-up', 'slide-in-right');
  });
  document.querySelectorAll('.landing-nav-btn').forEach(b => b.classList.remove('active'));

  const el = document.getElementById(`landing-${view}-view`);
  if (el) {
    el.classList.remove('hidden');
    el.classList.add(view === 'hero' ? 'fade-in-up' : 'slide-in-right');
  }

  const btn = document.getElementById(`nav-btn-${view}`);
  if (btn) btn.classList.add('active');
}

export function initGlobalSearch() {
  const searchInput = document.getElementById('top-search-input');
  if (!searchInput) return;

  let dropdown = document.getElementById('search-suggestions-dropdown');
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.id = 'search-suggestions-dropdown';
    dropdown.className = 'search-suggestions-dropdown hidden';
    searchInput.parentNode.appendChild(dropdown);
  }

  let debounceTimer = null;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    const query = e.target.value.trim().toLowerCase();
    if (!query) {
      dropdown.classList.add('hidden');
      dropdown.innerHTML = '';
      return;
    }

    debounceTimer = setTimeout(() => {
      const user = getCurrentUser();
      if (!user) return;

      const results = {
        Users: [],
        Applications: [],
        Assignments: [],
        Editions: [],
        Reports: []
      };

      const isAdminOrSuper = ['admin', 'reviewer', 'superadmin'].includes(user.role);
      const isSuper = user.role === 'superadmin';

      // 1. Editions
      const allEditions = getEditions() || [];
      allEditions.forEach(ed => {
        if (ed.name.toLowerCase().includes(query) || (ed.description && ed.description.toLowerCase().includes(query))) {
          if (!isAdminOrSuper) {
            const userAssignments = getAssignments(user.id);
            const isAssigned = userAssignments.some(a => a.editionId === ed.id);
            if (isAssigned && ed.status !== 'archived') {
              results.Editions.push({ id: ed.id, label: ed.name, details: 'Edition' });
            }
          } else {
            results.Editions.push({ id: ed.id, label: ed.name, details: `Status: ${ed.status}` });
          }
        }
      });

      // 2. Applications
      const allApps = getDb().applications || [];
      allApps.forEach(app => {
        const editionName = getEditionById(app.editionId)?.name || 'Edition';
        const matchStr = `${app.id} ${app.organization || ''} ${app.state || ''} ${app.district || ''} ${editionName}`.toLowerCase();
        if (matchStr.includes(query)) {
          if (isSuper) {
            results.Applications.push({ id: app.id, label: `${app.organization || 'Application'} (${app.id})`, details: `Edition: ${editionName} | ${app.status}` });
          } else if (isAdminOrSuper) {
            if (app.status !== 'Draft') {
              results.Applications.push({ id: app.id, label: `${app.organization || 'Application'} (${app.id})`, details: `Edition: ${editionName} | ${app.status}` });
            }
          } else {
            if (app.userId === user.id) {
              results.Applications.push({ id: app.id, label: `${app.organization || 'My Application'} (${app.id})`, details: `Status: ${app.status}` });
            }
          }
        }
      });

      // 3. Assignments
      if (isAdminOrSuper) {
        const allAssignments = getAllAssignments() || [];
        allAssignments.forEach(ass => {
          const assUser = getUserById(ass.userId)?.name || ass.userId;
          const matchStr = `${ass.responsibility || ''} ${assUser} ${ass.type || ''}`.toLowerCase();
          if (matchStr.includes(query)) {
            results.Assignments.push({
              id: ass.id,
              label: ass.responsibility || 'General Task',
              details: `Assigned to: ${assUser} (${ass.type || 'General'})`
            });
          }
        });
      }

      // 4. Users
      if (isSuper) {
        const allUsers = getUsers() || [];
        allUsers.forEach(u => {
          const matchStr = `${u.name || u.nodalOfficer || ''} ${u.username} ${u.email || ''} ${u.district || ''} ${u.organization || ''}`.toLowerCase();
          if (matchStr.includes(query)) {
            results.Users.push({ id: u.id || u.username, label: u.name || u.username, details: `Role: ${u.role} | District: ${u.district || 'All'}` });
          }
        });
      }

      // 5. Reports
      if (isAdminOrSuper) {
        const allLogs = getDb().auditLogs || [];
        allLogs.forEach(l => {
          if (l.action.toLowerCase().includes(query) || (l.details && l.details.toLowerCase().includes(query))) {
            results.Reports.push({ id: l.id, label: l.action, details: new Date(l.timestamp).toLocaleDateString('en-IN') });
          }
        });
      }

      // Build HTML
      let html = '';
      let totalCount = 0;
      for (const category in results) {
        if (results[category].length > 0) {
          html += `<div class="search-category-header">${category}</div>`;
          const sliced = results[category].slice(0, 4);
          sliced.forEach(item => {
            if (totalCount >= 15) return;
            totalCount++;
            html += `
              <div class="search-suggestion-item" data-category="${category}" data-id="${item.id}">
                <div class="search-item-label">${item.label}</div>
                <div class="search-item-details">${item.details}</div>
              </div>
            `;
          });
        }
      }

      if (totalCount === 0) {
        dropdown.innerHTML = `<div class="search-no-results">No matches found for "${query}"</div>`;
      } else {
        dropdown.innerHTML = html;
      }
      dropdown.classList.remove('hidden');

      // Click event listeners
      dropdown.querySelectorAll('.search-suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
          const category = item.dataset.category;
          const id = item.dataset.id;
          dropdown.classList.add('hidden');
          searchInput.value = '';

          // Navigate based on category
          if (category === 'Applications') {
            if (isAdminOrSuper) {
              const targetApp = getApplicationById(id);
              if (targetApp) {
                switchAdminTab('analytics');
                setTimeout(() => {
                  const analyticsView = document.getElementById('admin-analytics-view');
                  renderTabbedApplicationWorkspace(analyticsView, id);
                }, 50);
              }
            } else {
              const app = getApplicationById(id);
              if (app) {
                switchUserTab('dashboard');
                setTimeout(() => {
                  if (app.status === 'Draft' || app.status === 'Rejected') {
                    openApplicationForm(id, document.getElementById('user-dashboard-view'));
                  } else {
                    openApplicationDetail(id, document.getElementById('user-dashboard-view'));
                  }
                }, 50);
              }
            }
          } else if (category === 'Editions') {
            if (isAdminOrSuper) {
              switchAdminTab('editions');
            } else {
              const apps = getApplicationsByUser(user.id).filter(a => a.editionId === id);
              if (apps.length > 0) {
                const app = apps.find(a => a.status === 'Draft' || a.status === 'Additional Documents Requested') || apps[0];
                switchUserTab('dashboard');
                setTimeout(() => {
                  const targetView = document.getElementById('user-dashboard-view');
                  if (app.status === 'Draft' || app.status === 'Rejected' || app.status === 'Additional Documents Requested') {
                    openApplicationForm(app.id, targetView);
                  } else {
                    openApplicationDetail(app.id, targetView);
                  }
                }, 50);
              } else {
                switchUserTab('dashboard');
                setTimeout(() => {
                  const targetView = document.getElementById('user-dashboard-view');
                  startNewApplication(id, targetView);
                }, 50);
              }
            }
          } else if (category === 'Users') {
            switchAdminTab('users');
            setTimeout(() => {
              openEditUserModal(id, document.getElementById('admin-users-view'));
            }, 100);
          } else if (category === 'Assignments') {
            switchAdminTab('users');
          } else if (category === 'Reports') {
            switchAdminTab('audit');
          }
        });
      });

    }, 300);
  });

  document.addEventListener('click', (e) => {
    if (e.target !== searchInput && e.target !== dropdown && !dropdown.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });
}

export function initPortal() {
  const user = getCurrentUser();
  loginScreen.classList.add('hidden');
  portalScreen.classList.remove('hidden');
  adminPanel.classList.add('hidden');
  userPanel.classList.add('hidden');

  // Show topbar search container
  const searchContainer = document.querySelector('.topbar-search-container');
  if (searchContainer) {
    searchContainer.classList.remove('hidden');
    initGlobalSearch();
  }

  // Reset history stack
  window.navHistory = [];
  updateGlobalBackButton();

  // Update user info in topbar
  document.getElementById('portal-logo-title').textContent = 'SRF Platform';
  document.getElementById('user-display-name').textContent = user.name || user.username;
  const roleInfo = getRoleInfo();
  document.getElementById('user-role-tag').textContent = roleInfo ? roleInfo.label : user.role;
  if (roleInfo) {
    document.getElementById('user-role-tag').style.color = roleInfo.color;
  }
  document.getElementById('user-avatar').textContent = (user.name || user.username)[0].toUpperCase();

  addAuditLog(user.id, 'Portal accessed', 'auth', user.id);

  if (isAdmin() || isSuperAdmin()) {
    renderAdminPortal();
  } else {
    renderUserPortal();
  }

  // Notification bell
  updateNotificationBadge();
  document.getElementById('notification-bell').addEventListener('click', showNotificationsDropdown);
  document.getElementById('user-info-bubble')?.addEventListener('click', openProfileModal);
}

export function checkExistingSession() {
  const { initAuth: _a, getCurrentUser: _b } = { initAuth, getCurrentUser };
  const user = getCurrentUser();
  if (user) {
    // Resume existing session
    setTimeout(() => initPortal(), 0);
  }
}

