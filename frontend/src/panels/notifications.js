import { getCurrentUser, isAdmin, isSuperAdmin } from '../auth/auth.js';
import { getNotifications, getUnreadCount, markAllNotificationsRead, dismissNotification, markNotificationRead } from '../db/store.js';
import { renderUserSidebar, openApplicationDetail, switchUserTab } from '../panels/userPanel.js';
import { showToast } from '../ui/toastManager.js';


export function renderNotificationsPage(container) {
  const user = getCurrentUser();
  
  if (window.notifFilterActive === undefined) {
    window.notifFilterActive = 'all';
  }
  if (window.notifCategoryActive === undefined) {
    window.notifCategoryActive = 'all';
  }
  if (window.notifSearchQuery === undefined) {
    window.notifSearchQuery = '';
  }

  const renderContent = () => {
    let notes = getNotifications(user.id);
    
    // Search query filter
    const query = (window.notifSearchQuery || '').toLowerCase().trim();
    if (query) {
      notes = notes.filter(n => n.message.toLowerCase().includes(query));
    }
    
    // Status / Read toggle filter
    if (window.notifFilterActive === 'unread') {
      notes = notes.filter(n => !n.read);
    }
    
    // Category filter
    const curCategory = window.notifCategoryActive || 'all';
    if (curCategory !== 'all') {
      notes = notes.filter(n => {
        const type = (n.eventType || '').toUpperCase();
        if (curCategory === 'assignment') {
          return type.includes('ASSIGN') || type.includes('PUBLISH');
        } else if (curCategory === 'submission') {
          return type.includes('SUBMIT') || type.includes('RESUBMIT');
        } else if (curCategory === 'docs') {
          return type.includes('DOC');
        } else if (curCategory === 'decision') {
          return type.includes('APPROVED') || type.includes('REJECTED');
        } else if (curCategory === 'system') {
          return type.includes('SYSTEM') || (!type.includes('ASSIGN') && !type.includes('PUBLISH') && !type.includes('SUBMIT') && !type.includes('RESUBMIT') && !type.includes('DOC') && !type.includes('APPROVED') && !type.includes('REJECTED'));
        }
        return true;
      });
    }

    const unreadCount = getUnreadCount(user.id);

    const getNotifIconCls = (type) => {
      if (type?.includes('ASSIGN') || type?.includes('PUBLISH')) return 'notif-icon-assignment';
      if (type?.includes('SUBMIT')) return 'notif-icon-submission';
      if (type?.includes('DOC') && type?.includes('REQUEST')) return 'notif-icon-docs';
      if (type?.includes('APPROVED')) return 'notif-icon-approved';
      if (type?.includes('REJECTED')) return 'notif-icon-rejected';
      return 'notif-icon-assignment';
    };

    const getNotifIconEmoji = (type) => {
      if (type?.includes('ASSIGN') || type?.includes('PUBLISH')) return '🔔';
      if (type?.includes('SUBMIT')) return '📋';
      if (type?.includes('DOC') && type?.includes('REQUEST')) return '📄';
      if (type?.includes('APPROVED')) return '✅';
      if (type?.includes('REJECTED')) return '❌';
      return '🔔';
    };

    const tabs = [
      { id: 'all', label: 'All Alerts' },
      { id: 'assignment', label: 'Assignments' },
      { id: 'submission', label: 'Submissions' },
      { id: 'docs', label: 'Docs Requested' },
      { id: 'decision', label: 'Decisions' },
      { id: 'system', label: 'System Alerts' }
    ];

    container.innerHTML = `
      <div class="section-card" style="margin-bottom:24px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
        <div>
          <div class="section-badge" style="background:rgba(79,70,229,0.08);color:var(--accent-indigo);border:1px solid rgba(79,70,229,0.15);">Notifications</div>
          <h1>Notification Center</h1>
          <p style="color:var(--text-muted);font-size:14px;">All platform alerts, assignments, reviews, and messages.</p>
        </div>
        <div style="display:flex; gap:10px;">
          ${unreadCount > 0 ? `<button class="btn btn-secondary btn-sm" id="btn-page-notif-clear">Mark All Read</button>` : ''}
        </div>
      </div>

      <!-- Search & Filters -->
      <div style="display:flex; justify-content:space-between; align-items:center; gap:16px; margin-bottom:20px; flex-wrap:wrap;">
        <div class="form-group" style="margin-bottom:0; flex:1; min-width:240px; position:relative;">
          <input type="text" id="notif-search-input" class="form-input" placeholder="Search notifications by keyword..." value="${window.notifSearchQuery || ''}" style="padding-left:36px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2.5" style="position:absolute; left:12px; top:50%; transform:translateY(-50%);"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary btn-sm ${window.notifFilterActive === 'all' ? 'btn-primary' : ''}" id="btn-toggle-notif-all" style="font-weight:600;">All</button>
          <button class="btn btn-secondary btn-sm ${window.notifFilterActive === 'unread' ? 'btn-primary' : ''}" id="btn-toggle-notif-unread" style="font-weight:600;">Unread (${unreadCount})</button>
        </div>
      </div>

      <div class="workspace-nav-tabs" style="margin-bottom:20px; display:flex; gap:8px; border-bottom: 1px solid var(--border-color); padding-bottom:8px; flex-wrap:wrap;">
        ${tabs.map(t => `
          <button class="workspace-tab-link ${t.id === curCategory ? 'active' : ''}" data-category="${t.id}" style="background:none; border:none; padding:8px 16px; cursor:pointer; font-size:13px; font-weight:600; color:${t.id === curCategory ? 'var(--primary)' : 'var(--text-muted)'}; border-bottom:${t.id === curCategory ? '2px solid var(--primary)' : 'none'};">
            ${t.label}
          </button>
        `).join('')}
      </div>

      ${notes.length === 0 ? `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--border-color)" stroke-width="1.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <h3>All caught up!</h3><p>No notifications match this filter.</p>
        </div>
      ` : `
        <div class="notifications-list" style="display:flex; flex-direction:column; gap:12px; margin-bottom:30px;">
          ${notes.map(n => `
            <div class="notification-item ${n.read ? 'read' : 'unread'}" style="display:flex; align-items:center; gap:16px; padding:16px; border-radius:12px; background:var(--bg-card); border:1px solid var(--border-color); position:relative; transition: all var(--transition-fast); cursor:pointer;" data-notif-id="${n.id}">
              <div class="notif-dropdown-icon ${getNotifIconCls(n.eventType)}" style="width:36px; height:36px; font-size:16px;">
                ${getNotifIconEmoji(n.eventType)}
              </div>
              <div class="notif-body" style="flex:1;">
                <p class="notif-msg" style="font-size:13.5px; color:var(--text-main); font-weight:${n.read ? 'normal' : '600'}; margin:0 0 4px 0;">${n.message}</p>
                <span class="notif-time" style="font-size:11px; color:var(--text-muted);">${new Date(n.createdAt).toLocaleString('en-IN')}</span>
              </div>
              <div style="display:flex; align-items:center; gap:10px;">
                ${n.applicationId ? `<button class="btn btn-xs btn-outline btn-page-notif-link" data-app-id="${n.applicationId}">View Application</button>` : ''}
                <button class="btn btn-xs btn-outline btn-page-notif-dismiss" data-id="${n.id}" style="color:var(--text-muted); border-color:transparent;" title="Dismiss">
                  Dismiss
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    `;

    // Bind Search Input
    const searchInput = container.querySelector('#notif-search-input');
    searchInput?.addEventListener('input', (e) => {
      window.notifSearchQuery = e.target.value;
      renderContent();
      const input = container.querySelector('#notif-search-input');
      input?.focus();
      const val = input.value;
      input.value = '';
      input.value = val;
    });

    // Bind read/unread toggles
    container.querySelector('#btn-toggle-notif-all')?.addEventListener('click', () => {
      window.notifFilterActive = 'all';
      renderContent();
    });
    container.querySelector('#btn-toggle-notif-unread')?.addEventListener('click', () => {
      window.notifFilterActive = 'unread';
      renderContent();
    });

    // Bind Category Tabs
    container.querySelectorAll('.workspace-tab-link').forEach(tab => {
      tab.addEventListener('click', () => {
        window.notifCategoryActive = tab.dataset.category;
        renderContent();
      });
    });

    container.querySelector('#btn-page-notif-clear')?.addEventListener('click', () => {
      markAllNotificationsRead(user.id);
      updateNotificationBadge();
      renderUserSidebar();
      renderContent();
      showToast('All notifications marked as read', 'success');
    });

    container.querySelectorAll('.btn-page-notif-link').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const appId = btn.dataset.appId;
        const mainView = document.getElementById('user-dashboard-view');
        openApplicationDetail(appId, mainView);
      });
    });

    container.querySelectorAll('.btn-page-notif-dismiss').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const notifId = btn.dataset.id;
        dismissNotification(user.id, notifId);
        updateNotificationBadge();
        renderUserSidebar();
        renderContent();
      });
    });

    container.querySelectorAll('.notification-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const notifId = item.dataset.notifId;
        markNotificationRead(notifId);
        updateNotificationBadge();
        renderUserSidebar();
        renderContent();
      });
    });
  };

  renderContent();
}

