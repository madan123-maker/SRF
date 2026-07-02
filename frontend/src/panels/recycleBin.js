import { getUserById, getRecycleBin, deleteFromRecycleBin, restoreFromRecycleBin } from '../db/store.js';
import { showToast } from '../ui/toastManager.js';
import { showConfirm } from '../ui/confirmDialog.js';


export function openRecycleBinViewModal(item, onRestore, onDelete) {
  const backdrop = document.createElement('div');
  backdrop.style.cssText = `
    position: fixed;
    top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.6);
    backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center;
    z-index: 10000; opacity: 0; transition: opacity 0.3s ease;
  `;
  
  const deletedDate = new Date(item.deletedAt).toLocaleString('en-IN');
  const now = Date.now();
  const deletedAtMs = new Date(item.deletedAt).getTime();
  const daysElapsed = Math.floor((now - deletedAtMs) / (24 * 60 * 60 * 1000));
  const daysLeft = Math.max(0, 30 - daysElapsed);
  
  const getTypeLabel = (type) => {
    switch (type) {
      case 'edition': return 'SRF / Edition';
      case 'assignment': return 'Assignment';
      case 'application': return 'Application';
      case 'user': return 'User';
      case 'department': return 'Department';
      case 'reformArea': return 'Reform Area';
      case 'field': return 'Action Point';
      case 'guideline': return 'Guideline';
      case 'notification': return 'Notification';
      default: return 'File Upload';
    }
  };

  const getModuleLabel = (type) => {
    switch (type) {
      case 'edition': return 'Editions Module';
      case 'assignment': return 'Assignments Module';
      case 'application': return 'Applications Module';
      case 'user': return 'User Directory';
      case 'department': return 'Department Registry';
      case 'reformArea': return 'Reform Area Config';
      case 'field': return 'Action Point Config';
      case 'guideline': return 'Guidelines Module';
      case 'notification': return 'Notification Center';
      default: return 'Submission Files';
    }
  };

  let entityDetailsHtml = '';
  const formatPayload = (data) => {
    if (!data) return '<p style="color:var(--text-muted);">No payload data available.</p>';
    try {
      return `<pre style="background:var(--bg-secondary); border:1px solid var(--border-color); padding:12px; border-radius:8px; overflow-x:auto; font-family:monospace; font-size:12px; color:var(--text-main); max-height:220px; white-space:pre-wrap; word-break:break-all;">${JSON.stringify(data, null, 2)}</pre>`;
    } catch(e) {
      return '<p style="color:#ef4444;">Error formatting payload data.</p>';
    }
  };
  
  let payloadLabel = 'Deleted Object Payload';
  let payloadContent = '';
  
  if (item.type === 'edition') {
    payloadContent = formatPayload(item.editionData);
    entityDetailsHtml = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px; font-size:13px; color:var(--text-dark);">
        <div><strong>Edition Name:</strong> ${item.editionData?.name || '—'}</div>
        <div><strong>Status:</strong> ${item.editionData?.status || '—'}</div>
        <div><strong>Reform Areas Count:</strong> ${item.reformAreasData?.length || 0}</div>
        <div><strong>Form Fields Count:</strong> ${item.fieldsData?.length || 0}</div>
      </div>
    `;
  } else if (item.type === 'application') {
    const userObj = getUserById(item.appData?.userId);
    const userInfoHtml = userObj ? `
      <div style="margin-top:10px; padding:10px; background:var(--bg-secondary); border-radius:6px; border:1px solid var(--border-color);">
        <h5 style="margin:0 0 6px 0; font-size:12px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">User Information</h5>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <div><strong>Name:</strong> ${userObj.name || userObj.username || '—'}</div>
          <div><strong>Email:</strong> ${userObj.email || '—'}</div>
          <div><strong>Organization:</strong> ${userObj.organization || '—'}</div>
          <div><strong>Contact:</strong> ${userObj.phone || userObj.contact || '—'}</div>
        </div>
      </div>
    ` : '<p style="color:var(--text-muted);">No associated user information found.</p>';

    const statusHistoryHtml = (item.appData?.timeline || []).length > 0 ? `
      <div style="margin-top:10px; padding:10px; background:var(--bg-secondary); border-radius:6px; border:1px solid var(--border-color);">
        <h5 style="margin:0 0 6px 0; font-size:12px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">Status History / Timeline</h5>
        <div style="max-height:120px; overflow-y:auto; font-size:12px;">
          ${item.appData.timeline.map(t => `
            <div style="margin-bottom:6px; border-bottom:1px dashed var(--border-color); padding-bottom:4px;">
              <div><strong>${t.action}</strong> by ${t.by}</div>
              <div style="color:var(--text-muted); font-size:11px;">${new Date(t.timestamp).toLocaleString('en-IN')}</div>
              ${t.remarks ? `<div style="font-style:italic; color:var(--text-dark); margin-top:2px;">"${t.remarks}"</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    ` : '<p style="color:var(--text-muted);">No status history timeline found.</p>';

    const allFiles = [];
    (item.answersData || []).forEach(ans => {
      if (ans.files && Array.isArray(ans.files)) {
        ans.files.forEach(f => {
          allFiles.push({
            name: f.name,
            type: f.type,
            size: f.size,
            docId: f.docId,
            fieldId: ans.fieldId,
            appId: ans.applicationId || item.appData?.id || ''
          });
        });
      }
    });

    const uploadedDocsHtml = allFiles.length > 0 ? `
      <div style="margin-top:10px; padding:10px; background:var(--bg-secondary); border-radius:6px; border:1px solid var(--border-color);">
        <h5 style="margin:0 0 6px 0; font-size:12px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">Uploaded Documents</h5>
        <div style="font-size:12px; display:flex; flex-direction:column; gap:6px;">
          ${allFiles.map(file => {
            const downloadUrl = `/api/files/${file.appId}/${file.fieldId}/${file.docId}`;
            const sizeStr = file.size ? ` (${(file.size / 1024).toFixed(1)} KB)` : '';
            return `
              <div style="display:flex; align-items:center; justify-content:space-between; padding:4px 0; border-bottom:1px dashed var(--border-color);">
                <span style="font-weight:500; color:var(--text-dark); word-break:break-all;">📄 ${file.name}${sizeStr} <span style="font-size:11px; color:var(--text-muted);">(${file.fieldId})</span></span>
                <a href="${downloadUrl}" target="_blank" class="btn btn-xs btn-outline" style="padding:2px 8px; font-size:11px; white-space:nowrap; text-decoration:none;">Download</a>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    ` : '<p style="color:var(--text-muted);">No uploaded documents found.</p>';

    const formDataHtml = (item.answersData || []).length > 0 ? `
      <div style="margin-top:10px; padding:10px; background:var(--bg-secondary); border-radius:6px; border:1px solid var(--border-color);">
        <h5 style="margin:0 0 6px 0; font-size:12px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">Form Responses / Answers</h5>
        <div style="max-height:180px; overflow-y:auto; font-size:12px;">
          ${item.answersData.map(ans => `
            <div style="margin-bottom:8px; border-bottom:1px solid var(--border-color); padding-bottom:6px;">
              <div style="font-weight:600; color:var(--text-main);">Question/Field: ${ans.fieldId}</div>
              <div style="background:var(--bg-primary); padding:6px; border-radius:4px; margin-top:2px;">
                <strong>Response:</strong> ${ans.value || '<span style="color:var(--text-muted);">Empty</span>'}
                ${ans.remarks ? `<br><strong>Remarks:</strong> ${ans.remarks}` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : '<p style="color:var(--text-muted);">No form responses / answers available.</p>';

    payloadContent = `
      <div style="display:flex; flex-direction:column; gap:12px; margin-top:12px;">
        ${userInfoHtml}
        ${uploadedDocsHtml}
        ${formDataHtml}
        ${statusHistoryHtml}
      </div>
    `;

    entityDetailsHtml = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px; font-size:13px; color:var(--text-dark);">
        <div><strong>Application ID:</strong> ${item.appData?.id || '—'}</div>
        <div><strong>Edition:</strong> ${item.appData?.editionId || '—'}</div>
        <div><strong>Financial Year:</strong> ${item.appData?.financialYear || '—'}</div>
        <div><strong>State/UT:</strong> ${item.appData?.state || '—'}</div>
        <div><strong>Current Status:</strong> ${item.appData?.status || '—'}</div>
        <div><strong>Answers Count:</strong> ${item.answersData?.length || 0}</div>
      </div>
    `;
  } else if (item.type === 'user') {
    payloadContent = formatPayload(item.userData);
    entityDetailsHtml = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px; font-size:13px; color:var(--text-dark);">
        <div><strong>Username:</strong> ${item.userData?.username || '—'}</div>
        <div><strong>Email:</strong> ${item.userData?.email || '—'}</div>
        <div><strong>Role:</strong> ${item.userData?.role || '—'}</div>
        <div><strong>Organization:</strong> ${item.userData?.organization || '—'}</div>
      </div>
    `;
  } else if (item.type === 'department') {
    payloadContent = formatPayload(item.departmentData);
    entityDetailsHtml = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px; font-size:13px; color:var(--text-dark);">
        <div><strong>Department Name:</strong> ${item.departmentData?.name || '—'}</div>
        <div><strong>Code:</strong> ${item.departmentData?.code || '—'}</div>
      </div>
    `;
  } else if (item.type === 'reformArea') {
    payloadContent = formatPayload(item.reformAreaData);
    entityDetailsHtml = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px; font-size:13px; color:var(--text-dark);">
        <div><strong>Reform Area Name:</strong> ${item.reformAreaData?.name || item.reformAreaData?.title || '—'}</div>
        <div><strong>Edition ID:</strong> ${item.reformAreaData?.editionId || '—'}</div>
      </div>
    `;
  } else if (item.type === 'field') {
    payloadContent = formatPayload(item.fieldData);
    entityDetailsHtml = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px; font-size:13px; color:var(--text-dark);">
        <div><strong>Field Question:</strong> ${item.fieldData?.questionText || item.fieldData?.name || '—'}</div>
        <div><strong>Field Type:</strong> ${item.fieldData?.type || '—'}</div>
      </div>
    `;
  } else if (item.type === 'assignment') {
    payloadContent = formatPayload(item.assignmentData);
    entityDetailsHtml = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px; font-size:13px; color:var(--text-dark);">
        <div><strong>User Assigned:</strong> ${item.assignmentData?.userId || '—'}</div>
        <div><strong>Edition ID:</strong> ${item.assignmentData?.editionId || '—'}</div>
        <div><strong>Reform Area:</strong> ${item.assignmentData?.reformAreaId || '—'}</div>
      </div>
    `;
  } else {
    payloadLabel = 'File Data';
    if (item.dataUrl) {
      payloadContent = `
        <div style="text-align:center; padding:20px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:8px;">
          <div style="font-size:48px; margin-bottom:12px;">📄</div>
          <div style="font-size:14px; font-weight:700; color:var(--text-dark); margin-bottom:4px;">${item.name}</div>
          <div style="font-size:12px; color:var(--text-muted); margin-bottom:16px;">Type: ${item.type || '—'} | Size: ${item.size ? (item.size / 1024).toFixed(1) + ' KB' : '—'}</div>
          <a href="${item.dataUrl}" download="${item.name}" class="btn btn-sm btn-primary" style="display:inline-flex; align-items:center; gap:8px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Download File
          </a>
        </div>
      `;
    } else {
      payloadContent = '<p style="color:var(--text-muted);">No file content available.</p>';
    }
  }

  backdrop.innerHTML = `
    <div style="background:var(--bg-primary); border:1px solid var(--border-color); border-radius:16px; width:100%; max-width:600px; padding:24px; box-shadow:0 10px 40px rgba(0,0,0,0.3); transform:scale(0.9); transition:transform 0.3s ease; display:flex; flex-direction:column; max-height:85vh;">
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:16px; margin-bottom:16px;">
        <div>
          <span style="font-size:11px; font-weight:700; color:var(--accent-indigo); text-transform:uppercase; letter-spacing:1px; background:rgba(79,70,229,0.1); padding:3px 8px; border-radius:4px; margin-bottom:6px; display:inline-block;">${getTypeLabel(item.type).toUpperCase()} DETAILS</span>
          <h2 style="margin:0; font-size:20px; font-weight:800; color:var(--text-dark);">${item.name}</h2>
        </div>
        <button id="close-rb-view-btn" style="background:transparent; border:none; color:var(--text-muted); font-size:24px; cursor:pointer; line-height:1;">&times;</button>
      </div>
      
      <div style="flex:1; overflow-y:auto; padding-right:6px;">
        <div style="background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:10px; padding:12px 16px; display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px; font-size:13px; color:var(--text-dark);">
          <div><span style="color:var(--text-muted);">Deleted By:</span> <strong>${item.deletedBy || 'user'}</strong></div>
          <div><span style="color:var(--text-muted);">Deleted Date:</span> <strong>${deletedDate}</strong></div>
          <div><span style="color:var(--text-muted);">Days until Purge:</span> <strong style="color:#ef4444;">${daysLeft} days remaining</strong></div>
          <div><span style="color:var(--text-muted);">Item ID:</span> <span style="font-family:monospace; font-size:11px;">${item.id}</span></div>
        </div>
        
        ${entityDetailsHtml}
        
        <div style="margin-top:16px;">
          <h4 style="margin:0 0 8px 0; font-size:14px; font-weight:700; color:var(--text-dark);">${payloadLabel}</h4>
          ${payloadContent}
        </div>
      </div>
      
      <div style="display:flex; justify-content:flex-end; gap:12px; border-top:1px solid var(--border-color); padding-top:16px; margin-top:20px;">
        <button id="rb-view-close-bottom-btn" class="btn btn-outline" style="min-width:90px; height:36px; padding:6px 16px;">Close</button>
        <button id="rb-view-restore-btn" class="btn btn-success-solid" style="min-width:110px; height:36px; padding:6px 16px;">↩ Restore</button>
        <button id="rb-view-purge-btn" class="btn btn-danger" style="min-width:140px; height:36px; padding:6px 16px;">✕ Delete Permanently</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(backdrop);
  
  // Transition in
  requestAnimationFrame(() => {
    backdrop.style.opacity = '1';
    backdrop.firstElementChild.style.transform = 'scale(1)';
  });
  
  const closeModal = () => {
    backdrop.style.opacity = '0';
    backdrop.firstElementChild.style.transform = 'scale(0.9)';
    setTimeout(() => {
      if (document.body.contains(backdrop)) {
        document.body.removeChild(backdrop);
      }
    }, 300);
  };
  
  backdrop.querySelector('#close-rb-view-btn').addEventListener('click', closeModal);
  backdrop.querySelector('#rb-view-close-bottom-btn').addEventListener('click', closeModal);
  
  backdrop.querySelector('#rb-view-restore-btn').addEventListener('click', () => {
    closeModal();
    onRestore(item.id);
  });
  
  backdrop.querySelector('#rb-view-purge-btn').addEventListener('click', () => {
    closeModal();
    onDelete(item.id, item.type);
  });
}

export function renderRecycleBinPanel(container) {
  // Auto-purge items older than 30 days
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const allItemsBeforePurge = getRecycleBin();
  const expiredIds = allItemsBeforePurge.filter(item => (now - new Date(item.deletedAt).getTime()) > THIRTY_DAYS_MS).map(i => i.id);
  if (expiredIds.length > 0) {
    expiredIds.forEach(id => deleteFromRecycleBin(id));
    showToast(`${expiredIds.length} expired item(s) auto-purged after 30 days.`, 'info');
  }

  const items = getRecycleBin();

  // Initialize filter state if not present
  container.state = container.state || {
    searchQuery: '',
    entityType: 'all',
    deletedBy: 'all',
    startDate: '',
    endDate: '',
    currentPage: 1,
    pageSize: 5
  };
  const state = container.state;

  // Stats calculation
  const totalDeleted = items.length;
  const deletedSRFs = items.filter(i => i.type === 'edition').length;
  const deletedAssignments = items.filter(i => i.type === 'assignment').length;
  const deletedApplications = items.filter(i => i.type === 'application').length;
  const deletedUsers = items.filter(i => i.type === 'user').length;
  const deletedDepartments = items.filter(i => i.type === 'department').length;
  const deletedReformAreas = items.filter(i => i.type === 'reformArea').length;
  const deletedActionPoints = items.filter(i => i.type === 'field').length;

  // Filter items
  const filtered = items.filter(item => {
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      const matchName = (item.name || '').toLowerCase().includes(q);
      const matchDeletedBy = (item.deletedBy || '').toLowerCase().includes(q);
      const matchType = (item.type || '').toLowerCase().includes(q);
      if (!matchName && !matchDeletedBy && !matchType) return false;
    }
    if (state.entityType !== 'all') {
      if (item.type !== state.entityType) return false;
    }
    if (state.deletedBy !== 'all') {
      if (item.deletedBy !== state.deletedBy) return false;
    }
    if (state.startDate) {
      const startMs = new Date(state.startDate + 'T00:00:00').getTime();
      const itemMs = new Date(item.deletedAt).getTime();
      if (itemMs < startMs) return false;
    }
    if (state.endDate) {
      const endMs = new Date(state.endDate + 'T23:59:59').getTime();
      const itemMs = new Date(item.deletedAt).getTime();
      if (itemMs > endMs) return false;
    }
    return true;
  });

  // Pagination bounds check
  const totalPages = Math.ceil(filtered.length / state.pageSize) || 1;
  if (state.currentPage > totalPages) state.currentPage = totalPages;
  if (state.currentPage < 1) state.currentPage = 1;
  const paginated = filtered.slice((state.currentPage - 1) * state.pageSize, state.currentPage * state.pageSize);

  const urgencyRing = (daysLeft) => {
    if (daysLeft <= 3) return { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: 'Critical' };
    if (daysLeft <= 7) return { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: 'Urgent' };
    if (daysLeft <= 14) return { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', label: 'Soon' };
    return { color: '#10b981', bg: 'rgba(16,185,129,0.1)', label: 'Safe' };
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case 'edition': return 'SRF / Edition';
      case 'assignment': return 'Assignment';
      case 'application': return 'Application';
      case 'user': return 'User';
      case 'department': return 'Department';
      case 'reformArea': return 'Reform Area';
      case 'field': return 'Action Point';
      case 'guideline': return 'Guideline';
      case 'notification': return 'Notification';
      default: return 'File Upload';
    }
  };

  const getModuleLabel = (type) => {
    switch (type) {
      case 'edition': return 'Editions Module';
      case 'assignment': return 'Assignments Module';
      case 'application': return 'Applications Module';
      case 'user': return 'User Directory';
      case 'department': return 'Department Registry';
      case 'reformArea': return 'Reform Area Config';
      case 'field': return 'Action Point Config';
      case 'guideline': return 'Guidelines Module';
      case 'notification': return 'Notification Center';
      default: return 'Submission Files';
    }
  };

  const uniqueDeletedBy = [...new Set(items.map(x => x.deletedBy || 'user'))];

  // Render HTML structure
  container.innerHTML = `
    <div class="section-card" style="margin-bottom:24px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
        <div>
          <div class="section-badge admin-badge" style="display:inline-flex;align-items:center;gap:6px;margin-bottom:8px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Super Admin
          </div>
          <h1 style="margin:0 0 6px 0;">Recycle Bin</h1>
          <p style="color:var(--text-muted);font-size:14px;margin:0;">Deleted items are stored for <strong>30 days</strong> before permanent removal. Only Super Admin has access to view, restore, or permanently delete items.</p>
        </div>
      </div>
    </div>

    <!-- Stats Grid (5 Cards - Clickable) -->
    <div style="display:grid;grid-template-columns:repeat(5, 1fr);gap:12px;margin-bottom:24px;">
      <div class="card glass-card rb-stat-card" data-filter-type="all" style="padding:14px;text-align:center;border-left:4px solid var(--accent-indigo);cursor:pointer;transition:transform 0.15s, box-shadow 0.15s;">
        <div style="font-size:24px;font-weight:800;color:var(--accent-indigo);">${totalDeleted}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;font-weight:600;">Total Items</div>
      </div>
      <div class="card glass-card rb-stat-card" data-filter-type="edition" style="padding:14px;text-align:center;border-left:4px solid #ef4444;cursor:pointer;transition:transform 0.15s, box-shadow 0.15s;">
        <div style="font-size:24px;font-weight:800;color:#ef4444;">${deletedSRFs}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;font-weight:600;">SRFs (Editions)</div>
      </div>
      <div class="card glass-card rb-stat-card" data-filter-type="assignment" style="padding:14px;text-align:center;border-left:4px solid #f59e0b;cursor:pointer;transition:transform 0.15s, box-shadow 0.15s;">
        <div style="font-size:24px;font-weight:800;color:#f59e0b;">${deletedAssignments}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;font-weight:600;">Assignments</div>
      </div>
      <div class="card glass-card rb-stat-card" data-filter-type="application" style="padding:14px;text-align:center;border-left:4px solid #3b82f6;cursor:pointer;transition:transform 0.15s, box-shadow 0.15s;">
        <div style="font-size:24px;font-weight:800;color:#3b82f6;">${deletedApplications}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;font-weight:600;">Applications</div>
      </div>
      <div class="card glass-card rb-stat-card" data-filter-type="user" style="padding:14px;text-align:center;border-left:4px solid #10b981;cursor:pointer;transition:transform 0.15s, box-shadow 0.15s;">
        <div style="font-size:24px;font-weight:800;color:#10b981;">${deletedUsers}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;font-weight:600;">Users</div>
      </div>
    </div>

    <!-- Search & Filters Panel -->
    <div class="card glass-card" style="padding:16px;margin-bottom:20px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;">
      <div style="flex:1;min-width:240px;position:relative;">
        <input type="text" id="rb-search-input" class="form-input" placeholder="Search by item name, deleted by..." value="${state.searchQuery}" style="width:100%;height:38px;padding-left:36px;">
        <span style="position:absolute;left:12px;top:10px;color:var(--text-muted);">🔍</span>
      </div>
      
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <label style="font-size:12px;font-weight:600;color:var(--text-muted);">Deleted By:</label>
        <select id="rb-deletedby-select" class="form-input" style="height:38px;padding:6px 12px;min-width:140px;">
          <option value="all">All Users</option>
          ${uniqueDeletedBy.map(u => `<option value="${u}" ${state.deletedBy === u ? 'selected' : ''}>${u}</option>`).join('')}
        </select>
        
        <label style="font-size:12px;font-weight:600;color:var(--text-muted);margin-left:8px;">Date From:</label>
        <input type="date" id="rb-start-date" class="form-input" value="${state.startDate}" style="height:38px;width:140px;">
        
        <label style="font-size:12px;font-weight:600;color:var(--text-muted);">To:</label>
        <input type="date" id="rb-end-date" class="form-input" value="${state.endDate}" style="height:38px;width:140px;">
        
        <button id="rb-clear-filters" class="btn btn-outline" style="height:38px;padding:0 16px;">Clear</button>
      </div>
    </div>

    <!-- Main Content Container with Tabs -->
    <div class="card glass-card">
      <div class="card-header" style="border-bottom:1px solid var(--border-color);padding-bottom:0;">
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:-1px;">
          <button class="btn btn-xs btn-outline rb-tab-btn ${state.entityType === 'all' ? 'active' : ''}" data-type="all" style="padding:8px 16px;border-radius:8px 8px 0 0;border-bottom:none;">All Deleted Items (${totalDeleted})</button>
          <button class="btn btn-xs btn-outline rb-tab-btn ${state.entityType === 'edition' ? 'active' : ''}" data-type="edition" style="padding:8px 16px;border-radius:8px 8px 0 0;border-bottom:none;">SRFs (${deletedSRFs})</button>
          <button class="btn btn-xs btn-outline rb-tab-btn ${state.entityType === 'assignment' ? 'active' : ''}" data-type="assignment" style="padding:8px 16px;border-radius:8px 8px 0 0;border-bottom:none;">Assignments (${deletedAssignments})</button>
          <button class="btn btn-xs btn-outline rb-tab-btn ${state.entityType === 'application' ? 'active' : ''}" data-type="application" style="padding:8px 16px;border-radius:8px 8px 0 0;border-bottom:none;">Applications (${deletedApplications})</button>
          <button class="btn btn-xs btn-outline rb-tab-btn ${state.entityType === 'user' ? 'active' : ''}" data-type="user" style="padding:8px 16px;border-radius:8px 8px 0 0;border-bottom:none;">Users (${deletedUsers})</button>
          <button class="btn btn-xs btn-outline rb-tab-btn ${state.entityType === 'department' ? 'active' : ''}" data-type="department" style="padding:8px 16px;border-radius:8px 8px 0 0;border-bottom:none;">Departments (${deletedDepartments})</button>
          <button class="btn btn-xs btn-outline rb-tab-btn ${state.entityType === 'reformArea' ? 'active' : ''}" data-type="reformArea" style="padding:8px 16px;border-radius:8px 8px 0 0;border-bottom:none;">Reform Areas (${deletedReformAreas})</button>
          <button class="btn btn-xs btn-outline rb-tab-btn ${state.entityType === 'field' ? 'active' : ''}" data-type="field" style="padding:8px 16px;border-radius:8px 8px 0 0;border-bottom:none;">Action Points (${deletedActionPoints})</button>
        </div>
      </div>
      
      <div class="card-body" style="padding:16px;">
        ${filtered.length === 0 ? `
          <div class="empty-state" style="padding:60px 20px;text-align:center;">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--border-color)" stroke-width="1">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              <line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
            <h3 style="margin:16px 0 8px 0;color:var(--text-dark);">No Items Found</h3>
            <p style="color:var(--text-muted);font-size:13px;margin:0 0 16px 0;">No deleted records match your active search filter or date ranges.</p>
          </div>
        ` : `
          <div style="overflow-x:auto;">
            <table class="admin-dashboard-table" style="width:100%;border-collapse:collapse;font-size:13px;color:var(--text-dark);">
              <thead>
                <tr>
                  <th style="text-align:left;padding:12px;">Item Name</th>
                  <th style="text-align:left;padding:12px;">Item Type</th>
                  <th style="text-align:left;padding:12px;">Deleted By</th>
                  <th style="text-align:left;padding:12px;">Deleted Date</th>
                  <th style="text-align:left;padding:12px;">Original Module</th>
                  <th style="text-align:left;padding:12px;">Status</th>
                  <th style="text-align:left;padding:12px;width:240px;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${paginated.map(item => {
                  const deletedDate = new Date(item.deletedAt).toLocaleString('en-IN');
                  const deletedAtMs = new Date(item.deletedAt).getTime();
                  const daysElapsed = Math.floor((now - deletedAtMs) / (24 * 60 * 60 * 1000));
                  const daysLeft = Math.max(0, 30 - daysElapsed);
                  const urgency = urgencyRing(daysLeft);
                  const isFile = item.type !== 'edition' && item.type !== 'assignment' && item.type !== 'application' && item.type !== 'user' && item.type !== 'department' && item.type !== 'reformArea' && item.type !== 'field';
                  
                  return `
                    <tr style="border-bottom:1px solid var(--border-color);">
                      <td style="padding:12px;font-weight:600;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.name}</td>
                      <td style="padding:12px;">
                        <span class="status-badge" style="background:${urgency.bg};color:${urgency.color};font-weight:600;text-transform:none;font-size:11px;padding:3px 8px;">
                          ${getTypeLabel(item.type)}
                        </span>
                      </td>
                      <td style="padding:12px;font-weight:600;color:var(--text-main);">${item.deletedBy || 'user'}</td>
                      <td style="padding:12px;color:var(--text-muted);font-size:12px;">${deletedDate}</td>
                      <td style="padding:12px;color:var(--text-muted);font-size:12px;">${getModuleLabel(item.type)}</td>
                      <td style="padding:12px;">
                        <span class="status-badge" style="background:${urgency.bg};color:${urgency.color};font-size:11px;padding:3px 8px;border:1px solid ${urgency.color}33;">
                          ${daysLeft} days left
                        </span>
                      </td>
                      <td style="padding:12px;">
                        <div style="display:flex;gap:6px;">
                          <button class="btn btn-xs btn-outline btn-view-rb" data-id="${item.id}">View</button>
                          <button class="btn btn-xs btn-success-solid btn-restore-rb" data-id="${item.id}">Restore</button>
                          ${isFile && item.dataUrl ? `<button class="btn btn-xs btn-primary btn-download-rb" data-id="${item.id}">Download</button>` : ''}
                          <button class="btn btn-xs btn-danger btn-delete-rb" data-id="${item.id}" data-type="${item.type}">Purge</button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
          
          <!-- Pagination Control Footer -->
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding-top:16px;border-top:1px solid var(--border-color);flex-wrap:wrap;gap:12px;font-size:13px;color:var(--text-muted);">
            <div>
              Showing <strong>${(state.currentPage - 1) * state.pageSize + 1}</strong> to <strong>${Math.min(state.currentPage * state.pageSize, filtered.length)}</strong> of <strong>${filtered.length}</strong> entries
            </div>
            
            <div style="display:flex;gap:4px;align-items:center;">
              <button class="btn btn-xs btn-outline" id="rb-prev-page" ${state.currentPage === 1 ? 'disabled' : ''}>Prev</button>
              ${Array.from({ length: totalPages }, (_, idx) => {
                const pNum = idx + 1;
                return `<button class="btn btn-xs ${state.currentPage === pNum ? 'btn-primary-solid' : 'btn-outline'} rb-page-btn" data-page="${pNum}">${pNum}</button>`;
              }).join('')}
              <button class="btn btn-xs btn-outline" id="rb-next-page" ${state.currentPage === totalPages ? 'disabled' : ''}>Next</button>
            </div>
          </div>
        `}
      </div>
    </div>
  `;

  // Attach search listeners
  const searchInput = container.querySelector('#rb-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      state.currentPage = 1;
      clearTimeout(window.rbSearchTimeout);
      window.rbSearchTimeout = setTimeout(() => {
        renderRecycleBinPanel(container);
      }, 300);
    });
    // Keep focus at the end of text
    searchInput.focus();
    searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
  }

  // Attach dropdown/date listeners
  container.querySelector('#rb-deletedby-select')?.addEventListener('change', (e) => {
    state.deletedBy = e.target.value;
    state.currentPage = 1;
    renderRecycleBinPanel(container);
  });
  
  container.querySelector('#rb-start-date')?.addEventListener('change', (e) => {
    state.startDate = e.target.value;
    state.currentPage = 1;
    renderRecycleBinPanel(container);
  });
  
  container.querySelector('#rb-end-date')?.addEventListener('change', (e) => {
    state.endDate = e.target.value;
    state.currentPage = 1;
    renderRecycleBinPanel(container);
  });

  container.querySelector('#rb-clear-filters')?.addEventListener('click', () => {
    state.searchQuery = '';
    state.entityType = 'all';
    state.deletedBy = 'all';
    state.startDate = '';
    state.endDate = '';
    state.currentPage = 1;
    renderRecycleBinPanel(container);
  });

  // Attach tab listeners
  container.querySelectorAll('.rb-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.entityType = btn.dataset.type;
      state.currentPage = 1;
      renderRecycleBinPanel(container);
    });
  });

  // Attach stat card click listeners (clickable cards filter view)
  container.querySelectorAll('.rb-stat-card').forEach(card => {
    card.addEventListener('mouseenter', () => { card.style.transform = 'translateY(-2px)'; card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; card.style.boxShadow = ''; });
    card.addEventListener('click', () => {
      state.entityType = card.dataset.filterType;
      state.currentPage = 1;
      renderRecycleBinPanel(container);
    });
  });

  // Attach pagination listeners
  container.querySelectorAll('.rb-page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.currentPage = parseInt(btn.dataset.page);
      renderRecycleBinPanel(container);
    });
  });

  container.querySelector('#rb-prev-page')?.addEventListener('click', () => {
    if (state.currentPage > 1) {
      state.currentPage--;
      renderRecycleBinPanel(container);
    }
  });

  container.querySelector('#rb-next-page')?.addEventListener('click', () => {
    if (state.currentPage < totalPages) {
      state.currentPage++;
      renderRecycleBinPanel(container);
    }
  });

  // Action listeners - View
  container.querySelectorAll('.btn-view-rb').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = getRecycleBin().find(x => x.id === btn.dataset.id);
      if (item) {
        openRecycleBinViewModal(item, 
          // onRestore
          (id) => {
            const success = restoreFromRecycleBin(id);
            showToast(success ? 'Item restored successfully!' : 'Failed to restore item.', success ? 'success' : 'error');
            if (success) renderRecycleBinPanel(container);
          },
          // onDelete
          (id, type) => {
            triggerPurgeConfirm(id, type);
          }
        );
      }
    });
  });

  // Action listeners - Restore
  container.querySelectorAll('.btn-restore-rb').forEach(btn => {
    btn.addEventListener('click', () => {
      const success = restoreFromRecycleBin(btn.dataset.id);
      showToast(success ? 'Item restored successfully!' : 'Failed to restore item.', success ? 'success' : 'error');
      if (success) renderRecycleBinPanel(container);
    });
  });

  // Action listeners - Download
  container.querySelectorAll('.btn-download-rb').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = getRecycleBin().find(x => x.id === btn.dataset.id);
      if (item && item.dataUrl) {
        const a = document.createElement('a');
        a.href = item.dataUrl;
        a.download = item.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast('Downloading file...', 'success');
      } else {
        showToast('File data not found.', 'error');
      }
    });
  });

  // Action listeners - Purge (Permanently Delete)
  container.querySelectorAll('.btn-delete-rb').forEach(btn => {
    btn.addEventListener('click', () => {
      triggerPurgeConfirm(btn.dataset.id, btn.dataset.type);
    });
  });

  // Helper to trigger purge confirmation
  const triggerPurgeConfirm = (id, type) => {
    const isApp = type === 'application';
    const isEdition = type === 'edition';
    
    let title = 'Permanently Delete File';
    let message = 'Permanently delete this file? <strong style="color:red;">This action cannot be undone.</strong>';
    
    if (isApp) {
      title = 'Permanently Delete Application';
      message = 'Permanently delete this application? All answers and documents will be lost forever. <strong style="color:red;">This action cannot be undone.</strong>';
    } else if (isEdition) {
      title = 'Permanently Delete Edition';
      message = 'Permanently delete this edition? All associated reform areas, questions, applications, and answers will be lost forever. <strong style="color:red;">This action cannot be undone.</strong>';
    } else if (type === 'user') {
      title = 'Permanently Delete User';
      message = 'Permanently delete this user? Their profile data and settings will be lost. <strong style="color:red;">This action cannot be undone.</strong>';
    } else if (type === 'department') {
      title = 'Permanently Delete Department';
      message = 'Permanently delete this department? All department-related bindings will be lost. <strong style="color:red;">This action cannot be undone.</strong>';
    } else if (type === 'reformArea') {
      title = 'Permanently Delete Reform Area';
      message = 'Permanently delete this reform area? All questions and answers bound to it will be lost. <strong style="color:red;">This action cannot be undone.</strong>';
    } else if (type === 'field') {
      title = 'Permanently Delete Action Point';
      message = 'Permanently delete this action point? All user answers bound to it will be lost. <strong style="color:red;">This action cannot be undone.</strong>';
    } else if (type === 'assignment') {
      title = 'Permanently Delete Assignment';
      message = 'Permanently delete this assignment? The user\'s access to the task will be lost forever. <strong style="color:red;">This action cannot be undone.</strong>';
    }

    showConfirm({
      title,
      message,
      type: 'danger',
      confirmText: 'Delete Permanently',
      onConfirm: () => {
        const success = deleteFromRecycleBin(id);
        showToast(success ? 'Deleted permanently.' : 'Failed to delete.', success ? 'success' : 'error');
        if (success) renderRecycleBinPanel(container);
      }
    });
  };
}

