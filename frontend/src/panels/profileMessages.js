import { getCurrentUser, isAdmin, isSuperAdmin } from '../auth/auth.js';
import { getUserById, updateUser, getUsers, getUnreadMessageCountFrom, markMessagesRead, sendMessage, getMessagesBetween, getDb } from '../db/store.js';
import { allStates, statesDistrictsData } from '../data/geoData.js';
import { showToast } from '../ui/toastManager.js';
import { renderAdminSidebar } from '../panels/adminPanel.js';
import { renderUserSidebar } from '../panels/userPanel.js';

let activeContactId = null;


export function openProfileModal() {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  
  const user = getUserById(currentUser.id) || currentUser;
  const isStateUser = user.role === 'user';

  let profileFieldsHtml = '';
  if (isStateUser) {
    profileFieldsHtml = `
        <div class="form-group-row" style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:12px;">
          <div class="form-group">
            <label style="display:block; font-weight:600; margin-bottom:6px; font-size:13px; color:var(--text-main);">Name *</label>
            <input type="text" id="modal-prof-name" class="form-input" value="${user.name || user.nodalOfficer || ''}" style="width:100%;" required>
          </div>
          <div class="form-group">
            <label style="display:block; font-weight:600; margin-bottom:6px; font-size:13px; color:var(--text-main);">Official Email *</label>
            <input type="email" id="modal-prof-email" class="form-input" value="${user.email || ''}" style="width:100%;" required>
          </div>
        </div>
        <div class="form-group-row" style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:12px;">
          <div class="form-group">
            <label style="display:block; font-weight:600; margin-bottom:6px; font-size:13px; color:var(--text-main);">Department Name</label>
            <input type="text" id="modal-prof-org" class="form-input" value="${user.organization || ''}" style="width:100%;">
          </div>
          <div class="form-group">
            <label style="display:block; font-weight:600; margin-bottom:6px; font-size:13px; color:var(--text-main);">State / UT Name *</label>
            <select id="modal-prof-state" required class="form-input form-select" style="height:42px; width:100%;">
              <option value="" disabled>Select State</option>
              ${allStates.map(st => `<option value="${st}" ${user.state === st ? 'selected' : ''}>${st}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group-row" style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px;">
          <div class="form-group">
            <label style="display:block; font-weight:600; margin-bottom:6px; font-size:13px; color:var(--text-main);">District *</label>
            <select id="modal-prof-district" required class="form-input form-select" style="height:42px; width:100%;">
              <option value="" disabled>Select District</option>
            </select>
          </div>
        </div>
    `;
  } else {
    profileFieldsHtml = `
        <div class="form-group-row" style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:12px;">
          <div class="form-group">
            <label style="display:block; font-weight:600; margin-bottom:6px; font-size:13px; color:var(--text-main);">Name *</label>
            <input type="text" id="modal-prof-name" class="form-input" value="${user.name || ''}" style="width:100%;" required>
          </div>
          <div class="form-group">
            <label style="display:block; font-weight:600; margin-bottom:6px; font-size:13px; color:var(--text-main);">Official Email *</label>
            <input type="email" id="modal-prof-email" class="form-input" value="${user.email || ''}" style="width:100%;" required>
          </div>
        </div>
        <div class="form-group-row" style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:12px;">
          <div class="form-group">
            <label style="display:block; font-weight:600; margin-bottom:6px; font-size:13px; color:var(--text-main);">Organization / Department</label>
            <input type="text" id="modal-prof-org" class="form-input" value="${user.organization || ''}" style="width:100%;">
          </div>
        </div>
    `;
  }

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop-custom visible';
  backdrop.style.zIndex = '10000';
  backdrop.innerHTML = `
    <div class="modal-card-custom animate-modal-in" style="max-width: 600px; text-align: left; padding: 24px; border-radius: 16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid var(--border-color); padding-bottom:12px;">
        <h3 style="margin:0; font-family:var(--font-title); font-weight:700; font-size:18px;">Edit Profile & Account Settings</h3>
        <button id="btn-close-profile-modal" style="background:none; border:none; font-size:20px; cursor:pointer; color:var(--text-muted); line-height:1;">&times;</button>
      </div>
      
      <form id="modal-profile-form">
        ${profileFieldsHtml}

        <div style="display:flex; justify-content:flex-end; gap:10px; border-top:1px solid var(--border-color); padding-top:16px;">
          <button type="button" class="btn btn-secondary" id="btn-cancel-profile-modal">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Profile Changes</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  
  backdrop.querySelector('#btn-close-profile-modal').addEventListener('click', close);
  backdrop.querySelector('#btn-cancel-profile-modal').addEventListener('click', close);

  const stateSelect = backdrop.querySelector('#modal-prof-state');
  const districtSelect = backdrop.querySelector('#modal-prof-district');

  if (isStateUser && stateSelect && districtSelect) {
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

  backdrop.querySelector('#modal-profile-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = backdrop.querySelector('#modal-prof-name').value.trim();
    const email = backdrop.querySelector('#modal-prof-email').value.trim();
    const organization = backdrop.querySelector('#modal-prof-org').value.trim();
    
    let state = '';
    let district = '';
    if (isStateUser) {
      state = backdrop.querySelector('#modal-prof-state').value;
      district = backdrop.querySelector('#modal-prof-district').value;
    }

    updateUser(user.id, {
      name, email, nodalOfficer: isStateUser ? name : '', organization, state, district,
      sector: '', startupName: '', category: ''
    });

    const updated = getUserById(user.id) || user;
    const sessionUser = { ...updated, password: undefined };
    sessionStorage.setItem('srf_session_v2', JSON.stringify(sessionUser));
    sessionStorage.setItem('srf_current_user', JSON.stringify(sessionUser));
    Object.assign(currentUser, sessionUser);

    document.getElementById('user-display-name').textContent = name || user.username;
    document.getElementById('user-avatar').textContent = (name || user.username)[0].toUpperCase();

    showToast('Profile updated successfully!', 'success');
    close();
  });
}

export function renderMessagesTab(container) {
  if (!container) return;
  const currentUser = getCurrentUser();
  if (!currentUser) return;

  // Clear any existing polling interval to prevent duplication
  if (window.chatPollingInterval) {
    clearInterval(window.chatPollingInterval);
  }

  // Filter contacts (Admins/Superadmins see Users; Users see Admins/Superadmins)
  const allUsers = getUsers();
  const contacts = (currentUser.role === 'superadmin' || currentUser.role === 'admin')
    ? allUsers.filter(u => u.role === 'user')
    : allUsers.filter(u => u.role === 'admin' || u.role === 'superadmin');

  container.innerHTML = `
    <div class="chat-wrapper" style="margin-top:20px;">
      <div class="chat-sidebar">
        <div class="chat-sidebar-header">Chat Contacts</div>
        <div style="padding: 10px 12px; border-bottom: 1px solid var(--border-color);">
          <input type="text" id="chat-contact-search" placeholder="Search contacts..." style="width: 100%; height: 34px; padding: 0 10px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card); color: var(--text-main); font-size: 13px;">
        </div>
        <div class="chat-contact-list" id="chat-contact-list-container"></div>
      </div>
      <div class="chat-main" id="chat-main-container">
        <div style="flex:1; display:flex; align-items:center; justify-content:center; color:var(--text-muted); flex-direction:column; gap:12px;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.5;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <p style="margin:0; font-size:14px; font-weight:500;">Select a contact to start messaging</p>
        </div>
      </div>
    </div>
  `;

  const contactListContainer = container.querySelector('#chat-contact-list-container');
  const mainContainer = container.querySelector('#chat-main-container');

  function renderContactList() {
    const searchVal = container.querySelector('#chat-contact-search')?.value.toLowerCase() || '';
    const filteredContacts = contacts.filter(c => 
      (c.name || '').toLowerCase().startsWith(searchVal) || 
      (c.username || '').toLowerCase().startsWith(searchVal)
    );

    contactListContainer.innerHTML = filteredContacts.map(c => {
      const unreadCount = getUnreadMessageCountFrom(c.id, currentUser.id);
      const activeClass = activeContactId === c.id ? 'active' : '';
      const initial = (c.username || c.name || 'U').charAt(0).toUpperCase();
      return `
        <div class="chat-contact-item ${activeClass}" data-id="${c.id}">
          <div class="chat-contact-avatar">${initial}</div>
          <div class="chat-contact-meta">
            <div class="chat-contact-name">${c.name || c.username}</div>
            <div class="chat-contact-role">${c.role}</div>
          </div>
          ${unreadCount > 0 ? `<div class="chat-unread-badge">${unreadCount}</div>` : ''}
        </div>
      `;
    }).join('');

    contactListContainer.querySelectorAll('.chat-contact-item').forEach(item => {
      item.addEventListener('click', () => {
        const cid = item.dataset.id;
        activeContactId = cid;
        markMessagesRead(cid, currentUser.id);
        
        // Re-render sidebar to update unread badge
        if (isAdmin() || isSuperAdmin()) {
          renderAdminSidebar();
        } else {
          renderUserSidebar();
        }
        
        renderContactList();
        renderChatArea(cid);
      });
    });
  }

  container.querySelector('#chat-contact-search')?.addEventListener('input', () => {
    renderContactList();
  });

  function renderChatArea(contactId) {
    const contact = getUserById(contactId) || { username: 'User', role: 'user' };
    mainContainer.innerHTML = `
      <div class="chat-main-header">
        <div class="chat-contact-avatar">${(contact.username || contact.name || 'U').charAt(0).toUpperCase()}</div>
        <div>
          <div class="chat-main-header-name">${contact.name || contact.username}</div>
          <div style="font-size:11px; color:var(--text-muted); text-transform:capitalize;">${contact.role}</div>
        </div>
      </div>
      <div class="chat-thread" id="chat-thread-container"></div>
      <form class="chat-input-area" id="chat-send-form">
        <input type="text" class="chat-input" id="chat-msg-input" placeholder="Type a message..." autocomplete="off" required>
        <button type="submit" class="btn btn-primary" style="padding:10px 20px;">Send</button>
      </form>
    `;

    renderChatThread(contactId);

    const form = mainContainer.querySelector('#chat-send-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = mainContainer.querySelector('#chat-msg-input');
      const text = input.value.trim();
      if (!text) return;

      sendMessage(currentUser.id, contactId, text);
      input.value = '';
      renderChatThread(contactId);
    });
  }

  function renderChatThread(contactId) {
    const threadContainer = mainContainer.querySelector('#chat-thread-container');
    if (!threadContainer) return;

    const msgs = getMessagesBetween(currentUser.id, contactId);
    threadContainer.innerHTML = msgs.map(m => {
      const type = m.senderId === currentUser.id ? 'sent' : 'received';
      const timeStr = m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      return `
        <div class="chat-bubble ${type}">
          <div>${m.content}</div>
          <div class="chat-bubble-time">${timeStr}</div>
        </div>
      `;
    }).join('');

    // Scroll thread to bottom
    threadContainer.scrollTop = threadContainer.scrollHeight;
  }

  // Initial render of contact list
  renderContactList();

  // If a contact was already active, preserve it
  if (activeContactId && contacts.some(c => c.id === activeContactId)) {
    renderChatArea(activeContactId);
  }

  // Polling every 5 seconds
  window.chatPollingInterval = setInterval(async () => {
    try {
      const res = await fetch('/api/db');
      if (res.ok) {
        const remoteDb = await res.json();
        const localDb = getDb();
        if (remoteDb.messages && JSON.stringify(remoteDb.messages) !== JSON.stringify(localDb.messages || [])) {
          localDb.messages = remoteDb.messages;
          
          // Refresh thread if active
          if (activeContactId) {
            // Also mark new incoming messages as read if thread is currently open
            markMessagesRead(activeContactId, currentUser.id);
            renderChatThread(activeContactId);
          }

          // Update badges
          if (isAdmin() || isSuperAdmin()) {
            renderAdminSidebar();
          } else {
            renderUserSidebar();
          }

          renderContactList();
        }
      }
    } catch (e) {
      console.warn('[Chat Polling] Error fetching database:', e);
    }
  }, 5000);
}