export function updateNotificationBadge() {
  const user = getCurrentUser();
  if (!user) return;
  const count = getUnreadCount(user.id);
  const badge = document.getElementById('notif-count');
  if (badge) {
    badge.textContent = count;
    badge.classList.toggle('hidden', count === 0);
  }
}

export function showNotificationsDropdown(event) {
  const user = getCurrentUser();
  if (!user) return;
  if (isAdmin() || isSuperAdmin()) {
    openNotificationsModal();
    return;
  }
  
  if (event) {
    event.stopPropagation();
  }

  const existing = document.getElementById('quick-notif-dropdown');
  if (existing) {
    existing.remove();
    return;
  }

  const dropdown = document.createElement('div');
  dropdown.id = 'quick-notif-dropdown';
  dropdown.className = 'notif-dropdown-container';
  
  const notes = getNotifications(user.id).slice(0, 5);
  
  const headerHtml = `
    <div class="notif-dropdown-header">
      <h4>Recent Notifications</h4>
      ${notes.length > 0 ? `<button class="btn-notif-action" id="btn-quick-notif-clear">Mark All Read</button>` : ''}
    </div>
  `;
  
  const getNotifIconCls = (type) => {
    if (type?.includes('ASSIGN') || type?.includes('PUBLISH')) return 'notif-icon-assignment';
    if (type?.includes('SUBMIT')) return 'notif-icon-submission';
    if (type?.includes('DOC') && type?.includes('REQUEST')) return 'notif-icon-docs';
    if (type?.includes('APPROVED')) return 'notif-icon-approved';
    if (type?.includes('REJECTED')) return 'notif-icon-rejected';
    return 'notif-icon-assignment';
  };

  const getNotifIconEmoji = (type) => {
    if (type?.includes('ASSIGN') || type?.includes('PUBLISH')) return '🔔';
    if (type?.includes('SUBMIT')) return '📋';
    if (type?.includes('DOC') && type?.includes('REQUEST')) return '📄';
    if (type?.includes('APPROVED')) return '✅';
    if (type?.includes('REJECTED')) return '❌';
    return '🔔';
  };

  const listHtml = notes.length === 0 ? `
    <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">
      No new notifications.
    </div>
  ` : notes.map(n => `
    <div class="notif-dropdown-item ${n.read ? '' : 'unread'}" data-notif-id="${n.id}" data-app-id="${n.applicationId || ''}">
      <div class="notif-dropdown-icon ${getNotifIconCls(n.eventType)}">
        ${getNotifIconEmoji(n.eventType)}
      </div>
      <div class="notif-dropdown-details">
        <p class="notif-dropdown-text">${n.message}</p>
        <div class="notif-dropdown-meta">
          <span>${new Date(n.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
          <button class="btn-notif-dismiss" data-id="${n.id}">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
    </div>
  `).join('');

  const footerHtml = `
    <div class="notif-dropdown-footer">
      <a href="#" id="link-quick-notif-all">View All Notifications</a>
    </div>
  `;

  dropdown.innerHTML = headerHtml + `<div class="notif-dropdown-list">${listHtml}</div>` + footerHtml;
  
  const bell = document.getElementById('notification-bell');
  const rect = bell.getBoundingClientRect();
  dropdown.style.position = 'fixed';
  dropdown.style.top = `${rect.bottom + 10}px`;
  dropdown.style.right = `${window.innerWidth - rect.right}px`;
  
  document.body.appendChild(dropdown);

  dropdown.querySelector('#btn-quick-notif-clear')?.addEventListener('click', (e) => {
    e.stopPropagation();
    markAllNotificationsRead(user.id);
    updateNotificationBadge();
    dropdown.remove();
    showToast('All notifications marked as read', 'success');
  });

  dropdown.querySelector('#link-quick-notif-all').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    switchUserTab('notifications');
    dropdown.remove();
  });

  dropdown.querySelectorAll('.notif-dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-notif-dismiss')) return;
      
      const notifId = item.dataset.notifId;
      const appId = item.dataset.appId;
      
      markNotificationRead(notifId);
      updateNotificationBadge();
      dropdown.remove();

      if (appId) {
        const mainView = document.getElementById('user-dashboard-view');
        openApplicationDetail(appId, mainView);
      } else {
        switchUserTab('notifications');
      }
    });
  });

  dropdown.querySelectorAll('.btn-notif-dismiss').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const notifId = btn.dataset.id;
      dismissNotification(user.id, notifId);
      updateNotificationBadge();
      dropdown.remove();
      showNotificationsDropdown();
    });
  });

  const closeDropdownOutside = (e) => {
    if (!dropdown.contains(e.target) && e.target !== bell && !bell.contains(e.target)) {
      dropdown.remove();
      document.removeEventListener('click', closeDropdownOutside);
    }
  };
  document.addEventListener('click', closeDropdownOutside);
}

export function openNotificationsModal() {
  const user = getCurrentUser();
  if (!user) return;
  const notes = getNotifications(user.id);
  markAllNotificationsRead(user.id);
  updateNotificationBadge();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop-custom visible';
  backdrop.style.zIndex = '10000';
  
  const notifItems = notes.length === 0 
    ? `<div class="empty-state" style="padding:40px; text-align:center;">
         <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" style="opacity:0.6; margin-bottom:12px;"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></svg>
         <h4 style="margin:0 0 4px 0; color:var(--text-dark);">All caught up!</h4>
         <p style="margin:0; font-size:13px; color:var(--text-muted);">No new messages or notifications.</p>
       </div>`
    : notes.map(n => `
      <div class="notification-item" style="display:flex; gap:12px; padding:12px; border-bottom:1px solid var(--border-color); align-items:flex-start;">
        <div class="notif-dot" style="width:8px; height:8px; border-radius:50%; background:var(--accent-indigo); margin-top:6px; flex-shrink:0; visibility:${n.read ? 'hidden' : 'visible'};"></div>
        <div style="flex:1;">
          <p style="margin:0 0 4px 0; font-size:13.5px; color:var(--text-dark); line-height:1.4;">${n.message}</p>
          <span style="font-size:11px; color:var(--text-muted);">${new Date(n.createdAt).toLocaleString('en-IN')}</span>
        </div>
      </div>
    `).join('');

  backdrop.innerHTML = `
    <div class="modal-card-custom animate-modal-in" style="max-width:500px; padding:24px; border-radius:16px; text-align:left; display:flex; flex-direction:column; max-height:80vh;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid var(--border-color); padding-bottom:12px;">
        <h3 style="margin:0; font-family:var(--font-title); font-weight:700; font-size:18px;">Notification Center</h3>
        <button id="btn-close-notif-modal" style="background:none; border:none; font-size:20px; cursor:pointer; color:var(--text-muted); line-height:1;">&times;</button>
      </div>
      <div style="overflow-y:auto; flex:1; margin-bottom:16px; max-height:50vh;">
        ${notifItems}
      </div>
      <div style="display:flex; justify-content:flex-end;">
        <button class="btn btn-secondary" id="btn-close-notif-modal-ok">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector('#btn-close-notif-modal').addEventListener('click', close);
  backdrop.querySelector('#btn-close-notif-modal-ok').addEventListener('click', close);
}

